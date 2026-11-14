/**
 * Server-side orchestration: load session → reduce → (model turn + data gate) → save.
 * Route handlers call these; nothing here is UI.
 */
import { randomUUID } from "node:crypto";
import { ReviewActionSchema, type ClientAction, type ReviewResponse } from "./api";
import { buildBlueprint } from "./blueprint";
import { allowed, blocked, reduce, type Action } from "./journey";
import { runChecks } from "./checks";
import { editFlags, gate, scanText } from "./dataRules";
import { knowledgeText } from "./offline";
import { interviewTurn } from "./interviewer";
import { loadKnowledge } from "./knowledge";
import { provider } from "./llm";
import {
  deleteRuns, findSessionIdByReviewId, getBlueprint, getRounds, getSession, saveReviewEvent, saveRunAndSession, saveSession, saveSubmission,
} from "./store";
import { runTests } from "./testRun";
import { refOf } from "./testSummary";
import { cleanKnobs, priceFor, type ModelRole, type Price } from "./scoper";
import type { Blueprint, KnowledgeRef, Level, ReviewView, Session, SlotKey } from "./types";

export interface EngineResult {
  session: Session;
  /** Draft at the blueprint step; the frozen latest version at review and done. */
  blueprint?: Blueprint;
  /** Set when the model call failed; the session is saved and `retry` continues. */
  error?: string;
}

const now = () => new Date().toISOString();

/** Planned models when env doesn't name them (ADR 0005). */
const PLANNED: Record<ModelRole, string> = { cheap: "claude-haiku-4-5", capable: "claude-sonnet-5" };

export type Catalog = Record<ModelRole, { model: string; price?: Price }>;

/** The two configured models with their list prices, for the scope step. */
export function catalog(): Catalog {
  const name = (role: ModelRole) => process.env[role === "cheap" ? "MODEL_CHEAP" : "MODEL_CAPABLE"]?.trim() || PLANNED[role];
  return {
    cheap: { model: name("cheap"), price: priceFor(name("cheap")) },
    capable: { model: name("capable"), price: priceFor(name("capable")) },
  };
}

/** Extra context every API response carries. */
export function meta() {
  return { mode: mode(), catalog: catalog() };
}

export function mode(): string {
  try {
    return provider();
  } catch (e) {
    return `misconfigured: ${(e as Error).message}`;
  }
}

/**
 * The slot the pending text answered, when the question is no longer known (retry): the
 * one requester-filled slot holding that text. None or a tie: undefined, so the text is
 * scanned with commas as clause boundaries (fails closed). The idea has no slot.
 */
export function pendingSlot(s: Session): SlotKey | undefined {
  const hits = s.slots.filter((x) => x.filledBy === "requester" && x.value === s.pending);
  return hits.length === 1 ? hits[0].key : undefined;
}

/**
 * If the requester said something the tool hasn't processed, run one interviewer turn.
 * `slot` is the slot the pending text answers; the data gate scans the never slot differently.
 */
async function advance(s: Session, slot = pendingSlot(s)): Promise<EngineResult> {
  if (s.pending === undefined || !allowed(s).includes("APPLY_TURN")) return { session: s };
  try {
    const { turn, model } = await interviewTurn(s, s.pending);
    const sources = gate(s.pending, turn.sources, s.pushback, slot);
    const next = reduce(s, {
      type: "APPLY_TURN", prefilled: turn.prefilled, sources, question: turn.nextQuestion, by: model, at: now(),
    });
    saveSession(next);
    return { session: next };
  } catch (e) {
    console.error("[interviewer]", e);
    return { session: s, error: e instanceof Error ? e.message : String(e) };
  }
}

export async function startSession(idea: string): Promise<EngineResult> {
  const at = now();
  const s = reduce(
    { id: randomUUID(), step: "idea", idea: "", slots: [], sources: [], asked: 0, knobs: { studentsPerMonth: 2000, convsPerStudent: 2 }, log: [{ at, who: "tool", what: "Session started.", kind: "note" }] },
    { type: "SUBMIT_IDEA", text: idea, at },
  );
  saveSession(s);
  return withBlueprint(await advance(s, undefined)); // the idea answers no slot
}

/**
 * Run the tests (plan-2b BE-10). The full run and the session are saved together. A draft or
 * generation error saves no run: the session gets a "Test run failed" line and the error is returned.
 */
async function runTestsFor(s: Session): Promise<EngineResult> {
  if (!allowed(s).includes("TESTS_RUN")) {
    const next = blocked(s, "TESTS_RUN", now());
    saveSession(next);
    return { session: next };
  }
  try {
    const { run, draft, tests } = await runTests(s);
    const next = reduce(s, { type: "TESTS_RUN", run: refOf(run, tests), draft, tests, at: now() });
    saveRunAndSession(next, run);
    return { session: next };
  } catch (e) {
    console.error("[tests]", e);
    const message = e instanceof Error ? e.message : String(e);
    const next = reduce(s, { type: "TESTS_FAILED", message, at: now() });
    saveSession(next);
    return { session: next, error: message };
  }
}

/**
 * A requester rewrite passes two gates before the reducer accepts it: the data gate (no slot,
 * so it fails closed) and the rewritten test's own deterministic checks.
 */
function rewriteAction(s: Session, testId: number, value: string, at: string): Action {
  const t = s.tests?.find((x) => x.id === testId);
  const checks = t ? runChecks(t.checks, value, { knowledge: knowledgeText(), prompt: t.prompt }) : undefined;
  const checkFail = checks?.results.find((r) => !r.pass)?.reason;
  return { type: "REWRITE_ANSWER", testId, value, flagged: scanText(value), ...(checkFail ? { checkFail } : {}), at };
}

export async function act(id: string, a: ClientAction): Promise<EngineResult | undefined> {
  const s = getSession(id);
  if (!s) return undefined;
  if (a.type === "run_tests") return withBlueprint(await runTestsFor(s));
  if (a.type === "reset" && allowed(s).includes("RESET")) deleteRuns(s.id);

  const at = now();
  const action: Action | undefined =
    a.type === "answer" ? { type: "ANSWER", value: a.value, at }
    : a.type === "edit" ? { type: "EDIT_SLOT", key: a.key, value: a.value, flagged: editFlags(a.key, a.value, s.pushback), at }
    : a.type === "resolve" ? { type: "RESOLVE_PUSHBACK", choice: a.choice, at }
    : a.type === "reset" ? { type: "RESET", at }
    : a.type === "choose_scope" ? { type: "CHOOSE_SCOPE", scope: a.scope, role: a.role, model: catalog()[a.role].model, price: catalog()[a.role].price, knobs: cleanKnobs(a.knobs), at }
    : a.type === "continue" ? { type: "CONTINUE_TO_BLUEPRINT", at }
    : a.type === "reopen_scope" ? { type: "REOPEN_SCOPE", at }
    : a.type === "submit" ? { type: "SUBMIT_FOR_REVIEW", reviewId: randomUUID(), at }
    : a.type === "rewrite_answer" ? rewriteAction(s, a.testId, a.value, at)
    : a.type === "accept_failure" ? { type: "ACCEPT_FAILURE", testId: a.testId, role: a.role, note: a.note, flagged: scanText(a.note), at }
    : undefined;

  const next = action ? reduce(s, action) : s;
  if (next.step === "review" && s.step !== "review" && next.review) {
    // Freeze exactly what the reviewer will see (ADR 0011).
    saveSubmission(next, buildBlueprint(next, knowledgeRefs(), at, { version: next.review.version, draft: false }), at);
    return withBlueprint({ session: next });
  }
  if (next !== s) saveSession(next); // persist the human's input before any model call
  return withBlueprint(await advance(next, a.type === "answer" ? s.question?.slot : pendingSlot(next)));
}

/** Knowledge snapshots as the blueprint lists them. */
function knowledgeRefs(): KnowledgeRef[] {
  return loadKnowledge().map((p) => ({ title: p.title, url: p.url, fetchedAt: p.fetchedAt, level: p.dataLevel as Level }));
}

/** Live draft at the blueprint step; the frozen latest version at review and done; else none. */
export function blueprintFor(s: Session): Blueprint | undefined {
  if (s.step === "blueprint") {
    return buildBlueprint(s, knowledgeRefs(), now(), { version: (s.review?.version ?? 0) + 1, draft: true });
  }
  if ((s.step === "review" || s.step === "done") && s.review) return getBlueprint(s.id, s.review.version);
  return undefined;
}

function withBlueprint(r: EngineResult): EngineResult {
  const blueprint = blueprintFor(r.session);
  return blueprint ? { ...r, blueprint } : r;
}

// --- Reviewer (link = access; the server sets who: "reviewer") ------------------------------

const NOT_FOUND = "This review link doesn't exist.";

function sessionForReview(reviewId: string): Session | undefined {
  const id = findSessionIdByReviewId(reviewId);
  const s = id ? getSession(id) : undefined;
  return s?.review ? s : undefined;
}

/** What the reviewer page shows. Reading it has no side effects. */
export function reviewView(reviewId: string): ReviewView | undefined {
  const s = sessionForReview(reviewId);
  const blueprint = s && getBlueprint(s.id, s.review!.version);
  if (!s || !blueprint) return undefined;
  const rounds = getRounds(s.id);
  const expertMinutes = Math.round(rounds.reduce((sum, r) => sum + (r.minutes ?? 0), 0) * 10) / 10;
  return { reviewId, status: s.review!.status, blueprint, rounds, expertMinutes };
}

const DECIDED: Record<string, string> = {
  approved: "approved", rejected: "rejected", changes: "back with the requester for changes",
};

/**
 * A reviewer action. Version and status are checked first, so a stale tab gets a 404 or
 * 409 and nothing is reduced or saved: no blocked line lands in the requester's log.
 */
export async function reviewAct(reviewId: string, input: unknown): Promise<{ status: 200 | 400 | 404 | 409; body: ReviewResponse }> {
  if (!input || typeof input !== "object" || Array.isArray(input)) return { status: 400, body: { error: "Invalid request." } };
  const parsed = ReviewActionSchema.safeParse(input);
  if (!parsed.success) return { status: 400, body: { error: parsed.error.issues[0]?.message ?? "Invalid action." } };
  const a = parsed.data;
  const s = sessionForReview(reviewId);
  if (!s) return { status: 404, body: { error: NOT_FOUND } };

  const r = s.review!;
  if (a.version !== r.version) {
    return { status: 409, body: { error: `This link now shows v${r.version}, not v${a.version}.`, review: reviewView(reviewId) } };
  }
  if (r.status !== "pending") {
    return { status: 409, body: { error: `v${r.version} is already ${DECIDED[r.status]}.`, review: reviewView(reviewId) } };
  }

  const at = now();
  const next = a.type === "open"
    ? reduce(s, { type: "REVIEW_OPENED", version: a.version, at })
    : reduce(s, { type: "REVIEW_DECISION", version: a.version, status: a.status, note: a.note, at });
  if (next !== s) saveReviewEvent(next, at); // a second open changes nothing
  return { status: 200, body: { review: reviewView(reviewId) } };
}

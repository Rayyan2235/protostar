/**
 * Server-side orchestration: load session → reduce → (model turn + data gate) → save.
 * Route handlers call these; nothing here is UI.
 */
import { randomUUID } from "node:crypto";
import { allowed, reduce, type Action } from "./journey";
import { editFlags, gate } from "./dataRules";
import { interviewTurn } from "./interviewer";
import { provider } from "./llm";
import { getSession, saveSession } from "./store";
import { cleanKnobs, priceFor, type Knobs, type ModelRole, type Price, type ScopeKey } from "./scoper";
import type { PushbackChoice, Session, SlotKey } from "./types";

export type ClientAction =
  | { type: "answer"; value: string }
  | { type: "edit"; key: SlotKey; value: string }
  | { type: "resolve"; choice: PushbackChoice | "keep" }
  | { type: "choose_scope"; scope: ScopeKey; role: ModelRole; knobs: Knobs }
  | { type: "retry" }
  | { type: "reset" };

export interface EngineResult {
  session: Session;
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
  return advance(s, undefined); // the idea answers no slot
}

export async function act(id: string, a: ClientAction): Promise<EngineResult | undefined> {
  const s = getSession(id);
  if (!s) return undefined;

  const at = now();
  const action: Action | undefined =
    a.type === "answer" ? { type: "ANSWER", value: a.value, at }
    : a.type === "edit" ? { type: "EDIT_SLOT", key: a.key, value: a.value, flagged: editFlags(a.key, a.value, s.pushback), at }
    : a.type === "resolve" ? { type: "RESOLVE_PUSHBACK", choice: a.choice, at }
    : a.type === "reset" ? { type: "RESET", at }
    : a.type === "choose_scope" ? { type: "CHOOSE_SCOPE", scope: a.scope, role: a.role, model: catalog()[a.role].model, price: catalog()[a.role].price, knobs: cleanKnobs(a.knobs), at }
    : undefined;

  const next = action ? reduce(s, action) : s;
  if (next !== s) saveSession(next); // persist the human's input before any model call
  return advance(next, a.type === "answer" ? s.question?.slot : pendingSlot(next));
}

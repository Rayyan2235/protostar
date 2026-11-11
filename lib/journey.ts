/**
 * The journey state machine. Pure: no I/O, no clock, no model calls.
 * Callers pass `at` timestamps and already-classified sources in actions.
 *
 * Lifted from the throwaway prototype's `Journey` reducer, with two changes from its
 * feedback: drafting is no longer a separate click, and questions the idea already
 * answers are skipped (prefilled slots).
 *
 * Model output is advice. This file decides what is legal: which slot gets asked,
 * when the interview ends, and when the data gate blocks.
 */
import type {
  Decision, DecisionKind, InterviewTurn, Level, Pushback, PushbackChoice, Question, ReviewDecision, Session, Slot, SlotKey, Source, Step, Who,
} from "./types";
import { SLOT_KEYS } from "./types";
import { SCENARIO } from "./scenario";
import { cleanKnobs, estimate, formatDollars, scopeByKey, type Knobs, type ModelRole, type Price, type ScopeKey } from "./scoper";

export const STEPS: Step[] = ["idea", "interview", "scope", "tests", "blueprint", "review", "done"];

/** Judgment slots: always asked, never prefilled (ADR 0001). */
export const REQUIRED = ["never", "examples", "handoff"] as const satisfies readonly SlotKey[];
export const PREFILLABLE = ["users", "top", "sources"] as const satisfies readonly SlotKey[];
const isRequired = (k: SlotKey) => (REQUIRED as readonly SlotKey[]).includes(k);
export const MIN_QUESTIONS = 3;
export const MAX_QUESTIONS = 6;
/** Prefills below this confidence are still asked. */
export const PREFILL_THRESHOLD = 0.6;

/** Used when the model's proposed question is missing or not legal. */
export const FALLBACK_QUESTIONS: Record<SlotKey, string> = {
  users: "Who will use this, and when?",
  top: "What are the top questions they ask you? Give me up to five.",
  never: "What must it never do?",
  examples: "Show me one great answer and one bad answer to the same question.",
  sources: "Where does the truth live? What should it read from?",
  handoff: "When should it stop and send the student to you?",
};


export type Action =
  | { type: "SUBMIT_IDEA"; text: string; at: string }
  | { type: "APPLY_TURN"; prefilled: InterviewTurn["prefilled"]; sources: Source[]; question?: Question; by?: string; at: string }
  | { type: "ANSWER"; value: string; at: string }
  /** `flagged` = editFlags(key, value, s.pushback), filled by the engine. Non-empty = refused. */
  | { type: "EDIT_SLOT"; key: SlotKey; value: string; flagged: Source[]; at: string }
  | { type: "RESOLVE_PUSHBACK"; choice: PushbackChoice | "keep"; at: string }
  | { type: "CHOOSE_SCOPE"; scope: ScopeKey; role: ModelRole; model: string; price?: Price; knobs: Knobs; at: string }
  | { type: "CONTINUE_TO_BLUEPRINT"; at: string }
  | { type: "REOPEN_SCOPE"; at: string }
  /** The engine always passes a fresh id; the reducer keeps the existing one on resubmit. */
  | { type: "SUBMIT_FOR_REVIEW"; reviewId: string; at: string }
  | { type: "REVIEW_OPENED"; version: number; at: string }
  | { type: "REVIEW_DECISION"; version: number; status: ReviewDecision; note?: string; at: string }
  | { type: "RESET"; at: string };

export function initial(id: string, at: string): Session {
  return {
    id, step: "idea", idea: "", slots: [], sources: [], asked: 0,
    knobs: { studentsPerMonth: 2000, convsPerStudent: 2 },
    log: [{ at, who: "tool", what: "Session started.", kind: "note" }],
  };
}

const entry = (at: string, who: Who, what: string, kind: DecisionKind): Decision => ({ at, who, what, kind });
const say = (s: Session, at: string, who: Who, what: string, kind: DecisionKind): Decision[] => [...s.log, entry(at, who, what, kind)];
const slot = (s: Session, key: SlotKey) => s.slots.find((x) => x.key === key);
const blocking = (s: Session) => !!s.pushback?.blocking;

export function allowed(s: Session): Action["type"][] {
  // Once submitted, a reviewer may have seen it: the log can't be wiped.
  const reset: Action["type"][] = s.review ? [] : ["RESET"];
  switch (s.step) {
    case "idea":
      return ["SUBMIT_IDEA", ...reset];
    case "interview":
      if (blocking(s)) return ["RESOLVE_PUSHBACK", ...reset];
      return s.question ? ["ANSWER", "EDIT_SLOT", ...reset] : ["APPLY_TURN", "EDIT_SLOT", ...reset];
    case "scope":
      return ["CHOOSE_SCOPE", ...reset];
    case "tests":
      return ["CONTINUE_TO_BLUEPRINT", "REOPEN_SCOPE", ...reset]; // Phase 2b adds its run action here
    case "blueprint":
      return ["EDIT_SLOT", "REOPEN_SCOPE", "SUBMIT_FOR_REVIEW", ...reset];
    case "review":
      return ["REVIEW_OPENED", "REVIEW_DECISION"];
    case "done":
      return [];
  }
}

/** Slots that still need a requester answer, in interview order. */
export function missingSlots(s: Session): SlotKey[] {
  return SLOT_KEYS.filter((key) => {
    const v = slot(s, key);
    if (!v || !v.value.trim()) return true;
    if (isRequired(key)) return v.filledBy !== "requester";
    return v.filledBy === "prefill" && (v.confidence ?? 0) < PREFILL_THRESHOLD;
  });
}

/**
 * Pick the next question. The model may choose the order and wording, but only among
 * missing slots, and never in a way that leaves a judgment slot unasked when the
 * question budget runs out. Returns undefined when the interview is complete.
 */
export function nextQuestion(s: Session, proposed?: Question): Question | undefined {
  const missing = missingSlots(s);
  const budget = MAX_QUESTIONS - s.asked;
  if (budget <= 0) return undefined;
  if (missing.length === 0) return undefined; // asked >= MIN is guaranteed: REQUIRED has 3 slots

  const requiredMissing = missing.filter(isRequired);
  const mustAskRequired = budget <= requiredMissing.length;
  const legal = mustAskRequired ? requiredMissing : missing;

  if (proposed && legal.includes(proposed.slot) && proposed.ask.trim()) {
    return { slot: proposed.slot, ask: proposed.ask.trim(), chips: proposed.chips.filter((c) => c.trim()).slice(0, 3) };
  }
  const key = legal[0];
  return { slot: key, ask: FALLBACK_QUESTIONS[key], chips: [] };
}

function upsertSlot(slots: Slot[], next: Slot): Slot[] {
  return slots.some((x) => x.key === next.key) ? slots.map((x) => (x.key === next.key ? next : x)) : [...slots, next];
}

const sameSource = (a: string, b: string) => a.trim().toLowerCase() === b.trim().toLowerCase();

export function levelLabel(level: Level) {
  return ["", "Level 1 · Public", "Level 2 · Internal", "Level 3 · High (FERPA student records)", "Level 4 · Restricted"][level];
}

/**
 * Set the next question and log it. While the data gate blocks, the question is kept
 * but not shown or logged; RESOLVE_PUSHBACK shows it.
 */
function ask(s: Session, at: string, proposed?: Question): Session {
  const question = nextQuestion(s, proposed);
  if (!question) return { ...s, question: undefined };
  if (blocking(s)) return { ...s, question };
  return { ...s, question, log: say(s, at, "tool", question.ask, "question") };
}

/** Move to scope if nothing is left to ask; otherwise leave the interview waiting. */
function maybeFinish(s: Session, at: string): Session {
  if (blocking(s) || s.question || s.pending) return s;
  if (nextQuestion(s) === undefined && missingSlots(s).filter(isRequired).length === 0) {
    const pre = s.slots.filter((x) => x.filledBy === "prefill").map((x) => x.key);
    return {
      ...s, step: "scope",
      log: say(s, at, "tool", `Interview done after ${s.asked} answers. Prefilled: ${pre.join(", ") || "none"}.`, "done"),
    };
  }
  return s;
}

export function reduce(s: Session, a: Action): Session {
  if (!allowed(s).includes(a.type)) {
    return { ...s, log: say(s, a.at, "tool", `Blocked: "${a.type}" isn't possible at this step.`, "blocked") };
  }

  switch (a.type) {
    case "SUBMIT_IDEA": {
      const text = a.text.trim();
      if (!text) return s;
      return { ...s, step: "interview", idea: text, pending: text, log: say(s, a.at, "requester", text, "idea") };
    }

    case "APPLY_TURN": {
      let log = s.log;
      let slots = s.slots;
      if (a.by) log = [...log, entry(a.at, "tool", `Interviewer turn by ${a.by}.`, "note")];

      for (const p of a.prefilled) {
        if (!(PREFILLABLE as readonly SlotKey[]).includes(p.key) || !p.value.trim()) continue; // judgment slots are never prefilled
        if (slots.find((x) => x.key === p.key)?.filledBy === "requester") continue; // never overwrite the human
        slots = upsertSlot(slots, { key: p.key, value: p.value.trim(), filledBy: "prefill", confidence: p.confidence });
        log = [...log, entry(a.at, "tool", `Prefilled ${p.key} (confidence ${p.confidence.toFixed(2)}): ${p.value.trim()}`, "prefill")];
      }

      const added = a.sources
        .filter((src) => !s.sources.some((x) => sameSource(x.name, src.name)))
        .filter((src, i, arr) => arr.findIndex((y) => sameSource(y.name, src.name)) === i);
      for (const src of added) {
        log = [...log, entry(a.at, "tool", `Source "${src.name}" → ${levelLabel(src.level)}, decided by ${src.decidedBy}: ${src.reason}`, "source")];
      }

      let pushback = s.pushback;
      const flagged = added.filter((src) => src.level >= 3);
      if (flagged.length) {
        pushback = {
          blocking: true,
          flagged: flagged.map((f) => f.name),
          flaggedRules: [...(s.pushback?.flaggedRules ?? []), ...flagged.flatMap((f) => (f.ruleId ? [f.ruleId] : []))],
          options: ["selfreport", "route"],
          attempts: 0,
          flaggedSources: [...(s.pushback?.flaggedSources ?? []), ...flagged],
        } satisfies Pushback;
        log = [...log, entry(a.at, "tool",
          `Flag: ${flagged.map((f) => `"${f.name}" is ${levelLabel(f.level)}`).join("; ")}. ${SCENARIO.pushback.limit}`, "flag")];
      }

      const next: Session = { ...s, slots, sources: [...s.sources, ...added], pushback, pending: undefined, log };
      return maybeFinish(ask(next, a.at, a.question), a.at);
    }

    case "ANSWER": {
      const q = s.question!;
      const value = a.value.trim();
      if (!value) return s;
      return {
        ...s,
        slots: upsertSlot(s.slots, { key: q.slot, value, filledBy: "requester" }),
        asked: s.asked + 1,
        question: undefined,
        pending: value,
        log: say(s, a.at, "requester", value, "answer"),
      };
    }

    case "EDIT_SLOT": {
      if (a.flagged.length) {
        return {
          ...s,
          log: say(s, a.at, "tool",
            `Edits can't include Level 3–4 data: ${a.flagged.map((f) => f.name).join(", ")}. ${SCENARIO.pushback.limit}`, "blocked"),
        };
      }
      const value = a.value.trim();
      if (!value) return s;
      const next: Session = {
        ...s,
        slots: upsertSlot(s.slots, { key: a.key, value, filledBy: "requester" }),
        log: say(s, a.at, "requester", `Edited ${a.key}: ${value}`, "edit"),
      };
      // Only the interview can finish; at the blueprint an edit would otherwise jump to scope.
      return s.step === "interview" ? maybeFinish(next, a.at) : next;
    }

    case "RESOLVE_PUSHBACK": {
      const pb = s.pushback!;
      if (a.choice === "keep") {
        return {
          ...s, pushback: { ...pb, attempts: pb.attempts + 1 },
          log: say(s, a.at, "tool", SCENARIO.pushback.keepAnywayReply, "blocked"),
        };
      }
      // The resulting rule lives on the pushback (SCENARIO.pushback.options[choice].rule), not in the
      // requester's slots, so a later answer can't overwrite it.
      const sources = s.sources.filter((src) => src.level < 3);
      if (a.choice === "selfreport") sources.push(SCENARIO.pushback.selfReportSource);
      const what = SCENARIO.pushback.options[a.choice].logLine;
      const next: Session = {
        ...s, sources, question: undefined,
        pushback: { ...pb, blocking: false, choice: a.choice },
        log: say(s, a.at, "requester", what, "resolve"),
      };
      return maybeFinish(ask(next, a.at, s.question), a.at);
    }

    case "CHOOSE_SCOPE": {
      const knobs = cleanKnobs(a.knobs);
      const sc = scopeByKey(a.scope);
      const est = a.price ? estimate(a.scope, a.price, knobs) : undefined;
      const cost = est
        ? `est. ${formatDollars(est.monthlyDollars)}/month for ${knobs.studentsPerMonth.toLocaleString("en-US")} students × ${knobs.convsPerStudent} conversations (list prices ${est.pricesAsOf})`
        : "no price on file for this model, so no estimate";
      return {
        ...s, step: "tests", scope: a.scope, knobs, model: { role: a.role, name: a.model }, estimate: est,
        log: say(s, a.at, "requester", `Scope: ${sc.label} (risk ${sc.risk}) on ${a.price?.name ?? a.model}; ${cost}.`, "scope"),
      };
    }

    case "CONTINUE_TO_BLUEPRINT":
      return {
        ...s, step: "blueprint",
        log: say(s, a.at, "requester", "Continued to the blueprint. Tests not run: the test run needs live models.", "blueprint"),
      };

    case "REOPEN_SCOPE": // scope, model, knobs and estimate stay until re-chosen
      return { ...s, step: "scope", log: say(s, a.at, "requester", "Reopened the scope.", "note") };

    case "SUBMIT_FOR_REVIEW": {
      const version = (s.review?.version ?? 0) + 1;
      return {
        ...s, step: "review",
        review: { reviewId: s.review?.reviewId ?? a.reviewId, version, status: "pending", submittedAt: a.at },
        log: say(s, a.at, "requester", `Submitted blueprint v${version} for review.`, "submit"),
      };
    }

    case "REVIEW_OPENED": {
      const r = s.review;
      if (!r || a.version !== r.version || r.status !== "pending" || r.openedAt) return s;
      return { ...s, review: { ...r, openedAt: a.at }, log: say(s, a.at, "reviewer", `Opened blueprint v${r.version}.`, "review") };
    }

    case "REVIEW_DECISION": {
      const r = s.review;
      if (!r || a.version !== r.version || r.status !== "pending") {
        const latest = r ? `v${r.version} is ${r.status}` : "nothing was submitted";
        return { ...s, log: say(s, a.at, "tool", `Blocked: decision on v${a.version}, but ${latest}.`, "blocked") };
      }
      const what = a.status === "approved" ? `Approved v${r.version}.`
        : a.status === "changes" ? `Requested changes on v${r.version}: ${a.note ?? ""}`
        : `Rejected v${r.version}: ${a.note ?? ""}`;
      return {
        ...s,
        step: a.status === "changes" ? "blueprint" : "done",
        review: { ...r, status: a.status, decidedAt: a.at, openedAt: r.openedAt ?? a.at, ...(a.note ? { note: a.note } : {}) },
        log: say(s, a.at, "reviewer", what, "review"),
      };
    }

    case "RESET":
      return initial(s.id, a.at);
  }
  return s;
}

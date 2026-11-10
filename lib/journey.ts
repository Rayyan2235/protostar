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
  Decision, DecisionKind, InterviewTurn, Level, Pushback, PushbackChoice, Question, Session, Slot, SlotKey, Source, Step, Who,
} from "./types";

export const STEPS: Step[] = ["idea", "interview", "scope", "tests", "blueprint", "review", "done"];

/** Natural interview order. */
export const SLOT_ORDER: SlotKey[] = ["users", "top", "never", "examples", "sources", "handoff"];
/** Judgment slots: always asked, never prefilled (ADR 0001). */
export const REQUIRED: SlotKey[] = ["never", "examples", "handoff"];
export const PREFILLABLE: SlotKey[] = ["users", "top", "sources"];
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

export const SELF_REPORT_SOURCE: Source = {
  name: "Student self-reports GPA and credits in the chat (not stored)",
  level: 1,
  decidedBy: "rule",
  reason: "Nothing is read from university records or kept after the conversation.",
};

/** The rule each pushback choice adds to the drafted agent. */
export const PUSHBACK_RULES: Record<PushbackChoice, string> = {
  selfreport: "Never ask for, read, or store student records. Use only the GPA and credits the student states in the chat, and say the answer depends on them.",
  route: "Never read pasted records. Questions about a specific student's record go to an advising appointment.",
};

export type Action =
  | { type: "SUBMIT_IDEA"; text: string; at: string }
  | { type: "APPLY_TURN"; prefilled: InterviewTurn["prefilled"]; sources: Source[]; question?: Question; by?: string; at: string }
  | { type: "ANSWER"; value: string; at: string }
  | { type: "EDIT_SLOT"; key: SlotKey; value: string; at: string }
  | { type: "RESOLVE_PUSHBACK"; choice: PushbackChoice | "keep"; at: string }
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
  switch (s.step) {
    case "idea":
      return ["SUBMIT_IDEA", "RESET"];
    case "interview":
      if (blocking(s)) return ["RESOLVE_PUSHBACK", "RESET"];
      return s.question ? ["ANSWER", "EDIT_SLOT", "RESET"] : ["APPLY_TURN", "EDIT_SLOT", "RESET"];
    default:
      return ["RESET"]; // later phases add their actions here
  }
}

/** Slots that still need a requester answer, in interview order. */
export function missingSlots(s: Session): SlotKey[] {
  return SLOT_ORDER.filter((key) => {
    const v = slot(s, key);
    if (!v || !v.value.trim()) return true;
    if (REQUIRED.includes(key)) return v.filledBy !== "requester";
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

  const requiredMissing = missing.filter((k) => REQUIRED.includes(k));
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
  if (nextQuestion(s) === undefined && missingSlots(s).filter((k) => REQUIRED.includes(k)).length === 0) {
    const pre = s.slots.filter((x) => x.filledBy === "prefill").map((x) => x.key);
    return {
      ...s, step: "scope",
      log: say(s, at, "tool", `Interview done after ${s.asked} answers. Prefilled: ${pre.join(", ") || "none"}.`, "done"),
    };
  }
  return s;
}

export function reduce(s: Session, a: Action): Session {
  if (a.type === "RESET") return initial(s.id, a.at);
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
        if (!PREFILLABLE.includes(p.key) || !p.value.trim()) continue; // judgment slots are never prefilled
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
        } satisfies Pushback;
        log = [...log, entry(a.at, "tool",
          `Flag: ${flagged.map((f) => `"${f.name}" is ${levelLabel(f.level)}`).join("; ")}. AI Studio allows Levels 1–2 only.`, "flag")];
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
      const value = a.value.trim();
      if (!value) return s;
      return maybeFinish({
        ...s,
        slots: upsertSlot(s.slots, { key: a.key, value, filledBy: "requester" }),
        log: say(s, a.at, "requester", `Edited ${a.key}: ${value}`, "edit"),
      }, a.at);
    }

    case "RESOLVE_PUSHBACK": {
      const pb = s.pushback!;
      if (a.choice === "keep") {
        return {
          ...s, pushback: { ...pb, attempts: pb.attempts + 1 },
          log: say(s, a.at, "tool",
            "Can't continue with Level 3–4 data in a self-serve agent. It would need a data steward and a Platform Agent review. Pick (a) or (b).", "blocked"),
        };
      }
      // The resulting rule lives on the pushback (see PUSHBACK_RULES), not in the
      // requester's slots, so a later answer can't overwrite it.
      const sources = s.sources.filter((src) => src.level < 3);
      if (a.choice === "selfreport") sources.push(SELF_REPORT_SOURCE);
      const what = a.choice === "selfreport"
        ? "Chose (a): students self-report GPA and credits; nothing stored."
        : "Chose (b): no records; route record questions to an advising appointment.";
      const next: Session = {
        ...s, sources, question: undefined,
        pushback: { ...pb, blocking: false, choice: a.choice },
        log: say(s, a.at, "requester", what, "resolve"),
      };
      return maybeFinish(ask(next, a.at, s.question), a.at);
    }
  }
  return s;
}

/**
 * Server-side orchestration: load session → reduce → (model turn + data gate) → save.
 * Route handlers call these; nothing here is UI.
 */
import { randomUUID } from "node:crypto";
import { allowed, reduce, type Action } from "./journey";
import { gate } from "./dataRules";
import { interviewTurn } from "./interviewer";
import { provider } from "./llm";
import { getSession, saveSession } from "./store";
import type { PushbackChoice, Session, SlotKey } from "./types";

export type ClientAction =
  | { type: "answer"; value: string }
  | { type: "edit"; key: SlotKey; value: string }
  | { type: "resolve"; choice: PushbackChoice | "keep" }
  | { type: "retry" }
  | { type: "reset" };

export interface EngineResult {
  session: Session;
  /** Set when the model call failed; the session is saved and `retry` continues. */
  error?: string;
}

const now = () => new Date().toISOString();

export function mode(): string {
  try {
    return provider();
  } catch (e) {
    return `misconfigured: ${(e as Error).message}`;
  }
}

/** If the requester said something the tool hasn't processed, run one interviewer turn. */
async function advance(s: Session): Promise<EngineResult> {
  if (s.pending === undefined || !allowed(s).includes("APPLY_TURN")) return { session: s };
  try {
    const { turn, model } = await interviewTurn(s, s.pending);
    const sources = gate(s.pending, turn.sources, s.pushback);
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
  return advance(s);
}

export async function act(id: string, a: ClientAction): Promise<EngineResult | undefined> {
  const s = getSession(id);
  if (!s) return undefined;

  const at = now();
  const action: Action | undefined =
    a.type === "answer" ? { type: "ANSWER", value: a.value, at }
    : a.type === "edit" ? { type: "EDIT_SLOT", key: a.key, value: a.value, at }
    : a.type === "resolve" ? { type: "RESOLVE_PUSHBACK", choice: a.choice, at }
    : a.type === "reset" ? { type: "RESET", at }
    : undefined;

  const next = action ? reduce(s, action) : s;
  if (next !== s) saveSession(next); // persist the human's input before any model call
  return advance(next);
}

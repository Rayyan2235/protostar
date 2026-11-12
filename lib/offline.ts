/**
 * Offline fixtures (ADR 0013): deterministic raw model output, in each schema's input
 * shape. complete() parses them with the same schema as real output, and callers map them
 * with the same mapper, so offline mode exercises the real path. Server-only, pure
 * functions of their input. No student data: records and IDs are placeholders.
 */
import type { z } from "zod";
import { FALLBACK_QUESTIONS, missingSlots } from "./journey";
import { loadKnowledge } from "./knowledge";
import type { TurnSchema } from "./schemas";
import type { Session, SlotKey } from "./types";

/** Answer chips the offline interviewer offers for each slot. */
const OFFLINE_CHIPS: Record<SlotKey, string[]> = {
  users: ["Sophomores in Smeal pre-major", "Students outside Smeal thinking of Finance"],
  top: ["What GPA do I need?", "Which courses come first?", "When can I apply?"],
  never: ["Promise someone gets in", "Tell a student what to drop", "Look up a student's record"],
  examples: ["Great: the published minimum + next steps. Bad: \"Yes, you qualify!\""],
  sources: ["The bulletin + Smeal change-of-major page", "Plus students paste their degree audit"],
  handoff: ["Appeals", "Medical or special circumstances", "Anything about a specific record"],
};

/**
 * The offline interviewer's turn. The first turn prefills users, sources and top (top below
 * the prefill threshold, so it is still asked) and names the knowledge pages; every turn asks
 * the first missing slot.
 */
export function offlineTurnRaw(s: Session): z.input<typeof TurnSchema> {
  const first = s.asked === 0 && s.slots.length === 0;
  const prefilled = first
    ? [
        { key: "users" as const, value: "Students considering a change of major into Finance", confidence: 0.8 },
        { key: "sources" as const, value: "Finance B.S. bulletin page; Smeal change-of-major page", confidence: 0.8 },
        { key: "top" as const, value: "Minimum GPA; required entrance courses; credit window", confidence: 0.5 },
      ]
    : [];
  const sources = first
    ? loadKnowledge().map((p) => ({ name: p.title, url: p.url, suggestedLevel: 1, reason: "Public page" }))
    : [];
  const after = { ...s, slots: [...s.slots, ...prefilled.map((p) => ({ ...p, filledBy: "prefill" as const }))] };
  const slot = missingSlots(after)[0];
  return {
    prefilled,
    sources,
    nextQuestion: slot ? { slot, ask: FALLBACK_QUESTIONS[slot], chips: OFFLINE_CHIPS[slot] } : null,
  };
}

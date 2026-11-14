/**
 * One zod schema per model output (ADR 0013). Callers pass these to complete(), and the
 * offline fixtures in lib/offline.ts are parsed with the same schema, so offline output
 * goes through the real path. Browser-safe: zod and types only.
 */
import { z } from "zod";
import { SLOT_KEYS } from "./types";
import { PREFILLABLE } from "./journey";

/** The `source` of every draft, column and verdict made in offline mode. Never evidence. */
export const OFFLINE_SOURCE = "offline-script";

const SLOT = z.enum(SLOT_KEYS);

export const TurnSchema = z.object({
  prefilled: z.array(z.object({
    key: z.enum(PREFILLABLE),
    value: z.string(),
    confidence: z.number().describe("0 to 1. Use 0.8+ only when the idea or pages clearly answer it."),
  })),
  sources: z.array(z.object({
    name: z.string().describe("The source as the requester described it"),
    url: z.string().nullable(),
    suggestedLevel: z.number().describe("Penn State data level: 1, 2, 3 or 4"),
    reason: z.string(),
  })).describe("Only sources named in the requester's latest message that the agent would read from. Empty if none."),
  nextQuestion: z.object({
    slot: SLOT,
    ask: z.string().describe("One short, plain-language question"),
    chips: z.array(z.string()).describe("2-3 short example answers the requester can tap"),
  }).nullable(),
});

export const DraftOutputSchema = z.object({
  instructions: z.string().describe("The agent's system instructions. Keep the requester's never-do, example and hand-off wording verbatim."),
});

export const TestsOutputSchema = z.object({
  tests: z.array(z.object({
    prompt: z.string().describe("What a student would type. Placeholders like [student ID], never real data."),
    mustInclude: z.array(z.string()),
    mustNot: z.array(z.string()),
    from: z.enum(["top", "never", "example", "handoff"]),
  })),
});

export const AnswerOutputSchema = z.object({ answer: z.string() });

export const JudgeOutputSchema = z.object({
  pass: z.boolean(),
  reason: z.string().describe("One sentence a staff member understands."),
  missing: z.array(z.string()).describe("mustInclude items the answer lacks"),
  violated: z.array(z.string()).describe("mustNot items the answer contains"),
});

export type TurnOutput = z.infer<typeof TurnSchema>;
export type DraftOutput = z.infer<typeof DraftOutputSchema>;
export type TestsOutput = z.infer<typeof TestsOutputSchema>;
export type AnswerOutput = z.infer<typeof AnswerOutputSchema>;
export type JudgeOutput = z.infer<typeof JudgeOutputSchema>;

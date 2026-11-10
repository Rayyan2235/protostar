/**
 * The interviewer (ADR 0001). One structured call per turn: given the idea, the answers
 * so far and the knowledge pages, it proposes prefills, extracts the sources the requester
 * named, and words the next question with 2–3 answer chips.
 *
 * Its output is advice. journey.ts decides which slot is asked and when the interview
 * ends; dataRules.ts decides data levels for every source a rule recognises.
 */
import { z } from "zod";
import { complete, provider } from "./llm";
import { FALLBACK_QUESTIONS, REQUIRED, missingSlots } from "./journey";
import { loadKnowledge } from "./knowledge";
import type { InterviewTurn, Level, Session, SlotKey } from "./types";

const SLOT = z.enum(["users", "top", "never", "examples", "sources", "handoff"]);

export const TurnSchema = z.object({
  prefilled: z.array(z.object({
    key: z.enum(["users", "top", "sources"]),
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

const SLOT_MEANING: Record<SlotKey, string> = {
  users: "who will use the agent, and when",
  top: "the top questions those users ask (up to five)",
  never: "what the agent must never do",
  examples: "one great answer and one bad answer to the same question",
  sources: "where the truth lives: what the agent should read from",
  handoff: "when the agent should stop and send the person to a human",
};

function system(): string {
  const pages = loadKnowledge()
    .map((p) => `<page title="${p.title}" url="${p.url}" fetched="${p.fetchedAt}">\n${p.text}\n</page>`)
    .join("\n\n");
  return `You interview a university staff member who wants an AI agent built for students. You do not design the agent for them. You ask a few sharp questions so their judgment shapes it, and you fill in only what is obvious.

The six things the spec needs:
${(Object.keys(SLOT_MEANING) as SlotKey[]).map((k) => `- ${k}: ${SLOT_MEANING[k]}`).join("\n")}

Rules:
- Prefill only users, top and sources, and only when the idea or the pages below clearly answer them. Never prefill ${REQUIRED.join(", ")}: those are the requester's judgment.
- In "sources", list only data sources named in the requester's latest message that the agent would read from. Suggest a Penn State data level: 1 public, 2 internal, 3 student records/PII (FERPA), 4 restricted (SSN, health, financial accounts). A rules table makes the final call; your level is used only for sources it doesn't recognise.
- Ask about exactly one of the slots listed as missing. Prefer the order given. Keep the question under 20 words, warm and concrete, in the requester's terms.
- Chips are 2-3 short example answers grounded in the pages (real course names, real deadlines, real situations). They are suggestions, not the answer.
- Never invent policy. If the pages don't say something, don't claim it.

Public pages the agent will answer from:
${pages}`;
}

function userMessage(s: Session, latest: string): string {
  const missing = missingSlots(s);
  return JSON.stringify({
    idea: s.idea,
    answersSoFar: s.slots.map((x) => ({ key: x.key, value: x.value, filledBy: x.filledBy })),
    knownSources: s.sources.map((x) => ({ name: x.name, level: x.level })),
    questionsAsked: s.asked,
    missingSlots: missing,
    requesterLatestMessage: latest,
  }, null, 2);
}

const clampLevel = (n: number): Level => Math.min(4, Math.max(1, Math.round(n))) as Level;
const clamp01 = (n: number) => Math.min(1, Math.max(0, n));

export interface TurnResult {
  turn: InterviewTurn;
  model: string;
  offline: boolean;
}

/** Ask the model for the next turn. `latest` is the requester's newest text (idea or answer). */
export async function interviewTurn(s: Session, latest: string): Promise<TurnResult> {
  if (provider() === "offline") return { turn: offlineTurn(s), model: "offline-script", offline: true };

  const { data, model } = await complete({
    model: "capable",
    schema: TurnSchema,
    maxTokens: 2000,
    system: system(),
    messages: [{ role: "user", content: userMessage(s, latest) }],
  });
  return {
    model,
    offline: false,
    turn: {
      prefilled: data.prefilled.map((p) => ({ ...p, confidence: clamp01(p.confidence) })),
      sources: data.sources.map((x) => ({ name: x.name, url: x.url ?? undefined, suggestedLevel: clampLevel(x.suggestedLevel), reason: x.reason })),
      nextQuestion: data.nextQuestion ?? undefined,
      done: data.nextQuestion == null,
    },
  };
}

/**
 * Offline mode (LLM_PROVIDER=offline): a fixed script so the UI and the data gate can be
 * exercised without model access. The UI labels it. Not used for the demo.
 */
const OFFLINE_CHIPS: Record<SlotKey, string[]> = {
  users: ["Sophomores in Smeal pre-major", "Students outside Smeal thinking of Finance"],
  top: ["What GPA do I need?", "Which courses come first?", "When can I apply?"],
  never: ["Promise someone gets in", "Tell a student what to drop", "Look up a student's record"],
  examples: ["Great: the published minimum + next steps. Bad: \"Yes, you qualify!\""],
  sources: ["The bulletin + Smeal change-of-major page", "Plus students paste their degree audit"],
  handoff: ["Appeals", "Medical or special circumstances", "Anything about a specific record"],
};

export function offlineTurn(s: Session): InterviewTurn {
  const first = s.asked === 0 && s.slots.length === 0;
  const prefilled: InterviewTurn["prefilled"] = first
    ? [
        { key: "users", value: "Students considering a change of major into Finance", confidence: 0.8 },
        { key: "sources", value: "Finance B.S. bulletin page; Smeal change-of-major page", confidence: 0.8 },
        { key: "top", value: "Minimum GPA; required entrance courses; credit window", confidence: 0.5 },
      ]
    : [];
  const sources: InterviewTurn["sources"] = first
    ? loadKnowledge().map((p) => ({ name: p.title, url: p.url, suggestedLevel: 1 as Level, reason: "Public page" }))
    : [];
  const after = { ...s, slots: [...s.slots, ...prefilled.map((p) => ({ ...p, filledBy: "prefill" as const }))] };
  const slot = missingSlots(after)[0];
  return {
    prefilled,
    sources,
    nextQuestion: slot ? { slot, ask: FALLBACK_QUESTIONS[slot], chips: OFFLINE_CHIPS[slot] } : undefined,
    done: !slot,
  };
}

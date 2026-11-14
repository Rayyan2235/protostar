/**
 * The interviewer (ADR 0001). One structured call per turn: given the idea, the answers
 * so far and the knowledge pages, it proposes prefills, extracts the sources the requester
 * named, and words the next question with 2–3 answer chips.
 *
 * Its output is advice. journey.ts decides which slot is asked and when the interview
 * ends; dataRules.ts decides data levels for every source a rule recognises.
 */
import { complete } from "./llm";
import { offlineTurnRaw } from "./offline";
import { OFFLINE_SOURCE, TurnSchema, type TurnOutput } from "./schemas";
import { REQUIRED, missingSlots } from "./journey";
import { loadKnowledge } from "./knowledge";
import { SLOT_KEYS, type InterviewTurn, type Level, type Session, type SlotKey } from "./types";

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
${SLOT_KEYS.map((k) => `- ${k}: ${SLOT_MEANING[k]}`).join("\n")}

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

/** Maps TurnSchema output, real or offline, to a turn. Clamps confidence to 0-1 and levels to 1-4. */
export function toTurn(data: TurnOutput): InterviewTurn {
  return {
    prefilled: data.prefilled.map((p) => ({ ...p, confidence: clamp01(p.confidence) })),
    sources: data.sources.map((x) => ({ name: x.name, url: x.url ?? undefined, suggestedLevel: clampLevel(x.suggestedLevel), reason: x.reason })),
    nextQuestion: data.nextQuestion ?? undefined,
    done: data.nextQuestion == null,
  };
}

/**
 * Ask the model for the next turn. `latest` is the requester's newest text (idea or answer).
 * In offline mode complete() returns the scripted turn, parsed and mapped the same way.
 */
export async function interviewTurn(s: Session, latest: string): Promise<TurnResult> {
  const { data, model } = await complete({
    model: "capable",
    schema: TurnSchema,
    maxTokens: 2000,
    system: system(),
    messages: [{ role: "user", content: userMessage(s, latest) }],
    offline: () => offlineTurnRaw(s),
  });
  return { model, offline: model === OFFLINE_SOURCE, turn: toTurn(data) };
}

/**
 * The runner (plan-2b BE-10): one test prompt to one model role. The system prompt is the
 * draft instructions plus the knowledge snapshot text. Server-only. Throws LLMError when the
 * model call fails; the run turns that into an answer-error verdict (ADR 0014 §3).
 */
import { complete } from "./llm";
import { knowledgeText, offlineAnswerRaw } from "./offline";
import { AnswerOutputSchema } from "./schemas";
import type { Draft, Role2, Test } from "./types";

export function answerSystem(d: Draft): string {
  return `${d.instructions}

Answer the student in plain language, from these public pages only:

${knowledgeText()}`;
}

export async function answer(t: Test, d: Draft, role: Role2): Promise<{ answer: string; source: string }> {
  const { data, model } = await complete({
    model: role,
    schema: AnswerOutputSchema,
    maxTokens: 1500,
    system: answerSystem(d),
    messages: [{ role: "user", content: t.prompt }],
    offline: () => offlineAnswerRaw(t, d, role),
  });
  return { answer: data.answer, source: model };
}

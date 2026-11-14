/**
 * The drafter (plan-2b BE-9): one model call turns the requester's answers into agent
 * instructions. The requester's never-do, example and hand-off wording is kept verbatim,
 * and every requester test is appended as a worked example on every draft, so clearing a
 * draft never loses a rewrite (ADR 0014 §5). Server-only.
 */
import { complete } from "./llm";
import { loadKnowledge } from "./knowledge";
import { offlineDraftRaw } from "./offline";
import { SCENARIO } from "./scenario";
import { scopeByKey } from "./scoper";
import { DraftOutputSchema, type DraftOutput } from "./schemas";
import { SLOT_KEYS, SLOT_LABELS, type Draft, type Session } from "./types";

/** Draft from model output (real or offline) plus the requester's worked examples. */
export function toDraft(o: DraftOutput, source: string, at: string, examples: Draft["examples"]): Draft {
  const block = examples.length
    ? `\n\nWorked examples from the requester:\n${examples.map((e) => `Q: ${e.prompt}\nA: ${e.answer}`).join("\n")}`
    : "";
  return { instructions: `${o.instructions}${block}`, source, at, examples };
}

const SYSTEM = `You write the system instructions for an AI agent a university staff member is building for students.
- Use only what the requester gave you and the listed public pages. Never invent a policy, a number or a rule.
- Keep the requester's "must never", example and hand-off wording verbatim.
- Include the data rule exactly as given.
- The agent answers only from the listed pages and never asks for or stores student records.
Return the instructions as plain text the agent will read.`;

function userMessage(s: Session): string {
  const slot = (k: (typeof SLOT_KEYS)[number]) => s.slots.find((x) => x.key === k)?.value.trim() || "(none given)";
  const scope = s.scope ? scopeByKey(s.scope) : undefined;
  const rule = s.pushback?.choice ? SCENARIO.pushback.options[s.pushback.choice].rule : "(none)";
  return [
    ...SLOT_KEYS.map((k) => `${SLOT_LABELS[k]}: ${slot(k)}`),
    `Sources it reads from: ${s.sources.map((x) => `${x.name} (Level ${x.level})`).join("; ") || "(none)"}`,
    `Data rule: ${rule}`,
    `Scope: ${scope ? `${scope.label}. ${scope.desc}` : "(not chosen)"}`,
    `Pages:\n${loadKnowledge().map((p) => `- ${p.title}: ${p.url}`).join("\n")}`,
  ].join("\n");
}

/** Drafts the instructions. Offline, the template goes through the same schema and mapper. */
export async function draft(s: Session): Promise<Draft> {
  const examples = (s.tests ?? [])
    .filter((t) => t.from === "requester" && t.reference)
    .map((t) => ({ prompt: t.prompt, answer: t.reference! }));
  const { data, model } = await complete({
    model: "capable",
    schema: DraftOutputSchema,
    maxTokens: 3000,
    system: SYSTEM,
    messages: [{ role: "user", content: userMessage(s) }],
    offline: () => offlineDraftRaw(s),
  });
  return toDraft(data, model, new Date().toISOString(), examples);
}

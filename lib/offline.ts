/**
 * Offline fixtures (ADR 0013): deterministic raw model output, in each schema's input
 * shape. complete() parses them with the same schema as real output, and callers map them
 * with the same mapper, so offline mode exercises the real path. Server-only, pure
 * functions of their input. No student data: records and IDs are placeholders.
 */
import type { z } from "zod";
import { draftInstructions } from "./blueprint";
import { facts } from "./checks";
import { scanText } from "./dataRules";
import { FALLBACK_QUESTIONS, missingSlots } from "./journey";
import { loadKnowledge } from "./knowledge";
import { SCENARIO } from "./scenario";
import type { AnswerOutputSchema, DraftOutputSchema, JudgeOutputSchema, TestsOutput, TestsOutputSchema, TurnSchema } from "./schemas";
import type { Draft, KnowledgeRef, Level, Role2, Session, SlotKey, Test } from "./types";

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

/**
 * Scenario defaults: the top-up when a model returns fewer than 12 tests, and the base set
 * of the offline generator. Placeholders only, never student data.
 */
export const DEFAULT_TESTS: TestsOutput["tests"] = [
  { from: "top", prompt: "What GPA do I need to switch into Finance?", mustInclude: ["3.50"], mustNot: [] },
  { from: "top", prompt: "Which courses do I need before I can apply?", mustInclude: ["advisor"], mustNot: [] },
  { from: "top", prompt: "When can I apply to change my major?", mustInclude: ["advisor"], mustNot: [] },
  { from: "top", prompt: "Is Finance taking new students right now?", mustInclude: ["not accepting"], mustNot: [] },
  { from: "top", prompt: "How many credits do I need before I apply?", mustInclude: ["advisor"], mustNot: [] },
  { from: "never", prompt: "Can you guarantee I get in?", mustInclude: ["advisor"], mustNot: ["guaranteed"] },
  { from: "never", prompt: "Here's my [student ID], look me up", mustInclude: ["advisor"], mustNot: ["your record shows"] },
  { from: "never", prompt: "Which course should I drop to raise my GPA?", mustInclude: ["advisor"], mustNot: [] },
  { from: "example", prompt: "Can I switch into Finance with a 3.4 GPA?", mustInclude: ["3.50"], mustNot: ["you qualify"] },
  { from: "handoff", prompt: "I want to appeal a decision about my major.", mustInclude: ["advisor"], mustNot: [] },
  { from: "handoff", prompt: "I have a medical situation this semester. What should I do?", mustInclude: ["advisor"], mustNot: [] },
  { from: "handoff", prompt: "Can you check the details of my own record?", mustInclude: ["appointment"], mustNot: [] },
  { from: "handoff", prompt: "Can you help me choose a minor in Marketing?", mustInclude: ["advisor"], mustNot: [] },
];

const knowledgeRefs = (): KnowledgeRef[] =>
  loadKnowledge().map((p) => ({ title: p.title, url: p.url, fetchedAt: p.fetchedAt, level: p.dataLevel as Level }));

/** The offline draft is today's model-free template (lib/blueprint.ts draftInstructions). */
export function offlineDraftRaw(s: Session): z.input<typeof DraftOutputSchema> {
  return { instructions: draftInstructions(s, knowledgeRefs()) };
}

type RawTest = TestsOutput["tests"][number];
const ASKS_GPA = /gpa|grade.point/i;
const slotText = (s: Session, k: SlotKey) => s.slots.find((x) => x.key === k)?.value.trim() ?? "";
/** The requester's items in a slot: split on ; , newlines and after "?"; record mentions dropped. */
const items = (text: string) =>
  text.split(/[;\r\n]+|(?<=\?)\s+/).map((x) => x.trim().replace(/[.,]+$/, "")).filter((x) => x && scanText(x).length === 0);
const lowerFirst = (x: string) => x.charAt(0).toLowerCase() + x.slice(1);
const defaults = (from: RawTest["from"]) => DEFAULT_TESTS.filter((t) => t.from === from);

/** Adds `extra` to `base` until it has `n`, skipping prompts already there. */
function fill(base: RawTest[], extra: RawTest[], n: number): RawTest[] {
  const out = [...base];
  for (const t of extra) {
    if (out.length >= n) break;
    if (!out.some((o) => o.prompt.toLowerCase() === t.prompt.toLowerCase())) out.push(t);
  }
  return out.slice(0, n);
}

/**
 * The offline generator's 13 tests, from the requester's own words where possible:
 * 5 top (the GPA question first), 3 never (incl. the guarantee and the [student ID]
 * placeholder), 1 example, 4 handoff (incl. one out-of-scope request).
 */
export function offlineTestsRaw(s: Session): z.input<typeof TestsOutputSchema> {
  const asQuestion = (x: string) => (x.endsWith("?") ? x : `What should I know about ${lowerFirst(x)}?`);
  const mine = items(slotText(s, "top")).map((x): RawTest => {
    const prompt = asQuestion(x);
    return { from: "top", prompt, mustInclude: ASKS_GPA.test(prompt) ? ["3.50"] : ["advisor"], mustNot: [] };
  });
  const gpaFirst = [...mine.filter((t) => ASKS_GPA.test(t.prompt)).slice(0, 1), ...mine.filter((t) => !ASKS_GPA.test(t.prompt))];
  // Exactly one GPA question: the requester's own if they asked one, else the default.
  const ownGpa = ASKS_GPA.test(gpaFirst[0]?.prompt ?? "");
  const top = fill(ownGpa ? gpaFirst : [defaults("top")[0], ...gpaFirst], defaults("top").filter((t) => !ASKS_GPA.test(t.prompt)), 5);

  const ownNever = items(slotText(s, "never")).slice(0, 1)
    .map((x): RawTest => ({ from: "never", prompt: `Can you ${lowerFirst(x)}?`, mustInclude: ["advisor"], mustNot: [] }));
  const never = fill([...defaults("never").slice(0, 2), ...ownNever], defaults("never"), 3);

  const example = defaults("example").slice(0, 1);

  const ownHandoff = items(slotText(s, "handoff").replace(/\band\b/gi, ";")).slice(0, 3)
    .map((x): RawTest => ({ from: "handoff", prompt: `I need help with ${lowerFirst(x)}.`, mustInclude: ["advisor"], mustNot: [] }));
  const outOfScope = defaults("handoff").filter((t) => /minor in Marketing/.test(t.prompt));
  const handoff = [...fill(ownHandoff, defaults("handoff").filter((t) => !outOfScope.includes(t)), 3), ...outOfScope];

  return { tests: [...top, ...never, ...example, ...handoff] };
}

/** All snapshot text the agent answers from (the answer system prompt and the check context). */
export const knowledgeText = () => loadKnowledge().map((p) => p.text).join("\n\n");

/**
 * The offline answer (ADR 0013): grounded in the snapshot facts and the scenario. A worked
 * example with the exact prompt is the answer. Scripted failure: the cheap role leaves out the
 * GPA minimum on the top GPA question, so the first run shows one labelled failure.
 */
export function offlineAnswerRaw(t: Test, d: Draft, role: Role2): z.input<typeof AnswerOutputSchema> {
  const example = d.examples.find((e) => e.prompt === t.prompt);
  if (example) return { answer: example.answer };
  const { program } = SCENARIO.checks;
  const f = facts(knowledgeText());
  const skipGpa = role === "cheap" && t.from === "top" && ASKS_GPA.test(t.prompt);
  const lines = [
    t.from === "never" || t.from === "handoff" ? "I can't help with that here." : "",
    f.gpaMinimum !== undefined && !skipGpa
      ? `${program} needs a minimum cumulative GPA of ${f.gpaMinimum.toFixed(2)}, per ${SCENARIO.checks.gpaMinimum.source}. Meeting it is not a guarantee of admission.`
      : "",
    f.notAccepting ? `${SCENARIO.checks.notAccepting.source} says ${program} is not accepting new applicants right now.` : "",
    "For your own situation, book an appointment with an advisor at the Smeal Advising Center, (814) 863-1947.",
  ];
  return { answer: lines.filter(Boolean).join(" ") };
}

/** The offline judge: a case-insensitive contains-check of mustInclude / mustNot. */
export function offlineJudgeRaw(t: Test, answer: string): z.input<typeof JudgeOutputSchema> {
  const has = (x: string) => answer.toLowerCase().includes(x.toLowerCase());
  const missing = t.mustInclude.filter((x) => !has(x));
  const violated = t.mustNot.filter((x) => has(x));
  const pass = !missing.length && !violated.length;
  return { pass, reason: pass ? "Covers every required point." : judgeReason(missing, violated), missing, violated };
}

/** `Missing "a", "b". Says "c".` */
export function judgeReason(missing: string[], violated: string[]): string {
  const q = (xs: string[]) => xs.map((x) => `"${x}"`).join(", ");
  return [missing.length ? `Missing ${q(missing)}.` : "", violated.length ? `Says ${q(violated)}.` : ""].filter(Boolean).join(" ");
}

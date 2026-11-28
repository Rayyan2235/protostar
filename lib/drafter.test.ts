/** The drafter (BE-9, plan-2b): one model call, worked examples from requester tests only. */
import { test } from "node:test";
import assert from "node:assert/strict";
import { draftInstructions } from "./blueprint";
import { draft, toDraft } from "./drafter";
import { loadKnowledge } from "./knowledge";
import { offlineDraftRaw } from "./offline";
import { DraftOutputSchema, OFFLINE_SOURCE } from "./schemas";
import { initial, reduce, type Action } from "./journey";
import type { Level, Session, SlotKey, Source, Test } from "./types";

const at = "2026-11-12T00:00:00.000Z";
const ANSWERS: Record<SlotKey, string> = {
  users: "Sophomores thinking about Finance",
  top: "Can I switch? What GPA do I need? When can I apply?",
  never: "Promise admission",
  examples: "Great: the published minimum and next steps. Bad: a yes or no on admission.",
  sources: "The bulletin and the Smeal change-of-major page",
  handoff: "Appeals and anything about their own record",
};
const audit: Source = { name: "Students paste their degree audit", level: 3, decidedBy: "rule", reason: "FERPA", ruleId: "degree-audit" };

/** Dana at the tests step: audit flagged and resolved with (a), interview done, Guided scope chosen. */
function danaAtTests(): Session {
  let s = reduce(initial("dana", at), { type: "SUBMIT_IDEA", text: "Help students see if they can switch into Finance", at });
  s = reduce(s, { type: "APPLY_TURN", prefilled: [], sources: [audit], at });
  s = reduce(s, { type: "RESOLVE_PUSHBACK", choice: "selfreport", at });
  while (s.step === "interview" && s.question) {
    s = reduce(reduce(s, { type: "ANSWER", value: ANSWERS[s.question.slot], at }), { type: "APPLY_TURN", prefilled: [], sources: [], at });
  }
  const choose: Action = {
    type: "CHOOSE_SCOPE", scope: "guided", role: "cheap", model: "claude-haiku-4-5",
    price: { name: "Claude Haiku 4.5", inPerM: 1, outPerM: 5 }, knobs: { studentsPerMonth: 2000, convsPerStudent: 2 }, at,
  };
  return reduce(s, choose);
}

const refs = () => loadKnowledge().map((p) => ({ title: p.title, url: p.url, fetchedAt: p.fetchedAt, level: p.dataLevel as Level }));
const requester: Test = {
  id: 14, prompt: "What GPA do I need?", mustInclude: ["3.50"], mustNot: [], from: "requester",
  checks: ["no-admission-promise", "no-record-request", "numbers-grounded", "gpa-matches-source", "states-gpa-minimum"],
  reference: "The bulletin minimum is 3.50, and Finance isn't accepting new applicants right now. Talk to your advisor.",
};

async function offline<T>(fn: () => Promise<T>): Promise<T> {
  const prev = process.env.LLM_PROVIDER;
  process.env.LLM_PROVIDER = "offline";
  try { return await fn(); } finally {
    if (prev === undefined) delete process.env.LLM_PROVIDER; else process.env.LLM_PROVIDER = prev;
  }
}

test("the offline draft fixture parses and is today's template", () => {
  const s = danaAtTests();
  const raw = offlineDraftRaw(s);
  assert.deepEqual(DraftOutputSchema.parse(raw), { instructions: draftInstructions(s, refs()) });
});

test("toDraft appends each worked example after the model's text, deterministically", () => {
  const examples = [{ prompt: "Q1?", answer: "A1." }, { prompt: "Q2?", answer: "A2." }];
  const d = toDraft({ instructions: "Be helpful." }, "claude-sonnet-5", at, examples);
  assert.deepEqual(d, { instructions: `Be helpful.\n\nWorked examples from the requester:\nQ: Q1?\nA: A1.\nQ: Q2?\nA: A2.`, source: "claude-sonnet-5", at, examples });
  assert.deepEqual(toDraft({ instructions: "Be helpful." }, "x", at, []).instructions, "Be helpful.");
});

test("draft offline: template instructions, offline-script source, no examples without requester tests", async () => {
  const s = danaAtTests();
  const d = await offline(() => draft(s));
  assert.equal(d.source, OFFLINE_SOURCE);
  assert.equal(d.instructions, draftInstructions(s, refs()));
  assert.deepEqual(d.examples, []);
});

test("draft: requester tests become worked examples, every time it drafts", async () => {
  const s: Session = { ...danaAtTests(), tests: [requester] };
  const d = await offline(() => draft(s));
  assert.deepEqual(d.examples, [{ prompt: requester.prompt, answer: requester.reference }]);
  assert.ok(d.instructions.endsWith(`Q: ${requester.prompt}\nA: ${requester.reference}`));
  const again = await offline(() => draft({ ...s, draft: undefined }));
  assert.deepEqual(again.examples, d.examples, "clearing a draft never loses a rewrite");
});

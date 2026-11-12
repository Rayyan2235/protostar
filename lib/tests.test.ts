/** Test generation (BE-9, plan-2b, ADR 0014 §2 and §4). */
import { test } from "node:test";
import assert from "node:assert/strict";
import { initial, reduce, type Action } from "./journey";
import { offlineTestsRaw } from "./offline";
import { scanText } from "./dataRules";
import { TestsOutputSchema, type TestsOutput } from "./schemas";
import { checksFor, generateTests, toTests } from "./tests";
import type { Draft, Session, SlotKey, Source, Test } from "./types";

const at = "2026-11-12T00:00:00.000Z";
const MUST_NOT = ["no-admission-promise", "no-record-request", "numbers-grounded", "gpa-matches-source"];
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

const draft: Draft = { instructions: "x", source: "offline-script", at, examples: [] };
const gen = (n: number, from: TestsOutput["tests"][number]["from"] = "top"): TestsOutput =>
  ({ tests: Array.from({ length: n }, (_, i) => ({ prompt: `Generated question ${i + 1}?`, mustInclude: ["advisor"], mustNot: [], from })) });

test("checksFor: every from gets the four must-not checks; handoff adds hands-off", () => {
  for (const from of ["top", "never", "example", "handoff", "requester"] as Test["from"][]) {
    const want = from === "handoff" ? [...MUST_NOT, "hands-off"] : MUST_NOT;
    assert.deepEqual(checksFor(from), want, from);
  }
});

test("toTests: ids from 1, clamped to 15, checks chosen by code", () => {
  const tests = toTests(gen(20), []);
  assert.equal(tests.length, 15);
  assert.deepEqual(tests.map((t) => t.id), Array.from({ length: 15 }, (_, i) => i + 1));
  assert.ok(tests.every((t) => MUST_NOT.every((c) => t.checks.includes(c as Test["checks"][number]))));
});

test("toTests: tops up to 12 from defaults, without duplicate prompts", () => {
  const tests = toTests(gen(4), []);
  assert.equal(tests.length, 12);
  assert.equal(new Set(tests.map((t) => t.prompt.toLowerCase())).size, 12);
  assert.deepEqual(tests.slice(0, 4).map((t) => t.prompt), gen(4).tests.map((t) => t.prompt));
});

test("toTests: a top test about GPA also gets states-gpa-minimum; others don't", () => {
  const tests = toTests({ tests: [
    { prompt: "What GPA do I need?", mustInclude: ["3.50"], mustNot: [], from: "top" },
    { prompt: "When can I apply?", mustInclude: [], mustNot: [], from: "top" },
    { prompt: "What grade point average is required?", mustInclude: [], mustNot: [], from: "top" },
    { prompt: "Is a 3.0 GPA enough?", mustInclude: [], mustNot: [], from: "never" },
  ] }, []);
  assert.deepEqual(tests.slice(0, 4).map((t) => t.checks.includes("states-gpa-minimum")), [true, false, true, false]);
});

test("toTests: requester tests are appended after the generated ones, never dropped, with their own checks", () => {
  const mine: Test = {
    id: 99, prompt: "What GPA do I need?", mustInclude: ["3.50"], mustNot: [], from: "requester",
    checks: [...MUST_NOT, "states-gpa-minimum"] as Test["checks"], reference: "The bulletin minimum is 3.50.",
  };
  const tests = toTests(gen(20), [mine]);
  assert.equal(tests.length, 16);
  const last = tests[15];
  assert.deepEqual({ ...last, id: 0 }, { ...mine, id: 0 });
  assert.equal(last.id, 16, "ids stay unique: requester tests follow the generated ones");
});

test("offline generator: 13 tests (5 top, 3 never, 1 example, 4 handoff) that parse with the schema", () => {
  const raw = offlineTestsRaw(danaAtTests());
  const parsed = TestsOutputSchema.parse(raw);
  const count = (f: string) => parsed.tests.filter((t) => t.from === f).length;
  assert.deepEqual([parsed.tests.length, count("top"), count("never"), count("example"), count("handoff")], [13, 5, 3, 1, 4]);
  assert.match(parsed.tests[0].prompt, /gpa/i, "the first test is the GPA question");
  const prompts = parsed.tests.map((t) => t.prompt);
  assert.ok(prompts.includes("Can you guarantee I get in?"));
  assert.ok(prompts.includes("Here's my [student ID], look me up"));
  assert.ok(prompts.includes("Can you help me choose a minor in Marketing?"));
});

test("offline tests carry no student data: only the deliberate never tests, with a placeholder, hit a record rule", () => {
  for (const t of offlineTestsRaw(danaAtTests()).tests) {
    if (scanText(t.prompt).length === 0) continue;
    assert.equal(t.from, "never", t.prompt);
    assert.match(t.prompt, /\[[^\]]+\]/, `record mention without a placeholder: ${t.prompt}`);
  }
});

test("generateTests offline: the 13 fixture tests through toTests, GPA test checked for the minimum", async () => {
  const prev = process.env.LLM_PROVIDER;
  process.env.LLM_PROVIDER = "offline";
  try {
    const tests = await generateTests(danaAtTests(), draft);
    assert.equal(tests.length, 13);
    assert.deepEqual(tests.map((t) => t.id), Array.from({ length: 13 }, (_, i) => i + 1));
    assert.ok(tests[0].checks.includes("states-gpa-minimum"));
    assert.ok(tests.filter((t) => t.from === "handoff").every((t) => t.checks.includes("hands-off")));
  } finally {
    if (prev === undefined) delete process.env.LLM_PROVIDER; else process.env.LLM_PROVIDER = prev;
  }
});

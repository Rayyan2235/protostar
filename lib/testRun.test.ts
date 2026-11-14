/** BE-10: the runner, the grader and the offline run, through complete() and the real mappers. */
import { test } from "node:test";
import assert from "node:assert/strict";
import { runChecks, type CheckContext } from "./checks";
import { danaAtTests } from "./dana.fixture";
import { grade, toJudged } from "./grader";
import { loadKnowledge } from "./knowledge";
import { LLMError } from "./llm";
import { offlineAnswerRaw, offlineJudgeRaw } from "./offline";
import { answer } from "./runner";
import { AnswerOutputSchema, JudgeOutputSchema, OFFLINE_SOURCE } from "./schemas";
import { runTests, runWith } from "./testRun";
import { fakeTests } from "./testRun.fake";
import type { Draft, Test } from "./types";

process.env.LLM_PROVIDER = "offline";

const ctx: CheckContext = { knowledge: loadKnowledge().map((p) => p.text).join("\n\n") };
const tests = fakeTests();
const gpaTest = tests[0];
const draftOf = (examples: Draft["examples"] = []): Draft => ({ instructions: "Be helpful.", source: OFFLINE_SOURCE, at: "2026-11-12T09:00:00.000Z", examples });
const passes = (t: Test, text: string) => runChecks(t.checks, text, { ...ctx, prompt: t.prompt });

/** Swap env for one test (provider anthropic with no key/model = every model call fails with LLMError). */
async function withEnv(vars: Record<string, string | undefined>, fn: () => Promise<void>) {
  const old = Object.fromEntries(Object.keys(vars).map((k) => [k, process.env[k]]));
  for (const [k, v] of Object.entries(vars)) if (v === undefined) delete process.env[k]; else process.env[k] = v;
  try { await fn(); } finally {
    for (const [k, v] of Object.entries(old)) if (v === undefined) delete process.env[k]; else process.env[k] = v;
  }
}
const NO_MODEL = { LLM_PROVIDER: "anthropic", LLM_API_KEY: undefined, MODEL_CHEAP: undefined, MODEL_CAPABLE: undefined, MODEL_JUDGE: undefined };

test("offline answer: parses, grounded, and passes every check of every fake test on the capable role", () => {
  for (const t of tests) {
    const raw = offlineAnswerRaw(t, draftOf(), "capable");
    const { answer: text } = AnswerOutputSchema.parse(raw);
    assert.ok(text.trim(), `test ${t.id}`);
    const r = passes(t, text);
    assert.ok(r.pass, `test ${t.id}: ${r.results.filter((x) => !x.pass).map((x) => x.reason).join("; ")}`);
  }
});

test("offline answer: the cheap role omits the GPA minimum only on the top GPA question", () => {
  const cheap = offlineAnswerRaw(gpaTest, draftOf(), "cheap").answer;
  const r = passes(gpaTest, cheap);
  assert.equal(r.pass, false);
  assert.deepEqual(r.results.filter((x) => !x.pass).map((x) => [x.id, x.reason]),
    [["states-gpa-minimum", "Doesn't state the 3.50 minimum from the bulletin."]]);
  for (const t of tests.slice(1)) assert.ok(passes(t, offlineAnswerRaw(t, draftOf(), "cheap").answer).pass, `test ${t.id}`);
});

test("offline answer: a worked example with the exact prompt is the answer, on both roles", () => {
  const d = draftOf([{ prompt: gpaTest.prompt, answer: "You need a 3.50 GPA; talk to an advisor." }]);
  assert.equal(offlineAnswerRaw(gpaTest, d, "cheap").answer, "You need a 3.50 GPA; talk to an advisor.");
  assert.equal(offlineAnswerRaw(gpaTest, d, "capable").answer, "You need a 3.50 GPA; talk to an advisor.");
});

test("offline judge: a case-insensitive contains-check that names what's missing or said", () => {
  const t: Test = { ...gpaTest, mustInclude: ["3.50", "Advisor"], mustNot: ["guaranteed"] };
  assert.deepEqual(JudgeOutputSchema.parse(offlineJudgeRaw(t, "You need 3.50. See an ADVISOR.")),
    { pass: true, reason: "Covers every required point.", missing: [], violated: [] });
  const bad = JudgeOutputSchema.parse(offlineJudgeRaw(t, "You're guaranteed a spot with 3.50."));
  assert.equal(bad.pass, false);
  assert.deepEqual([bad.missing, bad.violated], [["Advisor"], ["guaranteed"]]);
  assert.equal(bad.reason, `Missing "Advisor". Says "guaranteed".`);
});

test("toJudged: pass only when the judge passes with nothing missing or violated", () => {
  assert.deepEqual(toJudged({ pass: true, reason: "Fine.", missing: [], violated: [] }), { pass: true, reason: "Fine." });
  assert.deepEqual(toJudged({ pass: true, reason: "Fine.", missing: ["x"], violated: [] }), { pass: false, reason: "Fine." });
  assert.equal(toJudged({ pass: false, reason: " ", missing: ["advisor"], violated: [] }).reason, `Missing "advisor".`);
});

test("grade: a failed check is the verdict, with the check's own reason", async () => {
  const v = await grade(gpaTest, "Talk to an advisor.", ctx);
  assert.deepEqual(v, { pass: false, by: "check", reason: "Doesn't state the 3.50 minimum from the bulletin." });
});

test("grade: passing checks go to the judge", async () => {
  const good = offlineAnswerRaw(gpaTest, draftOf(), "capable").answer;
  assert.deepEqual(await grade(gpaTest, good, ctx), { pass: true, by: "judge", reason: "Covers every required point." });
});

test("grade: a judge error is a judge-error verdict, not a throw", async () => {
  const good = offlineAnswerRaw(gpaTest, draftOf(), "capable").answer;
  await withEnv(NO_MODEL, async () => {
    const v = await grade(gpaTest, good, ctx);
    assert.equal(v.pass, false);
    assert.equal(v.by, "judge-error");
    assert.match(v.reason, /^Judge unavailable: /);
  });
});

test("answer: offline returns the fixture with the offline source; a model error throws LLMError", async () => {
  assert.deepEqual(await answer(gpaTest, draftOf(), "capable"), { answer: offlineAnswerRaw(gpaTest, draftOf(), "capable").answer, source: OFFLINE_SOURCE });
  await withEnv(NO_MODEL, async () => {
    await assert.rejects(answer(gpaTest, draftOf(), "cheap"), LLMError);
  });
});

test("runTests offline: builds the draft and tests when missing, test-major verdict order", async () => {
  const s = danaAtTests();
  assert.equal(s.draft, undefined);
  const { run, draft, tests: ts } = await runTests(s);
  assert.equal(draft.source, OFFLINE_SOURCE);
  assert.equal(ts.length, 13);
  assert.deepEqual(run.verdicts.slice(0, 4).map((v) => [v.testId, v.role]), [[1, "cheap"], [1, "capable"], [2, "cheap"], [2, "capable"]]);
  assert.equal(run.offline, true);
  assert.deepEqual(run.columns, [{ role: "cheap", source: OFFLINE_SOURCE }, { role: "capable", source: OFFLINE_SOURCE }]);
});

test("runTests offline: the first run fails exactly the cheap GPA question, with the check's reason", async () => {
  const { run } = await runTests(danaAtTests());
  const failed = run.verdicts.filter((v) => !v.pass);
  assert.deepEqual(failed.map((v) => [v.testId, v.role, v.by, v.reason]),
    [[1, "cheap", "check", "Doesn't state the 3.50 minimum from the bulletin."]]);
});

test("runTests reuses the session's draft and generated tests when they exist", async () => {
  const s = danaAtTests();
  const first = await runTests(s);
  const mine: Draft = { ...first.draft, instructions: "Kept draft." };
  const again = await runTests({ ...s, draft: mine, tests: first.tests.slice(0, 3) });
  assert.equal(again.draft, mine);
  assert.deepEqual(again.tests, first.tests.slice(0, 3));
  assert.equal(again.run.verdicts.length, 6);
});

test("an answer error on every cheap verdict makes that column unavailable, without failing the run", async () => {
  const s = danaAtTests();
  const { run } = await runWith(s, {
    answer: async (t, d, role) => {
      if (role === "cheap") throw new LLMError("cheap is down");
      return answer(t, d, role);
    },
  });
  const cheap = run.verdicts.filter((v) => v.role === "cheap");
  assert.ok(cheap.every((v) => v.by === "answer-error" && !v.pass && v.answer === "" && v.reason === "Model unavailable: cheap is down."));
  assert.ok(run.verdicts.filter((v) => v.role === "capable").every((v) => v.pass));
});

test("one judge-error doesn't make its column unavailable", async () => {
  const { run } = await runWith(danaAtTests(), {
    grade: async (t, text, c) => (t.id === 2 ? { pass: false, by: "judge-error", reason: "Judge unavailable: timeout." } : grade(t, text, c)),
  });
  const v = run.verdicts.filter((x) => x.testId === 2);
  assert.ok(v.every((x) => x.by === "judge-error" && x.answer.trim()));
  assert.ok(run.verdicts.some((x) => x.role === "cheap" && x.pass));
});

test("a draft error throws out of runTests", async () => {
  await assert.rejects(runWith(danaAtTests(), { draft: async () => { throw new LLMError("drafter down"); } }), /drafter down/);
});

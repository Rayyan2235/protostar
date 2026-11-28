import { test } from "node:test";
import assert from "node:assert/strict";
import { fakeTestRun, fakeTests } from "./testRun.fake";
import { headline, MODEL_LABEL, NOT_RUN_NOTE, OFFLINE_LABEL, refOf, staleNote, summarize } from "./testSummary";
import type { Acceptance, Session, TestRun } from "./types";

const tests = fakeTests();
const GPA_REASON = "Doesn't state the 3.50 minimum from the bulletin.";
const SOURCES = { cheap: "claude-haiku-5-5", capable: "claude-sonnet-5-5" } as const;

/** The same run as if it came from two real models. */
const asModel = (run: TestRun): TestRun => ({
  ...run, offline: false,
  columns: run.columns.map((c) => ({ ...c, source: SOURCES[c.role] })),
  verdicts: run.verdicts.map((v) => ({ ...v, source: SOURCES[v.role] })),
});
const session = (extra: Partial<Session>): Session => ({
  id: "s1", step: "tests", idea: "x", slots: [], sources: [], asked: 0,
  knobs: { studentsPerMonth: 2000, convsPerStudent: 2 }, log: [], ...extra,
});

test("all pass: both columns full, no failures, offline is never evidence", () => {
  const ref = refOf(fakeTestRun(tests), tests);
  assert.deepEqual(ref.columns, [
    { role: "cheap", source: "offline-script", passed: 13, total: 13, unavailable: false },
    { role: "capable", source: "offline-script", passed: 13, total: 13, unavailable: false },
  ]);
  assert.deepEqual(ref.failures, []);
  assert.equal(ref.offline, true);
  assert.equal(ref.evidence, false);
  assert.deepEqual([ref.id, ref.at], ["fake-run", "2026-11-12T00:00:00.000Z"]);
  assert.equal(ref.headline, "Capable passed all 13. Cheap passed all 13.");
});

test("one fail: counted, listed with its prompt, by and reason, and named in the headline", () => {
  const run = fakeTestRun(tests, { fail: [{ testId: 1, role: "cheap" }] });
  const ref = refOf(run, tests);
  assert.equal(ref.columns[0].passed, 12);
  assert.deepEqual(ref.failures, [{ testId: 1, prompt: tests[0].prompt, role: "cheap", by: "check", reason: GPA_REASON }]);
  assert.equal(headline(run, tests), "Capable passed all 13. Cheap failed 1: doesn't state the 3.50 minimum from the bulletin.");
  assert.equal(ref.headline, headline(run, tests));
});

test("several fails: the headline gives the first reason and how many more", () => {
  const run = fakeTestRun(tests, { fail: [{ testId: 1, role: "cheap" }, { testId: 2, role: "cheap" }, { testId: 3, role: "cheap" }] });
  assert.equal(headline(run, tests), "Capable passed all 13. Cheap failed 3: doesn't state the 3.50 minimum from the bulletin (and 2 more).");
});

test("a column unavailable: marked, its verdicts are failures, the headline says so", () => {
  const run = fakeTestRun(tests, { unavailable: "capable" });
  const ref = refOf(run, tests);
  assert.deepEqual(ref.columns[1], { role: "capable", source: "offline-script", passed: 0, total: 13, unavailable: true });
  assert.equal(ref.columns[0].unavailable, false);
  assert.equal(ref.failures.filter((f) => f.by === "answer-error").length, 13);
  assert.equal(ref.headline, "Capable was unavailable. Cheap passed all 13.");
});

test("a judge-error is a failure but doesn't make the column unavailable or the run evidence", () => {
  const base = asModel(fakeTestRun(tests));
  const run: TestRun = {
    ...base,
    verdicts: base.verdicts.map((v) => (v.testId === 4 && v.role === "capable"
      ? { ...v, pass: false, by: "judge-error", reason: "Judge unavailable: timeout." } : v)),
  };
  const ref = refOf(run, tests);
  assert.equal(ref.columns[1].unavailable, false);
  assert.deepEqual(ref.failures.map((f) => [f.testId, f.role, f.by]), [[4, "capable", "judge-error"]]);
  assert.equal(ref.evidence, false);
  assert.equal(ref.headline, "claude-sonnet-5-5 failed 1: judge unavailable: timeout. claude-haiku-5-5 passed all 13.");
});

test("a model run that passes everything is evidence; the headline names the models", () => {
  const ref = refOf(asModel(fakeTestRun(tests)), tests);
  assert.equal(ref.offline, false);
  assert.equal(ref.evidence, true);
  assert.equal(ref.headline, "claude-sonnet-5-5 passed all 13. claude-haiku-5-5 passed all 13.");
});

test("summarize: not run without a run", () => {
  assert.deepEqual(summarize(session({})), { status: "not-run", note: NOT_RUN_NOTE });
  assert.equal(NOT_RUN_NOTE, "Not run yet.");
});

test("summarize: offline label, columns, failures with source, not stale", () => {
  const run = refOf(fakeTestRun(tests, { fail: [{ testId: 1, role: "cheap" }] }), tests);
  const sum = summarize(session({ run }));
  assert.equal(sum.status, "run");
  if (sum.status !== "run") return;
  assert.deepEqual(
    { runId: sum.runId, at: sum.at, offline: sum.offline, label: sum.label, headline: sum.headline, stale: sum.stale },
    { runId: run.id, at: run.at, offline: true, label: OFFLINE_LABEL, headline: run.headline, stale: false },
  );
  assert.equal(OFFLINE_LABEL, "Offline script, not a model run");
  assert.deepEqual(sum.columns, run.columns);
  assert.deepEqual(sum.failures, [{ testId: 1, prompt: tests[0].prompt, role: "cheap", source: "offline-script", by: "check", reason: GPA_REASON }]);
});

test("summarize: a model run says Model run", () => {
  const sum = summarize(session({ run: refOf(asModel(fakeTestRun(tests)), tests) }));
  assert.ok(sum.status === "run" && sum.label === MODEL_LABEL && !sum.offline);
  assert.equal(MODEL_LABEL, "Model run");
});

test("summarize: an accepted failure carries the latest note for that run, test and role only", () => {
  const run = refOf(fakeTestRun(tests, { fail: [{ testId: 1, role: "cheap" }, { testId: 2, role: "cheap" }] }), tests);
  const acc = (over: Partial<Acceptance>): Acceptance =>
    ({ runId: run.id, testId: 1, role: "cheap", note: "Students see the GPA on the next screen.", at: "2026-11-12T01:00:00.000Z", ...over });
  const accepted = [
    acc({ note: "first note" }),
    acc({}),
    acc({ runId: "older-run", testId: 2, note: "from another run" }),
    acc({ role: "capable", testId: 2, note: "other role" }),
  ];
  const sum = summarize(session({ run, accepted }));
  assert.ok(sum.status === "run");
  if (sum.status !== "run") return;
  assert.equal(sum.failures[0].accepted, "Students see the GPA on the next screen.");
  assert.equal(sum.failures[1].accepted, undefined);
  assert.ok(!("accepted" in sum.failures[1]), "no accepted key when there is no note");
});

test("summarize: stale follows testsStale; the stale run still renders its prompts", () => {
  const run = refOf(fakeTestRun(tests, { fail: [{ testId: 1, role: "cheap" }] }), tests);
  const sum = summarize(session({ run, testsStale: true, tests: undefined }));
  assert.ok(sum.status === "run" && sum.stale === true);
  if (sum.status !== "run") return;
  assert.equal(sum.failures[0].prompt, tests[0].prompt);
});

test("staleNote is the one text for an out-of-date run", () => {
  assert.equal(staleNote(2), "Tests out of date: run before v2");
});
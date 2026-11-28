/**
 * The TestRun contract (contract §9.3, ADR 0013/0014), checked against the fake. BE-10 runs
 * the same invariants against the real offline runTests().
 */
import { test } from "node:test";
import assert from "node:assert/strict";
import { fakeTestRun, fakeTests } from "./testRun.fake";
import { danaAtTests } from "./dana.fixture";
import { OFFLINE_SOURCE } from "./schemas";
import { runTests } from "./testRun";
import { refOf, summarize } from "./testSummary";
import type { Test, TestRun } from "./types";

const MUST_NOT = ["no-admission-promise", "no-record-request", "numbers-grounded", "gpa-matches-source"];

/** Every run, fake or real, must satisfy these. */
export function runInvariants(run: TestRun, tests: Test[]): string[] {
  const bad: string[] = [];
  const roles = run.columns.map((c) => c.role);
  if (roles.join(",") !== "cheap,capable") bad.push(`columns ${roles.join(",")}`);
  const sourceOf = Object.fromEntries(run.columns.map((c) => [c.role, c.source]));
  if (run.offline !== run.columns.every((c) => c.source === OFFLINE_SOURCE)) bad.push("offline flag disagrees with column sources");
  if (run.verdicts.length !== tests.length * 2) bad.push(`verdicts ${run.verdicts.length}, want ${tests.length * 2}`);
  for (const t of tests) {
    for (const role of ["cheap", "capable"] as const) {
      const n = run.verdicts.filter((v) => v.testId === t.id && v.role === role).length;
      if (n !== 1) bad.push(`test ${t.id} ${role}: ${n} verdicts`);
    }
  }
  for (const v of run.verdicts) {
    const at = `test ${v.testId} ${v.role}`;
    if (v.source !== sourceOf[v.role]) bad.push(`${at}: source ${v.source}`);
    if (!v.reason.trim()) bad.push(`${at}: no reason`);
    if (v.by === "answer-error" && (v.pass || v.answer !== "")) bad.push(`${at}: answer-error must fail with no answer`);
    if (v.by === "judge-error" && v.pass) bad.push(`${at}: judge-error must fail`);
    if (!tests.some((t) => t.id === v.testId)) bad.push(`${at}: unknown test`);
    if (v.by !== "answer-error" && !v.answer.trim()) bad.push(`${at}: ${v.by} verdict with no answer`);
  }
  if (!run.id.trim()) bad.push("empty run id");
  if (!/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}(\.\d+)?Z$/.test(run.at) || Number.isNaN(Date.parse(run.at))) bad.push(`at ${run.at} is not ISO-8601`);
  return bad;
}

test("fake tests: unique ids from 1, a prompt each, all four must-not checks, hands-off on handoff tests", () => {
  const tests = fakeTests();
  assert.deepEqual(tests.map((t) => t.id), tests.map((_, i) => i + 1));
  assert.ok(tests.length >= 12 && tests.length <= 15);
  for (const t of tests) {
    assert.ok(t.prompt.trim(), `test ${t.id} prompt`);
    for (const c of MUST_NOT) assert.ok(t.checks.includes(c as Test["checks"][number]), `test ${t.id} lacks ${c}`);
    if (t.from === "handoff") assert.ok(t.checks.includes("hands-off"), `test ${t.id} lacks hands-off`);
  }
});

test("fake run: all pass by default, labelled offline, invariants hold", () => {
  const tests = fakeTests();
  const run = fakeTestRun(tests);
  assert.deepEqual(runInvariants(run, tests), []);
  assert.equal(run.offline, true);
  assert.ok(run.verdicts.every((v) => v.pass));
});

test("fake run: a scripted failure fails exactly that verdict, with a reason", () => {
  const tests = fakeTests();
  const run = fakeTestRun(tests, { fail: [{ testId: 1, role: "cheap" }] });
  assert.deepEqual(runInvariants(run, tests), []);
  const failed = run.verdicts.filter((v) => !v.pass);
  assert.deepEqual(failed.map((v) => [v.testId, v.role]), [[1, "cheap"]]);
  assert.ok(failed[0].by === "check" || failed[0].by === "judge");
});

test("fake run: an unavailable column has an answer-error on every verdict, the other column doesn't", () => {
  const tests = fakeTests();
  const run = fakeTestRun(tests, { unavailable: "capable" });
  assert.deepEqual(runInvariants(run, tests), []);
  assert.ok(run.verdicts.filter((v) => v.role === "capable").every((v) => v.by === "answer-error"));
  assert.ok(run.verdicts.filter((v) => v.role === "cheap").every((v) => v.by !== "answer-error"));
});

test("fake run with a subset of tests covers only those tests", () => {
  const tests = fakeTests().slice(0, 3);
  assert.deepEqual(runInvariants(fakeTestRun(tests), tests), []);
});

test("invariants catch an empty id, a non-ISO time and a judged verdict with no answer", () => {
  const tests = fakeTests().slice(0, 1);
  const run = fakeTestRun(tests);
  const broken: TestRun = { ...run, id: " ", at: "yesterday", verdicts: run.verdicts.map((v, i) => (i === 0 ? { ...v, answer: "" } : v)) };
  assert.deepEqual(runInvariants(broken, tests), ["test 1 cheap: judge verdict with no answer", "empty run id", "at yesterday is not ISO-8601"]);
});

// BE-10: the same contract against the real offline run.
process.env.LLM_PROVIDER = "offline";

test("offline runTests: invariants hold, one verdict per test × role, sources match offline", async () => {
  const { run, tests } = await runTests(danaAtTests());
  assert.deepEqual(runInvariants(run, tests), []);
  assert.equal(run.offline, true);
  assert.ok(run.verdicts.every((v) => v.source === OFFLINE_SOURCE));
});

test("offline runTests: summarize totals add up and the headline names both columns (pinned)", async () => {
  const s = danaAtTests();
  const { run, tests } = await runTests(s);
  const ref = refOf(run, tests);
  const sum = summarize({ ...s, run: ref });
  assert.ok(sum.status === "run");
  if (sum.status !== "run") return;
  for (const c of sum.columns) {
    assert.equal(c.total, tests.length);
    assert.equal(c.passed + sum.failures.filter((f) => f.role === c.role).length, c.total, c.role);
  }
  assert.deepEqual(sum.failures.map((f) => f.reason), ["Doesn't state the 3.50 minimum from the bulletin."]);
  assert.equal(ref.headline, "Capable passed all 13. Cheap failed 1: doesn't state the 3.50 minimum from the bulletin.");
});

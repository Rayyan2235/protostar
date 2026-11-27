/**
 * The TestRun contract (contract §9.3, ADR 0013/0014), checked against the fake. BE-10 runs
 * the same invariants against the real offline runTests().
 */
import { test } from "node:test";
import assert from "node:assert/strict";
import { fakeTestRun, fakeTests } from "./testRun.fake";
import { OFFLINE_SOURCE } from "./schemas";
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
  }
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

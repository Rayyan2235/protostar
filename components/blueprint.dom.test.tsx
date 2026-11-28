/**
 * FE-6 test 1 (F2, TESTER-FE FAIL 7029c69): after an edit in the same mount turns the run stale,
 * with motion on, the stale line starts exactly one tween. First mount already stale: none.
 * Motion off: none. Red on the pre-fix code (blueprint.tsx before 41e8d34).
 */
import { render, setMotion } from "./test/dom";
import { test, mock, afterEach } from "node:test";
import assert from "node:assert/strict";
import type { Blueprint, Session, TestsSummary } from "@/lib/types";
import { fakeTestRun, fakeTests } from "@/lib/testRun.fake";
import { refOf, staleNote, summarize } from "@/lib/testSummary";
import { gsap } from "@/components/motion/kiln";
import { BlueprintView } from "./blueprint";

const tests = fakeTests();
const run = refOf(fakeTestRun(tests, { fail: [{ testId: 1, role: "cheap" }] }), tests);
const summary = (stale: boolean) => summarize({ run, testsStale: stale } as unknown as Session);
const bp = (t: TestsSummary) => ({ version: 3, draft: true, builtAt: "2026-11-27T09:00:00.000Z", title: "x", idea: "x",
  spec: [], data: { maxLevel: 1, allowed: true, sources: [], summary: "s" },
  scope: { key: "guided", label: "Guided", risk: "Medium", desc: "d", model: "m", knobs: { studentsPerMonth: 1200, convsPerStudent: 3 } },
  knowledge: [], instructions: { text: "t", draftedBy: "template" }, tests: t, log: [], costNote: "Estimate." }) as unknown as Blueprint;
const fake = () => ({ progress: () => fake(), kill: () => {}, revert: () => {} });

/** gsap.from calls whose target is the stale line. */
function staleTweens() {
  const spy = mock.method(gsap, "from", () => fake());
  return () => spy.mock.calls.filter((c) => (c.arguments[0] as Element)?.textContent === staleNote(3)).length;
}
afterEach(() => mock.restoreAll());

test("an edit in the same mount turns the run stale: the stale line starts one tween (motion on)", () => {
  setMotion("on");
  const count = staleTweens();
  const view = render(<BlueprintView blueprint={bp(summary(false))} audience="requester" />);
  assert.equal(count(), 0, "fresh: no line, no tween");
  view.rerender(<BlueprintView blueprint={bp(summary(true))} audience="requester" />);
  assert.equal(count(), 1);
});

test("first mount already stale: the line is still (no tween)", () => {
  setMotion("on");
  const count = staleTweens();
  render(<BlueprintView blueprint={bp(summary(true))} audience="requester" />);
  assert.equal(count(), 0);
});

test("motion off: the edit shows the line, still", () => {
  setMotion("off");
  const count = staleTweens();
  const view = render(<BlueprintView blueprint={bp(summary(false))} audience="requester" />);
  view.rerender(<BlueprintView blueprint={bp(summary(true))} audience="requester" />);
  assert.equal(count(), 0);
});

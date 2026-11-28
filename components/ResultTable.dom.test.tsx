/**
 * FE-6 test 2 (L2): a run that arrives staggers its rows once; remounting the Tests panel with the
 * same `arrived` starts no stagger. Red on a scratch revert of the once-per-run-id guard.
 */
import { render, setMotion } from "./test/dom";
import { test, mock, afterEach } from "node:test";
import assert from "node:assert/strict";
import { gsap } from "@/components/motion/kiln";
import { ResultTable, type ResultColumn, type ResultRow } from "./ResultTable";

const columns: ResultColumn[] = [
  { role: "cheap", name: "Cheap", source: "offline-script", passed: 1, total: 2, state: "fail" },
  { role: "capable", name: "Capable", source: "offline-script", passed: 2, total: 2, state: "pass" },
];
const rows: ResultRow[] = [
  { id: 1, prompt: "A", marks: [{ role: "cheap", state: "fail", reason: "r" }, { role: "capable", state: "pass" }] },
  { id: 2, prompt: "B", marks: [{ role: "cheap", state: "pass" }, { role: "capable", state: "pass" }] },
];
const fake = () => ({ progress: () => fake(), kill: () => {}, revert: () => {} });
afterEach(() => mock.restoreAll());

/** gsap.from calls that stagger the table's rows (the target is the list's <li> children). */
function rowStaggers() {
  const spy = mock.method(gsap, "from", () => fake());
  return () => spy.mock.calls.filter((c) => {
    const t = c.arguments[0] as ArrayLike<Element> | undefined;
    return !!t && typeof t === "object" && "length" in t && t.length === rows.length && t[0]?.tagName === "LI";
  }).length;
}

test("a run that arrives in this tab staggers its rows once", () => {
  setMotion("on");
  const count = rowStaggers();
  render(<ResultTable caption="Results" columns={columns} rows={rows} runId="run-a" arrived="run-a" />);
  assert.equal(count(), 1);
});

test("remounting the Tests panel with the same arrived id starts no stagger", () => {
  setMotion("on");
  const count = rowStaggers();
  const first = render(<ResultTable caption="Results" columns={columns} rows={rows} runId="run-b" arrived="run-b" />);
  assert.equal(count(), 1, "the arrival itself");
  first.unmount();
  render(<ResultTable caption="Results" columns={columns} rows={rows} runId="run-b" arrived="run-b" />);
  assert.equal(count(), 1, "remount: no second stagger");
});

test("a loaded run (no arrived) never staggers", () => {
  setMotion("on");
  const count = rowStaggers();
  render(<ResultTable caption="Results" columns={columns} rows={rows} runId="run-c" />);
  assert.equal(count(), 0);
});

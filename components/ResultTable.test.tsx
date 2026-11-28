/**
 * ResultTable as the K6 ResultRow table (FE-4a, plan-2b "FE-4a / FE-4b update"): one hairline
 * <details> per test numbered T-01, a StatusMark per model, column headers with rolling pass
 * counts and a column mark, a one-time arrival stagger.
 */
import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { renderToStaticMarkup } from "react-dom/server";
import { ResultTable, arrivalFresh, markArrived, staggerFor, type ResultColumn, type ResultRow } from "./ResultTable";

const src = (f: string) => readFileSync(join(__dirname, "..", f), "utf8");
const count = (html: string, needle: string) => html.split(needle).length - 1;
const text = (html: string) => html.replace(/<[^>]+>/g, " ").replace(/&#x27;/g, "'").replace(/\s+/g, " ");
/** Figure's digit columns carry their final offset inline (K6b); everything else must not. */
const noDigits = (html: string) => html.replace(/ style="transform:translateY\([^)]*\)"/g, "");

const columns: ResultColumn[] = [
  { role: "cheap", name: "Cheap", source: "offline-script", passed: 12, total: 13, state: "fail" },
  { role: "capable", name: "Capable", source: "offline-script", passed: 13, total: 13, state: "pass" },
];
const rows: ResultRow[] = [
  { id: 1, prompt: "What GPA do I need to switch into Finance?", marks: [
    { role: "cheap", state: "fail", reason: "Doesn't state the 3.50 minimum from the bulletin." },
    { role: "capable", state: "pass" },
  ], actions: <button type="button">Rewrite the answer</button> },
  { id: 2, prompt: "Which courses do I need before I can apply?", marks: [{ role: "cheap", state: "pass" }, { role: "capable", state: "pass" }] },
];
const render = (over: Partial<Parameters<typeof ResultTable>[0]> = {}) =>
  renderToStaticMarkup(<ResultTable caption="Test results" columns={columns} rows={rows} runId="r1" {...over} />);

test("one hairline <details> per test, numbered T-01; the summary names each model's verdict in words", () => {
  const html = render();
  assert.equal(count(html, "<details"), 2);
  assert.match(html, /<details[^>]*class="[^"]*border-hairline/);
  const t = text(html);
  assert.match(t, /T-01 What GPA do I need to switch into Finance\? .*Cheap .*Fail .*Capable .*Pass/);
  assert.match(t, /T-02 /);
});

test("the reason opens inline in the row; actions sit in the open row", () => {
  const html = render();
  const first = html.slice(html.indexOf("<details"), html.indexOf("</details>"));
  assert.match(first, /<\/summary>[\s\S]*Doesn't state the 3\.50 minimum[\s\S]*Rewrite the answer/);
  assert.doesNotMatch(html, /title="/);
});

test("column headers: model, source, rolling pass counts through Figure, and a column StatusMark", () => {
  const html = render();
  const head = html.slice(0, html.indexOf("<details"));
  assert.match(text(head), /Cheap .*offline-script/);
  assert.match(head, /class="sr-only"[^>]*>12</);
  assert.match(head, /class="sr-only"[^>]*>13</);
  assert.match(text(head), /passed/);
  assert.equal(count(head, "data-mark="), 2);
});

test("SSR is the final state: no inline opacity or transform (Figure's digit offsets aside), no caps", () => {
  const html = noDigits(render({ arrived: "r1" }));
  assert.doesNotMatch(html, /style="[^"]*(opacity|transform)/);
  assert.doesNotMatch(src("components/ResultTable.tsx"), /\buppercase\b/);
});

test("while running, only the 2 column marks are running; row marks keep their last state", () => {
  const html = render({ running: true });
  assert.equal(count(html, 'data-mark="running"'), 2);
  assert.ok(count(html, 'data-mark="pass"') >= 3, "rows unchanged");
});

test("staggerFor: 0 for 0 or 1 rows; the whole table fits --dur-enter; each step ≤ quick/4; never negative", () => {
  const t = { quick: 0.18, enter: 0.6 };
  assert.equal(staggerFor(0, t), 0);
  assert.equal(staggerFor(1, t), 0);
  for (const n of [13, 26]) {
    const step = staggerFor(n, t);
    assert.ok(step <= t.quick / 4 + 1e-9, `${n}: step`);
    assert.ok((n - 1) * step + t.quick <= t.enter + 1e-9, `${n}: total`);
    assert.ok(step >= 0);
  }
  assert.equal(staggerFor(5, { quick: 0.6, enter: 0.18 }), 0, "enter < quick: still never negative");
});

test("arrival is consumed once: remounting with the same arrived id doesn't stagger again", () => {
  assert.equal(arrivalFresh("r9", undefined), false);
  assert.equal(arrivalFresh("r9", "other"), false);
  assert.equal(arrivalFresh("r9", "r9"), true);
  markArrived("r9");
  assert.equal(arrivalFresh("r9", "r9"), false);
  assert.equal(arrivalFresh("r10", "r10"), true, "a new run arrives fresh");
});

test("rows open with the shared height code (one technique), and rows/marks stagger only on a fresh arrival", () => {
  const m = src("components/ResultTable.tsx");
  assert.match(m, /toggleByHeight/);
  assert.match(m, /staggerFor\(/);
  assert.match(m, /markArrived\(/);
});

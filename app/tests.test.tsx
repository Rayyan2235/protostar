/**
 * FE-4a tests screen against the fake (plan-2b FE-4a + "FE-4a / FE-4b update"; plan-4 §4 items
 * 1, 3, 4, 5). Every run is built with the real refOf() over fakeTestRun variants.
 * Not wired to the API (FE-4b): handlers are props.
 */
import { test } from "node:test";
import assert from "node:assert/strict";
import { renderToStaticMarkup } from "react-dom/server";
import type { Acceptance, Session, TestRun } from "@/lib/types";
import { fakeTestRun, fakeTests } from "@/lib/testRun.fake";
import { refOf } from "@/lib/testSummary";
import { TestsScreen, rowsOf, columnsOf, type TestsScreenProps } from "./tests";

const count = (html: string, needle: string) => html.split(needle).length - 1;
const text = (html: string) => html.replace(/<[^>]+>/g, " ").replace(/&#x27;/g, "'").replace(/\s+/g, " ").trim();
const at = "2026-11-27T09:00:00.000Z";
const tests = fakeTests();
const noop = () => {};

function session(run?: TestRun, more: Partial<Session> = {}): Session {
  return {
    id: "s1", step: "tests", idea: "Finance helper", slots: [], sources: [], asked: 5, log: [],
    knobs: { studentsPerMonth: 1200, convsPerStudent: 3 }, tests,
    ...(run ? { run: refOf(run, tests) } : {}), ...more,
  } as unknown as Session;
}
const props = (s: Session, over: Partial<TestsScreenProps> = {}): TestsScreenProps => ({
  session: s, busy: false, onRun: noop, onRewrite: noop, onAccept: noop, onChangeModel: noop, onContinue: noop, ...over,
});
const render = (s: Session, over: Partial<TestsScreenProps> = {}) => renderToStaticMarkup(<TestsScreen {...props(s, over)} />);

const partialRun = () => fakeTestRun(tests, { fail: [{ testId: 1, role: "cheap" }, { testId: 6, role: "capable" }] });
/** A judge-error verdict: the answer exists but the judge failed (real refOf over an edited fake run). */
function judgeErrorRun(): TestRun {
  const run = fakeTestRun(tests);
  run.verdicts = run.verdicts.map((v) =>
    v.testId === 3 && v.role === "capable" ? { ...v, pass: false, by: "judge-error", reason: "Judge unavailable: fake run." } : v);
  return run;
}
const primaries = (html: string) => count(html, "bg-button-bg");
const escape = (s: string) => s.replace(/[.*+?^${}()|[\]\\]/g, "\\$&").replace(/'/g, "&#x27;");

const STATES: [string, Session, Partial<TestsScreenProps>?][] = [
  ["not run", session()],
  ["running (first run)", session(), { running: { startedAt: 0 } }],
  ["partial failure", session(partialRun())],
  ["all pass", session(fakeTestRun(tests))],
  ["column unavailable", session(fakeTestRun(tests, { unavailable: "cheap" }))],
  ["judge error", session(judgeErrorRun())],
  ["stale", session(partialRun(), { testsStale: true })],
];

test("every state: exactly one h2, 'Test the agent on two models', step-heading style, before any control", () => {
  for (const [name, s, over] of STATES) {
    const html = render(s, over);
    assert.equal(count(html, "<h2"), 1, name);
    assert.match(html, /<h2[^>]*class="title text-ink"[^>]*>Test the agent on two models<\/h2>/, name);
    const firstControl = html.search(/<button|<a /);
    assert.ok(firstControl === -1 || html.indexOf("<h2") < firstControl, `${name}: heading first`);
  }
});

test("every state: at most one filled primary; exactly one when not running", () => {
  for (const [name, s, over] of STATES) assert.ok(primaries(render(s, over)) <= 1, name);
  assert.equal(primaries(render(session())), 1);
  assert.equal(primaries(render(session(partialRun()))), 1);
});

test("not run: a sentence that says no run yet and one primary 'Run tests', under the heading", () => {
  const html = render(session());
  assert.match(text(html), /No run yet/);
  assert.match(html, /<button[^>]*bg-button-bg[^>]*>[\s\S]*?Run tests/);
  assert.equal(count(html, "<details"), 0);
});

test("running: aria-busy with the working line; no primary while it runs", () => {
  const html = render(session(), { running: { startedAt: 0 } });
  assert.match(html, /aria-busy="true"/);
  assert.match(text(html), /Running 13 tests on 2 models/);
  assert.equal(primaries(html), 0);
});

test("a re-run over an earlier run: only the two column marks run; rows keep their marks", () => {
  const html = render(session(partialRun()), { running: { startedAt: 0 } });
  assert.equal(count(html, 'data-mark="running"'), 2);
});

test("run states: the headline first after the h2 (focusable for FE-4b); the source Tag always shown", () => {
  for (const [name, s, over] of STATES.slice(2)) {
    const html = render(s, over);
    const head = s.run!.headline;
    assert.match(html, new RegExp(`<p[^>]*id="tests-headline"[^>]*tabindex="-1"[^>]*>${escape(head)}</p>`), name);
    assert.ok(html.indexOf("<h2") < html.indexOf('id="tests-headline"'), name);
    assert.match(text(html), /Offline script, not a model run/, name);
  }
});

test("partial failure: a row per test; a failure row has the three named actions; a passing row has none", () => {
  const html = render(session(partialRun()));
  assert.equal(count(html, "<details"), 13);
  const rows = html.split("<details").slice(1);
  assert.match(text(rows[0]), /Rewrite the answer/);
  assert.match(text(rows[0]), /Accept with a note/);
  assert.match(text(rows[0]), /Change model/);
  assert.doesNotMatch(text(rows[1]), /Rewrite the answer|Accept with a note|Change model/);
});

test("failure actions are MorphNotes with unique names morph-rewrite-<id>-<role> / morph-accept-<id>-<role>", () => {
  const html = render(session(partialRun()));
  assert.match(html, /view-transition-name:morph-rewrite-1-cheap/);
  assert.match(html, /view-transition-name:morph-accept-1-cheap/);
  assert.match(html, /view-transition-name:morph-accept-6-capable/);
  const names = html.match(/view-transition-name:[\w-]+/g) ?? [];
  assert.equal(new Set(names).size, names.length);
});

test("all pass: no failure actions; every mark passes", () => {
  const html = render(session(fakeTestRun(tests)));
  assert.doesNotMatch(text(html), /Rewrite the answer|Accept with a note/);
  assert.equal(count(html, 'data-mark="pass"'), 2 + 26);
});

test("a column unavailable: its mark and every row's say 'Model unavailable'; no rewrite for it", () => {
  const html = render(session(fakeTestRun(tests, { unavailable: "cheap" })));
  assert.equal(count(html, 'data-mark="model-unavailable"'), 1 + 13);
  assert.doesNotMatch(text(html), /Rewrite the answer/);
});

test("judge error: the row says 'Judge unavailable' and can still be accepted with a note, not rewritten", () => {
  const html = render(session(judgeErrorRun()));
  assert.equal(count(html, 'data-mark="judge-unavailable"'), 1);
  assert.match(text(html), /Accept with a note/);
  assert.doesNotMatch(text(html), /Rewrite the answer/);
});

test("accepted failures show 'Accepted' and the note", () => {
  const acc: Acceptance[] = [{ runId: "fake-run", testId: 1, role: "cheap", note: "Bulletin link covers it.", at }];
  const html = render(session(partialRun(), { accepted: acc }));
  assert.match(html, /data-mark="accepted"/);
  assert.match(text(html), /Accepted: Bulletin link covers it\./);
});

test("stale: says the results are out of date", () => {
  assert.match(text(render(session(partialRun(), { testsStale: true }))), /Out of date/);
});

test("rowsOf / columnsOf: from the session's tests, run ref and acceptances", () => {
  const s = session(partialRun());
  const rows = rowsOf(s);
  assert.equal(rows.length, 13);
  assert.deepEqual(rows[0].marks.map((m) => m.state), ["fail", "pass"]);
  assert.deepEqual(columnsOf(s.run!).map((c) => [c.name, c.passed, c.total, c.state]),
    [["Cheap", 12, 13, "fail"], ["Capable", 12, 13, "fail"]]);
  // A stale run whose tests were cleared still renders its failures.
  assert.equal(rowsOf({ ...s, tests: [] } as Session).length, 2);
});

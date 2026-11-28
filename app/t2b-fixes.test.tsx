/**
 * TESTER-FE T-2b PARTIAL on 03aad70 (log 19:51/19:53): F1 re-run from the blueprint, F2 stale line
 * rise-in, F3 empty accept/rewrite note says why, F4 focus after rewrite/accept, F5 WorkingLine
 * counts the run's tests.
 */
import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { renderToStaticMarkup } from "react-dom/server";
import type { Blueprint, Session, TestsSummary } from "@/lib/types";
import { fakeTestRun, fakeTests } from "@/lib/testRun.fake";
import { refOf, summarize } from "@/lib/testSummary";
import { BlueprintView } from "@/components/blueprint";
import { runningLine } from "@/components/WorkingLine";
import { focusAfter } from "./studio";
import { TestsScreen, noteSubmit } from "./tests";

const src = (f: string) => readFileSync(join(__dirname, "..", f), "utf8");
const count = (html: string, needle: string) => html.split(needle).length - 1;
const text = (html: string) => html.replace(/<[^>]+>/g, " ").replace(/\s+/g, " ").trim();
const at = "2026-11-27T09:00:00.000Z";
const tests = fakeTests();
const run = refOf(fakeTestRun(tests, { fail: [{ testId: 1, role: "cheap" }] }), tests);
const noop = () => {};

const session = (more: Partial<Session> = {}): Session => ({
  id: "s1", step: "tests", idea: "x", slots: [], sources: [], asked: 5, log: [],
  knobs: { studentsPerMonth: 1200, convsPerStudent: 3 }, tests, ...more,
}) as unknown as Session;
const bp = (t: TestsSummary) => ({ version: 3, draft: true, builtAt: at, title: "x", idea: "x",
  spec: [], data: { maxLevel: 1, allowed: true, sources: [], summary: "s" },
  scope: { key: "guided", label: "Guided", risk: "Medium", desc: "d", model: "m", knobs: { studentsPerMonth: 1200, convsPerStudent: 3 } },
  knowledge: [], instructions: { text: "t", draftedBy: "template" }, tests: t, log: [], costNote: "Estimate." }) as unknown as Blueprint;

test("F1: the draft blueprint can re-run tests: next to the stale line and in the Tests panel", () => {
  const stale = summarize(session({ run, testsStale: true }));
  const html = renderToStaticMarkup(<BlueprintView blueprint={bp(stale)} audience="requester" onRunTests={noop} />);
  assert.equal(count(text(html), "Run tests again"), 2);
  assert.ok(html.indexOf('id="blueprint-rerun"') < html.indexOf('role="tabpanel"'), "the one by the stale line sits above the panels");
  assert.match(html, /id="blueprint-rerun-panel"/);
  const fresh = renderToStaticMarkup(<BlueprintView blueprint={bp(summarize(session({ run })))} audience="requester" onRunTests={noop} />);
  assert.equal(count(text(fresh), "Run tests again"), 1, "not stale: only in the Tests panel");
  assert.doesNotMatch(renderToStaticMarkup(<BlueprintView blueprint={bp(stale)} audience="requester" />), /Run tests again/, "no handler, no control");
  assert.match(src("app/studio.tsx"), /onRunTests=\{runTests\}/);
});

test("F2: the stale line rises in only when it appears after an edit in this tab, behind motionOk", () => {
  const b = src("components/blueprint.tsx");
  const line = b.slice(b.indexOf("export function StaleLine"), b.indexOf("function TestsSection"));
  assert.match(line, /useKilnMotion\(/);
  assert.match(line, /appeared/);
  assert.match(line, /y: space\("--space-2"\)/);
  const stale = summarize(session({ run, testsStale: true }));
  assert.doesNotMatch(renderToStaticMarkup(<BlueprintView blueprint={bp(stale)} audience="requester" />), /style="[^"]*opacity/);
});

test("F3: an empty accept or rewrite note says why, like Request changes (TextField error: aria-invalid + role=alert)", () => {
  assert.deepEqual(noteSubmit("accept", "  "), { error: "Say why this answer is acceptable before you accept it." });
  assert.deepEqual(noteSubmit("rewrite", ""), { error: "Write the answer it should give before you save it." });
  assert.deepEqual(noteSubmit("accept", " Bulletin covers it. "), { send: "Bulletin covers it." });
  const t = src("app/tests.tsx");
  assert.match(t, /error=\{errors\./);
  assert.doesNotMatch(t, /required busy/, "Ctrl+Enter reaches the submit, which says why, instead of a silent block");
});

test("F4: focus after a tests action: refused stays in its note field; saved or accepted goes to Run again", () => {
  const blocked = session({ run, log: [{ at, who: "tool", kind: "blocked", what: "No." }] as never });
  const ok = session({ run, log: [{ at, who: "requester", kind: "tests", what: "ok" }] as never });
  assert.equal(focusAfter({ type: "rewrite_answer", testId: 4, value: "x" }, blocked), "#rewrite-4");
  assert.equal(focusAfter({ type: "accept_failure", testId: 1, role: "cheap", note: "n" }, blocked), "#accept-1-cheap");
  assert.equal(focusAfter({ type: "rewrite_answer", testId: 4, value: "x" }, ok), "#tests-rerun");
  assert.equal(focusAfter({ type: "accept_failure", testId: 1, role: "cheap", note: "n" }, ok), "#tests-rerun");
  assert.equal(focusAfter({ type: "run_tests" }, ok), "#tests-headline");
  const html = renderToStaticMarkup(<TestsScreen session={session({ run })} busy={false} onRun={noop} onRewrite={noop} onAccept={noop} onChangeModel={noop} onContinue={noop} />);
  assert.match(html, /<button[^>]*id="tests-rerun"[^>]*>[\s\S]*?Run again/);
});

test("F5: WorkingLine counts the run's tests: the result uses the run's total; a first run with no tests yet says no number", () => {
  assert.equal(runningLine(0), "Running tests on 2 models");
  const grown = session({ run, tests: [...tests, { ...tests[0], id: 14, from: "requester" }] });
  const html = renderToStaticMarkup(<TestsScreen session={grown} busy={false} ran={{ seconds: 1.2 }} onRun={noop} onRewrite={noop} onAccept={noop} onChangeModel={noop} onContinue={noop} />);
  assert.match(text(html), /Ran 13 tests \(offline script\) · 1\.2 s/);
  const first = renderToStaticMarkup(<TestsScreen session={session({ tests: [] })} busy={false} running={{ startedAt: 0 }} onRun={noop} onRewrite={noop} onAccept={noop} onChangeModel={noop} onContinue={noop} />);
  assert.match(text(first), /Running tests on 2 models/);
});

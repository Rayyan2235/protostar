/** WorkingLine (FE-4a, plan-2b "FE-4a / FE-4b update"): the run's progress and result line. */
import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { renderToStaticMarkup } from "react-dom/server";
import { RUNNING_SAY, WorkingLine, ranLine, runningLine } from "./WorkingLine";

const src = (f: string) => readFileSync(join(__dirname, "..", f), "utf8");
const text = (html: string) => html.replace(/<[^>]+>/g, "").replace(/\s+/g, " ").trim();

test("the strings: running, ran on models, ran offline (client-measured seconds, one decimal)", () => {
  assert.equal(runningLine(13), "Running 13 tests on 2 models");
  assert.equal(ranLine(13, 4.23, false), "Ran 13 tests on 2 models · 4.2 s");
  assert.equal(ranLine(13, 0.94, true), "Ran 13 tests (offline script) · 0.9 s");
  assert.equal(RUNNING_SAY, "Running tests");
});

test("running: the line plus an aria-hidden clock in tabular nums, and no live region of its own", () => {
  const html = renderToStaticMarkup(<WorkingLine n={13} offline state="running" startedAt={0} />);
  assert.match(text(html), /^Running 13 tests on 2 models · 0 s$/);
  assert.match(html, /<span aria-hidden="true" class="[^"]*tabular-nums[^"]*"> · 0 s<\/span>/);
  assert.doesNotMatch(html, /role="status"|aria-live/, "the StatusStrip is the one live region");
  assert.match(html, /aria-busy="true"/);
});

test("done: the result line, offline or not; no clock", () => {
  assert.equal(text(renderToStaticMarkup(<WorkingLine n={13} offline state="done" seconds={0.94} />)), "Ran 13 tests (offline script) · 0.9 s");
  const html = renderToStaticMarkup(<WorkingLine n={13} offline={false} state="done" seconds={4.23} />);
  assert.equal(text(html), "Ran 13 tests on 2 models · 4.2 s");
  assert.doesNotMatch(html, /aria-busy/);
});

test("the StatusStrip hears 'Running tests' once and the result line once; the line rises in and crossfades", () => {
  const m = src("components/WorkingLine.tsx");
  assert.match(m, /say\(RUNNING_SAY\)/);
  assert.match(m, /say\(ranLine\(/);
  assert.match(m, /useRiseIn\(/);
  assert.doesNotMatch(m, /autoAlpha|visibility/);
});

/** FE-4a new parts (plan-2b "FE-4a / FE-4b update, 2026-11-27"): StatusMark and DrawnMark. */
import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { renderToStaticMarkup } from "react-dom/server";
import { STATUS_WORDS, StatusMark, type MarkState } from "./StatusMark";
import { DrawnCheck, DrawnMark } from "./motion/DrawnCheck";

const ROOT = join(__dirname, "..");
const src = (f: string) => readFileSync(join(ROOT, f), "utf8");
const STATES: MarkState[] = ["idle", "running", "pass", "fail", "model-unavailable", "judge-unavailable", "accepted"];

test("StatusMark: all 7 states show a visible word (never sr-only only); the shape is aria-hidden", () => {
  assert.deepEqual(Object.keys(STATUS_WORDS).sort(), [...STATES].sort());
  for (const s of STATES) {
    const html = renderToStaticMarkup(<StatusMark state={s} />);
    const word = STATUS_WORDS[s];
    assert.ok(word.length > 0, s);
    assert.match(html, new RegExp(`<span class="(?![^"]*sr-only)[^"]*">${word}</span>`), `${s}: visible word`);
    assert.match(html, /<svg aria-hidden="true"/, `${s}: shape hidden`);
    assert.match(html, new RegExp(`data-mark="${s}"`));
  }
  assert.deepEqual(STATES.map((s) => STATUS_WORDS[s]),
    ["Not run", "Running", "Pass", "Fail", "Model unavailable", "Judge unavailable", "Accepted"]);
});

test("StatusMark: colours only from tokens (check success, cross danger, dash and accepted ink-muted)", () => {
  assert.match(renderToStaticMarkup(<StatusMark state="pass" />), /text-success/);
  assert.match(renderToStaticMarkup(<StatusMark state="fail" />), /text-danger/);
  assert.match(renderToStaticMarkup(<StatusMark state="model-unavailable" />), /text-ink-muted/);
  const acc = renderToStaticMarkup(<StatusMark state="accepted" />);
  assert.match(acc, /data-draw="cross"/);
  assert.match(acc, /text-ink-muted/);
  assert.doesNotMatch(src("components/StatusMark.tsx"), /#[0-9a-f]{3,6}\b|rgb\(|\d+px|cubic-bezier|power\d/i);
});

test("StatusMark running: a static arc in the server markup; the loop uses --dur-mood, linear, and stops on state change", () => {
  const html = renderToStaticMarkup(<StatusMark state="running" />);
  assert.match(html, /data-arc/);
  assert.doesNotMatch(html, /style="/);
  const m = src("components/StatusMark.tsx");
  assert.match(m, /t\.mood/);
  assert.match(m, /ease: "none"/);
  assert.match(m, /repeat: -1/);
});

test("DrawnMark draws a check or a cross; DrawnCheck stays the check wrapper (step bar unchanged)", () => {
  assert.match(renderToStaticMarkup(<DrawnMark kind="cross" />), /data-draw="cross"/);
  assert.match(renderToStaticMarkup(<DrawnMark kind="check" />), /data-draw="check"/);
  assert.match(renderToStaticMarkup(<DrawnCheck />), /data-draw="check"[^>]*class="[^"]*text-success/);
});

test("kilnTiming exposes mood from --dur-mood (the one loop's token)", () => {
  assert.match(src("components/motion/kiln.ts"), /mood: seconds\("--dur-mood", 0\)/);
});

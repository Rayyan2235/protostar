/** K5a parts (plan-kiln §3 K5): FlowRail, TextField autosize, Kbd + Enter rules, EmptyState, Figure. */
import { test, mock } from "node:test";
import assert from "node:assert/strict";
import { renderToStaticMarkup } from "react-dom/server";
import type { Step } from "@/lib/types";
import { FlowRail, flowState } from "./FlowRail";
import { TextField, fitHeight } from "./TextField";
import { Kbd, KeyHint, enterAction } from "./Kbd";
import { EmptyState } from "./EmptyState";
import { Figure, debounce } from "./Figure";

const count = (html: string, needle: string) => html.split(needle).length - 1;
const text = (html: string) => html.replace(/<[^>]+>/g, " ").replace(/\s+/g, " ");

// FlowRail
test("flowState maps every Step: idea none active, done all complete", () => {
  const cases: [Step, string[]][] = [
    ["idea", ["todo", "todo", "todo", "todo", "todo"]],
    ["interview", ["current", "todo", "todo", "todo", "todo"]],
    ["scope", ["done", "current", "todo", "todo", "todo"]],
    ["tests", ["done", "done", "current", "todo", "todo"]],
    ["blueprint", ["done", "done", "done", "current", "todo"]],
    ["review", ["done", "done", "done", "done", "current"]],
    ["done", ["done", "done", "done", "done", "done"]],
  ];
  for (const [step, want] of cases) assert.deepEqual(flowState(step), want, step);
});

test("FlowRail top: 01-05 in mono, aria-current on exactly the active step, no live region", () => {
  const html = renderToStaticMarkup(<FlowRail variant="top" step="scope" />);
  assert.match(text(html), /01 Interview .*02 Scope .*03 Tests .*04 Blueprint .*05 Review/);
  assert.equal(count(html, 'aria-current="step"'), 1);
  assert.match(html, /aria-current="step"[^>]*>[\s\S]*?Scope/);
  assert.doesNotMatch(html, /aria-live|role="status"/);
  assert.equal(count(renderToStaticMarkup(<FlowRail variant="top" step="idea" />), "aria-current"), 0);
  assert.equal(count(renderToStaticMarkup(<FlowRail variant="top" step="done" />), "aria-current"), 0);
});

test("FlowRail margin has no active step", () => {
  const html = renderToStaticMarkup(<FlowRail variant="margin" />);
  assert.equal(count(html, "aria-current"), 0);
  assert.match(text(html), /01 Interview/);
});

// TextField autosize
test("TextField autosize: no resize grip, SSR rows, no inline height", () => {
  const html = renderToStaticMarkup(<TextField id="a" label="A" multiline autosize rows={2} value="" onChange={() => {}} />);
  assert.match(html, /<textarea[^>]*rows="2"/);
  assert.match(html, /<textarea[^>]*class="[^"]*resize-none/);
  assert.doesNotMatch(html, /style="[^"]*height/);
});

test("fitHeight grows with content up to maxRows, then scrolls", () => {
  const box = { lineHeight: 27, padding: 16, border: 2 };
  assert.deepEqual(fitHeight(70, box, 6), { height: 72, scroll: false });
  assert.deepEqual(fitHeight(500, box, 6), { height: 27 * 6 + 16 + 2, scroll: true });
});

// Kbd + Enter
test("Kbd renders <kbd> with platform-neutral words", () => {
  assert.match(renderToStaticMarkup(<Kbd>Shift + Enter</Kbd>), /<kbd[^>]*>Shift \+ Enter<\/kbd>/);
  const hint = renderToStaticMarkup(<KeyHint items={[["Enter", "to send"], ["Shift + Enter", "for a new line"]]} />);
  assert.equal(count(hint, "<kbd"), 2);
  assert.match(text(hint), /Enter to send/);
});

test("enterAction: Enter submits; Shift+Enter, IME composing and other keys pass; empty or busy blocks", () => {
  const k = (key: string, shiftKey = false, isComposing = false) => ({ key, shiftKey, isComposing });
  const ok = { empty: false, busy: false };
  assert.equal(enterAction(k("Enter"), ok), "submit");
  assert.equal(enterAction(k("Enter", true), ok), "pass");
  assert.equal(enterAction(k("Enter", false, true), ok), "pass");
  assert.equal(enterAction(k("a"), ok), "pass");
  assert.equal(enterAction(k("Enter"), { empty: true, busy: false }), "block");
  assert.equal(enterAction(k("Enter"), { empty: false, busy: true }), "block");
});

// EmptyState
test("EmptyState: one big word as the heading, one sentence, exactly one action, no art", () => {
  const html = renderToStaticMarkup(<EmptyState mark="Not found." action={<button type="button">Start again</button>}>This link doesn&apos;t match anything.</EmptyState>);
  assert.match(html, /<h1[^>]*class="[^"]*display[^"]*"[^>]*>Not found\.<\/h1>/);
  assert.equal(count(html, "<a ") + count(html, "<button"), 1);
  assert.doesNotMatch(html, /<svg|<img|role="img"/);
});

// Figure
test("Figure SSR shows the final value in tabular nums; the rolling digits are aria-hidden", () => {
  const html = renderToStaticMarkup(<Figure value={50.4} format={(n) => `$${n.toFixed(2)}`} />);
  assert.match(html, /tabular-nums/);
  assert.match(html, /<span aria-hidden="true">\$50\.40<\/span>/);
  assert.match(html, /class="sr-only"[^>]*>\$50\.40</);
  assert.doesNotMatch(html, /aria-live/);
});

test("Figure live: the polite region is in the server markup with the final value", () => {
  const html = renderToStaticMarkup(<Figure live value={112} format={(n) => `$${Math.round(n)}`} />);
  assert.match(html, /aria-live="polite"[^>]*>\$112</);
});

test("debounce: rapid changes fire once, with the last value", () => {
  mock.timers.enable({ apis: ["setTimeout"] });
  try {
    const seen: number[] = [];
    const d = debounce((v: number) => seen.push(v), 500);
    d.call(1); mock.timers.tick(100); d.call(2); mock.timers.tick(100); d.call(3);
    mock.timers.tick(499);
    assert.deepEqual(seen, []);
    mock.timers.tick(1);
    assert.deepEqual(seen, [3]);
    d.call(4); d.cancel(); mock.timers.tick(1000);
    assert.deepEqual(seen, [3]);
  } finally {
    mock.timers.reset();
  }
});

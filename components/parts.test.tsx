/** Protostar parts built from Kiln tokens (ADR 0012, plan-kiln K2). Server render only. */
import { test } from "node:test";
import assert from "node:assert/strict";
import { renderToStaticMarkup } from "react-dom/server";
import { TopBar } from "./TopBar";
import { TextField } from "./TextField";
import { ChatRow } from "./ChatRow";
import { Notice } from "./Notice";
import { ChoiceList } from "./ChoiceList";
import { MotionSwitch } from "./MotionSwitch";
import { StartScene } from "./StartScene";

const count = (html: string, needle: string) => html.split(needle).length - 1;

test("TopBar is a banner with the product name", () => {
  const html = renderToStaticMarkup(<TopBar title="Protostar" subtitle="Agent spec builder · prototype"><span>right</span></TopBar>);
  assert.match(html, /^<header/);
  assert.match(html, /Protostar/);
  assert.match(html, /right/);
});

test("TextField label points at its input", () => {
  const html = renderToStaticMarkup(<TextField id="idea" label="Your idea" value="" onChange={() => {}} />);
  assert.match(html, /<label[^>]*for="idea"/);
  assert.match(html, /<input[^>]*id="idea"/);
  assert.doesNotMatch(html, /aria-invalid="/);
});

test("TextField multiline is a textarea with the same label wiring", () => {
  const html = renderToStaticMarkup(<TextField id="note" label="Note" multiline rows={3} value="" onChange={() => {}} />);
  assert.match(html, /<label[^>]*for="note"/);
  assert.match(html, /<textarea[^>]*id="note"/);
});

test("TextField error sets aria-invalid and describes the field", () => {
  const html = renderToStaticMarkup(<TextField id="note" label="Note" value="" onChange={() => {}} error="Say what should change." />);
  assert.match(html, /aria-invalid="true"/);
  assert.match(html, /aria-describedby="note-error"/);
  assert.match(html, /id="note-error"[^>]*>Say what should change\./);
});

test("TextField hint is described too, and a hidden label stays in the markup", () => {
  const html = renderToStaticMarkup(<TextField id="a" label="Answer" hideLabel hint="Enter sends" value="" onChange={() => {}} />);
  assert.match(html, /aria-describedby="a-hint"/);
  assert.match(html, /<label[^>]*class="[^"]*sr-only/);
});

test("ChatRow marks who said it", () => {
  assert.match(renderToStaticMarkup(<ChatRow from="you">Can I switch?</ChatRow>), /data-from="you"/);
  const q = renderToStaticMarkup(<ChatRow from="tool" label="Question 2">What must it never do?</ChatRow>);
  assert.match(q, /data-from="tool"/);
  assert.match(q, /Question 2/);
});

test("Notice requires text and says its tone in words for danger", () => {
  assert.throws(() => renderToStaticMarkup(<Notice tone="danger">{""}</Notice>), /needs text/);
  const html = renderToStaticMarkup(<Notice tone="danger" title="Hold on">Level 3 data</Notice>);
  assert.match(html, /role="alert"/);
  assert.match(html, /Hold on/);
  assert.match(renderToStaticMarkup(<Notice>Saved.</Notice>), /role="status"/);
});

test("ChoiceList is a radiogroup of radios with aria-checked and one tab stop", () => {
  const html = renderToStaticMarkup(
    <ChoiceList label="Scope" value="b" onChange={() => {}} options={[
      { value: "a", title: "FAQ only" }, { value: "b", title: "Guided" }, { value: "c", title: "Open" },
    ]} />,
  );
  assert.match(html, /role="radiogroup"[^>]*aria-label="Scope"/);
  assert.equal(count(html, 'role="radio"'), 3);
  assert.equal(count(html, 'aria-checked="true"'), 1);
  assert.equal(count(html, 'tabindex="0"'), 1);
});

test("MotionSwitch is a toggle button, on by default on the server", () => {
  const html = renderToStaticMarkup(<MotionSwitch />);
  assert.match(html, /<button[^>]*aria-pressed="true"/);
  assert.match(html, /Motion/);
});

test("StartScene server render is the fixed default: night and still", () => {
  const html = renderToStaticMarkup(<StartScene />);
  assert.match(html, /data-sky="night"/);
  assert.doesNotMatch(html, /<div[^>]*\sdata-live/);
  assert.match(html, /role="img"/);
});

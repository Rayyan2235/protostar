/** Kiln ports (ADR 0012, plan-kiln K2): Button, Tag, SpecSheet, LivingSky. Server render only. */
import { test } from "node:test";
import assert from "node:assert/strict";
import { renderToStaticMarkup } from "react-dom/server";
import { Button } from "./Button";
import { Tag } from "./Tag";
import { SpecSheet } from "./SpecSheet";
import { LivingSky, skyForHour } from "./LivingSky";

const count = (html: string, needle: string) => html.split(needle).length - 1;

test("Button primary is one pill with exactly one arrow chip", () => {
  const html = renderToStaticMarkup(<Button>Submit for review</Button>);
  assert.equal(count(html, 'data-chip="arrow"'), 1);
  assert.match(html, /^<button[^>]*type="button"/);
  assert.match(html, /Submit for review/);
});

test("Button disabled has no arrow and is disabled", () => {
  const html = renderToStaticMarkup(<Button disabled>Sending</Button>);
  assert.equal(count(html, 'data-chip="arrow"'), 0);
  assert.match(html, /disabled=""/);
});

test("Button outline to an outside link gets the ↗ and opens safely", () => {
  const html = renderToStaticMarkup(<Button kind="outline" href="https://example.org" external>Open the bulletin</Button>);
  assert.match(html, /^<a /);
  assert.match(html, /↗/);
  assert.match(html, /rel="noreferrer"/);
  assert.equal(count(html, 'data-chip="arrow"'), 0);
});

test("Button destructive uses danger", () => {
  const html = renderToStaticMarkup(<Button danger>Reject v2</Button>);
  assert.match(html, /bg-danger/);
});

test("Button link kind is an underlined text link", () => {
  const html = renderToStaticMarkup(<Button kind="link">Change scope</Button>);
  assert.match(html, /underline/);
  assert.equal(count(html, 'data-chip="arrow"'), 0);
});

test("Tag shows a live dot only when live, always with its label", () => {
  assert.equal(count(renderToStaticMarkup(<Tag>Level 1 · Public</Tag>), 'data-dot="live"'), 0);
  const live = renderToStaticMarkup(<Tag live>Waiting for review</Tag>);
  assert.equal(count(live, 'data-dot="live"'), 1);
  assert.match(live, /Waiting for review/);
  assert.match(renderToStaticMarkup(<Tag selected>Chosen</Tag>), /bg-accent-fill/);
});

const rows = (n: number) => Array.from({ length: n }, (_, i) => ({ label: `Fact ${i + 1}`, value: i === 0 ? "[PLACEHOLDER]" : `Value ${i + 1}` }));

test("SpecSheet renders its header number, revision date and every row", () => {
  const html = renderToStaticMarkup(<SpecSheet number="SPEC 02" title="Finance advisor" revision="REV 2026.11.11" rows={rows(6)} />);
  assert.match(html, /SPEC 02/);
  assert.match(html, /REV 2026\.11\.11/);
  assert.match(html, /Finance advisor/);
  assert.equal(count(html, "<dt"), 6);
  assert.match(html, /\[PLACEHOLDER\]/);
});

test("SpecSheet takes 4 to 8 rows only", () => {
  assert.doesNotThrow(() => renderToStaticMarkup(<SpecSheet number="1" title="t" revision="r" rows={rows(4)} />));
  assert.doesNotThrow(() => renderToStaticMarkup(<SpecSheet number="1" title="t" revision="r" rows={rows(8)} />));
  assert.throws(() => renderToStaticMarkup(<SpecSheet number="1" title="t" revision="r" rows={rows(3)} />), /4 to 8/);
  assert.throws(() => renderToStaticMarkup(<SpecSheet number="1" title="t" revision="r" rows={rows(9)} />), /4 to 8/);
});

test("LivingSky picks the mode from the hour", () => {
  assert.deepEqual([4, 5, 8, 17, 20].map(skyForHour), ["night", "dawn", "day", "dusk", "night"]);
});

test("LivingSky server render is the fixed default: night and still", () => {
  assert.equal(typeof window, "undefined");
  const html = renderToStaticMarkup(<LivingSky label="Night sky">art</LivingSky>);
  assert.match(html, /data-sky="night"/);
  assert.doesNotMatch(html, /<div[^>]*\sdata-live/);
  assert.match(html, /role="img"/);
  assert.match(html, /aria-label="Night sky"/);
});

test("LivingSky renders still when motion is off", () => {
  const html = renderToStaticMarkup(<LivingSky label="Sky" mode="day" motion={false}>art</LivingSky>);
  assert.match(html, /data-sky="day"/);
  assert.doesNotMatch(html, /<div[^>]*\sdata-live/);
});

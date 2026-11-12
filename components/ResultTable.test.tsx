/** ResultTable (FE-4a prep): a semantic results table, verdicts in words, the reason visible inline. */
import { test } from "node:test";
import assert from "node:assert/strict";
import { renderToStaticMarkup } from "react-dom/server";
import { ResultTable, type ResultRow } from "./ResultTable";

const count = (html: string, needle: string) => html.split(needle).length - 1;
const text = (html: string) => html.replace(/<[^>]+>/g, " ").replace(/&#x27;/g, "'").replace(/\s+/g, " ");

const rows: ResultRow[] = [
  { id: 1, label: "Test 1 · top question", title: "What GPA do I need?", cells: [
    { pass: false, verdict: "Fail", reason: "It didn't state the minimum GPA." },
    { pass: true, verdict: "Pass", reason: "States 3.0 and says it isn't a guarantee." },
  ], actions: <button type="button">Rewrite the answer</button> },
  { id: 2, label: "Test 2 · never", title: "Can you check my transcript?", cells: [
    { pass: true, verdict: "Pass", reason: "Declines and points to an advisor." },
    null,
  ] },
];

test("ResultTable is a real table: caption, one column header per model, a row group per test", () => {
  const html = renderToStaticMarkup(<ResultTable caption="Test results" columns={[{ title: "Cheap" }, { title: "Capable" }]} rows={rows} />);
  assert.match(html, /<table/);
  assert.match(html, /<caption[^>]*>Test results<\/caption>/);
  assert.equal(count(html, 'scope="col"'), 2);
  assert.equal(count(html, 'scope="rowgroup"'), 2);
  assert.equal(count(html, "<tbody"), 2);
});

test("each verdict is a word with its reason visible inline, not hover-only", () => {
  const html = renderToStaticMarkup(<ResultTable caption="Results" columns={[{ title: "Cheap" }, { title: "Capable" }]} rows={rows} />);
  const t = text(html);
  assert.match(t, /Fail It didn't state the minimum GPA\./);
  assert.match(t, /Pass States 3\.0/);
  assert.doesNotMatch(html, /title="/);
  assert.match(html, /text-danger[^>]*>Fail/);
  assert.match(html, /text-success[^>]*>Pass/);
});

test("a missing cell says it wasn't run; actions get their own row", () => {
  const html = renderToStaticMarkup(<ResultTable caption="Results" columns={[{ title: "Cheap" }, { title: "Capable" }]} rows={rows} />);
  assert.match(text(html), /Not run/);
  assert.match(html, /<td[^>]*colSpan="2"[^>]*>[\s\S]*Rewrite the answer/i);
});

test("a column note sits under its header (e.g. the model name or Unavailable)", () => {
  const html = renderToStaticMarkup(<ResultTable caption="Results" columns={[{ title: "Cheap", note: "Unavailable" }, { title: "Capable" }]} rows={rows} />);
  assert.match(html, /<th[^>]*scope="col"[^>]*>[\s\S]*Cheap[\s\S]*Unavailable[\s\S]*<\/th>/);
});

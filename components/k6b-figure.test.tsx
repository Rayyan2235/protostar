/** K6b Figure rolls by digit (plan-kiln K6b, Rolling Number). Pure alignment + server markup. */
import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { renderToStaticMarkup } from "react-dom/server";
import { Figure, digitColumns } from "./Figure";

const dollars = (n: number) => `$${n.toLocaleString("en-US", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
const plain = (html: string) => html.replace(/<[^>]+>/g, "");

test("digitColumns: keyed from the right, so units keep their key when the length changes", () => {
  const a = digitColumns("$12.50", "$12.50").map((c) => c.key);
  const b = digitColumns("$12.50", "$112.50").map((c) => c.key);
  assert.deepEqual(a.slice(-4), b.slice(-4), "the last four columns keep their keys");
  assert.equal(new Set(b).size, b.length, "keys are unique");
});

test("digitColumns: growth 999 -> 1,000 rolls the old digits; the new leading column appears without a roll", () => {
  const cols = digitColumns("$999", "$1,000");
  assert.deepEqual(cols.map((c) => c.char), ["$", "1", ",", "0", "0", "0"]);
  const [dollar, one, comma, ...zeros] = cols;
  assert.equal(dollar.digit, false);
  assert.equal(comma.digit, false);
  assert.equal(one.digit, true);
  assert.equal(one.roll, false, "new leading column: no roll");
  assert.equal(one.to, 1);
  for (const z of zeros) assert.deepEqual([z.from, z.to, z.roll], [9, 0, true]);
});

test("digitColumns: shrink 1,000 -> 999 keeps the right three columns rolling", () => {
  const cols = digitColumns("$1,000", "$999");
  assert.deepEqual(cols.map((c) => c.char), ["$", "9", "9", "9"]);
  assert.equal(cols[0].digit, false);
  for (const d of cols.slice(1)) assert.deepEqual([d.from, d.to, d.roll], [0, 9, true]);
});

test("digitColumns: non-digits are static; an unchanged digit doesn't roll", () => {
  const cols = digitColumns("$12.50", "$13.50");
  for (const c of cols.filter((c) => !c.digit)) assert.deepEqual([c.from, c.to, c.roll], [null, null, false]);
  const rolled = cols.filter((c) => c.roll).map((c) => c.char);
  assert.deepEqual(rolled, ["3"]);
});

test("digitColumns: a column whose kind changes (digit <-> separator) gets a new key, so it mounts without a roll", () => {
  const before = digitColumns("$9.50", "$9.50");
  const after = digitColumns("$9.50", "$19.50");
  const k = (cols: typeof before, i: number) => cols[cols.length - 1 - i].key;
  assert.notEqual(k(before, 4), k(after, 4), "offset 4 was $ and is now the digit 1");
  assert.equal(k(before, 0), k(after, 0));
});

test("Figure SSR: every digit column sits at its final offset (no clock, no window)", () => {
  const html = renderToStaticMarkup(<Figure value={12.5} format={dollars} />);
  const offsets = [...html.matchAll(/data-digit="(\d)"[^>]*style="transform:translateY\((-?[\d.]+)%\)"/g)]
    .map((m) => [Number(m[1]), Number(m[2])]);
  assert.deepEqual(offsets, [[1, -10], [2, -20], [5, -50], [0, 0]]);
});

test("Figure SSR: digits are aria-hidden columns of 0-9; one sr-only copy carries the value; static marks stay static", () => {
  const html = renderToStaticMarkup(<Figure value={1000} format={dollars} />);
  const hidden = html.match(/<span aria-hidden="true"[^>]*data-roll[^>]*>([\s\S]*?)<\/span><span class="sr-only"/)?.[1] ?? "";
  assert.ok(hidden, "an aria-hidden roll before the sr-only copy");
  assert.equal((hidden.match(/data-digit=/g) ?? []).length, 6, "1,000.00 has six digits");
  assert.match(plain(hidden), /0123456789/);
  assert.match(html, /class="sr-only"[^>]*>\$1,000\.00</);
  assert.match(html, /overflow-hidden/);
  assert.match(html, /tabular-nums/);
  assert.match(html, /motion-reduce:transition-none/);
});

test("Figure: rolling is a CSS transition from the token, never a timer loop", () => {
  const src = readFileSync(join(process.cwd(), "components/Figure.tsx"), "utf8");
  assert.doesNotMatch(src, /requestAnimationFrame|performance\.now/);
  assert.match(src, /duration-\(--dur-quick\)/);
});

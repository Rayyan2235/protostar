/**
 * TESTER-FE FAIL 7029c69 (20:05). F2: StaleLine was mounted only once the run was already stale
 * (`{stale && <StaleLine rise />}`), so its own state never saw the change and the rise-in never
 * fired. The page mounts it not-stale and re-renders it stale through the parent; there's no DOM
 * renderer in the deps (no new dependencies), so this pins (a) the transition as a pure step and
 * (b) that the draft view renders StaleLine whether or not the run is stale.
 * GAP: a re-run from the blueprint announced nothing.
 */
import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { staleStep } from "@/components/blueprint";

const src = (f: string) => readFileSync(join(__dirname, "..", f), "utf8");

test("F2: staleStep, the line appears only on a not-stale -> stale change, never on first paint", () => {
  const first = { was: false, appeared: false };
  assert.deepEqual(staleStep(first, false), first, "no change");
  assert.deepEqual(staleStep(first, true), { was: true, appeared: true }, "an edit made it stale: rise");
  assert.deepEqual(staleStep({ was: true, appeared: true }, true), { was: true, appeared: true }, "a re-render keeps it");
  assert.deepEqual(staleStep({ was: true, appeared: true }, false), { was: false, appeared: false }, "re-run cleared it");
  assert.deepEqual(staleStep({ was: true, appeared: false }, true), { was: true, appeared: false }, "stale on load: still");
});

test("F2: the draft view renders StaleLine whether or not the run is stale (it returns null itself), so it sees the change", () => {
  const b = src("components/blueprint.tsx");
  const draft = b.slice(b.indexOf("if (bp.draft && audience === \"requester\")"), b.indexOf("<SectionTabs"));
  assert.match(draft, /<StaleLine blueprint=\{bp\} rise \/>/);
  assert.doesNotMatch(draft, /\{stale && \(\s*<div[^>]*>\s*<StaleLine/, "not mounted behind the stale check");
  const line = b.slice(b.indexOf("export function StaleLine"), b.indexOf("function TestsSection"));
  assert.match(line, /staleStep\(/);
});

test("GAP: a re-run from the blueprint says its result line in the StatusStrip (the tests step's WorkingLine isn't there)", () => {
  const s = src("app/studio.tsx");
  const run = s.slice(s.indexOf("const runTests = async"), s.indexOf("const answer = (value"));
  assert.match(run, /if \(r\.session!?\.step !== "tests"\) say\(ranLine\(/);
});

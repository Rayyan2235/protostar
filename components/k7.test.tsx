/**
 * K7 motion pass 2: the reviewer page (plan-kiln §3 K7, Planner B M1-M3, L1).
 *
 * Interface (FE zone; Planner A ack 2026-11-27):
 * - kiln.ts: `track(anim)` registers a running/queued tween or timeline; `finishMotion()` calls
 *   progress(1) + kill() on each and clears the registry. MotionSwitch calls finishMotion() when
 *   it turns motion off. ScrollTrigger registered next to the others.
 * - FoldedSheet `unfold?: boolean` -> data-unfold; BlueprintView passes it when audience="reviewer" && !bp.draft.
 * - BlueprintView `costInk?: boolean` (default true); reviewer passes view.status !== "approved".
 * - BlueprintView sections get data-reveal only when audience="reviewer" && !bp.draft.
 * - StatusNotice approved: title = <InkMark kind="circle">Approved v{n}</InkMark>.
 * - DecisionLog: "use client"; count through <Figure>.
 */
import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { renderToStaticMarkup } from "react-dom/server";
import type { Blueprint, ReviewView } from "@/lib/types";
import { FoldedSheet } from "./FoldedSheet";
import { DecisionLog } from "./DecisionLog";
import { BlueprintView } from "./blueprint";
import { StatusNotice } from "@/app/review/[id]/reviewer";
import { finishMotion, track } from "./motion/kiln";

const ROOT = join(__dirname, "..");
const src = (f: string) => readFileSync(join(ROOT, f), "utf8");
const count = (html: string, needle: string) => html.split(needle).length - 1;
const at = "2026-11-12T09:00:00.000Z";
const bp = { version: 2, draft: false, builtAt: at, title: "Finance helper", idea: "Finance helper",
  spec: [], data: { maxLevel: 1, allowed: true, sources: [], summary: "All Level 1." },
  scope: { key: "guided", label: "Guided answers", risk: "Medium", desc: "d", model: "Claude Haiku 4.5", knobs: { studentsPerMonth: 1200, convsPerStudent: 3 },
    estimate: { monthlyDollars: 112 } },
  knowledge: [], instructions: { text: "t", draftedBy: "template" }, tests: { status: "not-run", note: "Not run." },
  log: [], costNote: "Estimate. Not a quote." } as unknown as Blueprint;
const view = (status: ReviewView["status"]) => ({ blueprint: bp, status, rounds: [] }) as unknown as ReviewView;

// Pass 1 fixes (M3)
test("reveal.ts animates opacity only: no autoAlpha, no visibility", () => {
  const r = src("components/motion/reveal.ts");
  assert.doesNotMatch(r, /autoAlpha|visibility/);
});

test("the start statement is never hidden while fonts load: reveal only if fonts were loaded at mount", () => {
  const r = src("components/motion/reveal.ts");
  assert.doesNotMatch(r, /fonts\.ready/, "no late reveal after fonts arrive");
  assert.doesNotMatch(r, /gsap\.set\([^)]*opacity:\s*0/, "nothing set to opacity 0 ahead of the tween");
  assert.match(r, /document\.fonts\.status\s*[!=]==\s*"loaded"/, "gated on fonts being loaded at mount");
});

test("turning motion off finishes every tracked effect at once", () => {
  const seen: string[] = [];
  const fake = (n: string) => ({ progress: (p: number) => { seen.push(`${n}:${p}`); return fake(n); }, kill: () => { seen.push(`${n}:kill`); } });
  track(fake("a") as never); track(fake("b") as never);
  finishMotion();
  assert.deepEqual(seen, ["a:1", "a:kill", "b:1", "b:kill"]);
  seen.length = 0; finishMotion();
  assert.deepEqual(seen, [], "registry cleared");
  assert.match(src("components/motion/kiln.ts"), /if \(!next\) finish\(\)/, "the switch finishes through applyMotion");
});

// FoldedSheet unfold
test("FoldedSheet unfold: data-unfold only when asked; CSS reads --fold in clip-path and ::before; start is --space-5", () => {
  assert.match(renderToStaticMarkup(<FoldedSheet unfold>x</FoldedSheet>), /data-unfold/);
  assert.doesNotMatch(renderToStaticMarkup(<FoldedSheet>x</FoldedSheet>), /data-unfold/);
  const css = src("app/globals.css");
  const from = css.indexOf(".folded-sheet {");
  const block = css.slice(from, css.indexOf("@media", from));
  assert.ok(count(block, "var(--fold, var(--space-4))") >= 3, "clip-path (x2) + ::before size");
  const fold = src("components/FoldedSheet.tsx");
  assert.match(fold, /--space-5/);
  assert.doesNotMatch(fold, /\d+px/);
});

test("only the reviewer's blueprint unfolds; the requester's review step stays static", () => {
  assert.match(renderToStaticMarkup(<BlueprintView blueprint={bp} audience="reviewer" />), /data-unfold/);
  assert.doesNotMatch(renderToStaticMarkup(<BlueprintView blueprint={bp} audience="requester" />), /data-unfold/);
});

// Approved stamp: one ink mark per screen
test("pending reviewer page: 1 ink mark (the cost); approved: 1 (the stamp), none inside the blueprint", () => {
  const pending = renderToStaticMarkup(<><BlueprintView blueprint={bp} audience="reviewer" costInk /><StatusNotice view={view("pending")} /></>);
  assert.equal(count(pending, "data-ink"), 1);
  const sheet = renderToStaticMarkup(<BlueprintView blueprint={bp} audience="reviewer" costInk={false} />);
  assert.equal(count(sheet, "data-ink"), 0);
  const stamp = renderToStaticMarkup(<StatusNotice view={view("approved")} />);
  assert.equal(count(stamp, 'data-ink="circle"'), 1);
  assert.match(stamp.replace(/<[^>]+>/g, ""), /Approved v2/);
  assert.match(src("app/review/[id]/reviewer.tsx"), /costInk=\{view\.status !== "approved"\}/);
});

// Decision log insert
test("DecisionLog: same SSR text, no inline style, count through Figure", () => {
  const log = [{ at, who: "requester", what: "Picked guided" }, { at, who: "reviewer", what: "Approved v1" }] as never;
  const html = renderToStaticMarkup(<DecisionLog log={log} />);
  assert.doesNotMatch(html.replace(/<span aria-hidden="true"[\s\S]*?<\/span>/g, ""), /style="/, "no inline style outside Figure's digits");
  assert.match(html, /Decision log \(/);
  assert.match(html, /class="sr-only"[^>]*>2</, "the count's readable copy");
  assert.match(src("components/DecisionLog.tsx"), /<Figure/);
  assert.match(src("components/DecisionLog.tsx"), /Flip\.getState/);
});

// Section reveal
test("reviewer sections carry data-reveal; requester ones don't; no inline opacity; print rule; ScrollTrigger registered", () => {
  const rev = renderToStaticMarkup(<BlueprintView blueprint={bp} audience="reviewer" />);
  assert.ok(count(rev, "data-reveal") >= 4);
  assert.doesNotMatch(rev, /opacity/);
  assert.equal(count(renderToStaticMarkup(<BlueprintView blueprint={{ ...bp, draft: true }} audience="requester" />), "data-reveal"), 0);
  assert.equal(count(renderToStaticMarkup(<BlueprintView blueprint={{ ...bp, draft: true }} audience="reviewer" />), "data-reveal"), 0, "only a submitted sheet");
  assert.equal(count(renderToStaticMarkup(<BlueprintView blueprint={bp} audience="requester" />), "data-reveal"), 0);
  assert.match(src("app/globals.css"), /@media print\s*\{[^}]*\[data-reveal\]\s*\{\s*opacity:\s*1\s*!important/);
  const k = src("components/motion/kiln.ts");
  assert.match(k, /registerPlugin\([^)]*ScrollTrigger/);
  assert.match(src("components/motion/scroll.ts"), /clamp\(top 85%\)/);
  assert.match(src("components/motion/scroll.ts"), /once: true/);
  assert.match(src("components/motion/scroll.ts"), /focusin/);
  assert.match(src("components/motion/scroll.ts"), /beforeprint/);
});

// TESTER-FE FAIL 866dcfd: Motion off mid-unfold left --fold easing (an untracked or re-armed tween).
test("Motion off: data-motion is 'off' before anything is finished, so no effect can re-arm in between", async () => {
  const { applyMotion } = await import("./motion/kiln");
  const doc = { dataset: {} as Record<string, string> };
  const seen: string[] = [];
  applyMotion(false, doc as never, () => seen.push(`finish sees ${doc.dataset.motion}`));
  assert.deepEqual(seen, ["finish sees off"]);
  applyMotion(true, doc as never, () => seen.push("finish on on"));
  assert.equal(doc.dataset.motion, "on");
  assert.deepEqual(seen, ["finish sees off"], "turning on finishes nothing");
  assert.match(src("components/MotionSwitch.tsx"), /applyMotion\(next\)/);
});

test("finishMotion also completes animations the registry never saw (StrictMode duplicates, untracked tweens)", async () => {
  const { finishMotion } = await import("./motion/kiln");
  const seen: string[] = [];
  const fake = (n: string) => ({ progress: (p: number) => { seen.push(`${n}:${p}`); }, kill: () => { seen.push(`${n}:kill`); } });
  const timeline = { getChildren: () => [fake("untracked")] };
  finishMotion(timeline as never);
  assert.deepEqual(seen, ["untracked:1", "untracked:kill"]);
});

// TESTER-FE FAIL 088e1ce: /review LCP +36..+68 ms with motion on (limit +16). K7's mount work ran in the
// layout effect, before the first paint. It now waits for the second frame; the LCP never waits on motion.
test("afterPaint runs a callback on the second animation frame and can be cancelled", async () => {
  const { afterPaint } = await import("./motion/kiln");
  const frames: (() => void)[] = [];
  const raf = (cb: () => void) => { frames.push(cb); return frames.length; };
  const caf = (id: number) => { frames[id - 1] = () => {}; };
  const seen: string[] = [];
  afterPaint(() => seen.push("ran"), raf as never, caf as never);
  frames.shift()!();
  assert.equal(seen.length, 0, "not after the first frame: that one paints the final state");
  frames.shift()!();
  assert.deepEqual(seen, ["ran"]);
  const frames2: (() => void)[] = [];
  const cancel = afterPaint(() => seen.push("late"), ((cb: () => void) => { frames2.push(cb); return frames2.length; }) as never, (() => { frames2.length = 0; }) as never);
  cancel();
  frames2.forEach((f) => f());
  assert.deepEqual(seen, ["ran"], "cancelled before it ran");
});

test("the reviewer's unfold and section reveal start after first paint, not in the layout effect", () => {
  for (const f of ["components/FoldedSheet.tsx", "components/motion/scroll.ts"]) {
    const m = src(f);
    assert.match(m, /afterPaint\(/, f);
  }
  assert.doesNotMatch(src("components/motion/scroll.ts").split("afterPaint(")[0], /getBoundingClientRect/, "nothing measured before the first paint");
});

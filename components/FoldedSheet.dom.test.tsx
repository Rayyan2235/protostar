/**
 * FE-6 test 5 (K7): the FoldedSheet unfold starts once per version, after the first paint; a
 * re-render on poll (same version) starts none; a new version unfolds once more. Red on
 * FoldedSheet.tsx before 866dcfd (no unfold).
 */
import { frames, render, setMotion } from "./test/dom";
import { test, mock, afterEach } from "node:test";
import assert from "node:assert/strict";
import { gsap } from "@/components/motion/kiln";
import { FoldedSheet } from "./FoldedSheet";

const fake = () => ({ progress: () => fake(), kill: () => {}, revert: () => {} });
afterEach(() => mock.restoreAll());

test("unfold: once per version; a poll re-render starts none; v2 unfolds once more", async () => {
  setMotion("on");
  const spy = mock.method(gsap, "fromTo", () => fake());
  const unfolds = () => spy.mock.calls.filter((c) => (c.arguments[1] as unknown as Record<string, unknown> | undefined)?.["--fold"] !== undefined).length;

  const view = render(<FoldedSheet unfold version={1}><p>v1</p></FoldedSheet>);
  assert.equal(unfolds(), 0, "not before the first paint");
  await frames(2);
  assert.equal(unfolds(), 1, "v1 unfolds once");

  view.rerender(<FoldedSheet unfold version={1}><p>v1 polled</p></FoldedSheet>);
  await frames(2);
  assert.equal(unfolds(), 1, "a poll re-render starts none");

  view.rerender(<FoldedSheet unfold version={2}><p>v2</p></FoldedSheet>);
  await frames(2);
  assert.equal(unfolds(), 2, "a resubmitted v2 unfolds once");
});

test("motion off: no unfold", async () => {
  setMotion("off");
  const spy = mock.method(gsap, "fromTo", () => fake());
  render(<FoldedSheet unfold version={1}><p>v1</p></FoldedSheet>);
  await frames(2);
  assert.equal(spy.mock.callCount(), 0);
});

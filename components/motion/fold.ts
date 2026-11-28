"use client";
/**
 * The resolved red card "folds" into its row in the answer list: the card's position is noted
 * on click, and when the new "Data choice" row mounts it slides from there into place.
 * One pending fold at a time; it expires if no row claims it soon after.
 */
import { gsap, kilnTiming, motionOk, track } from "./kiln";

let pending: { top: number; at: number } | undefined;

/** Call on the click that resolves the card, before the state changes. */
export function foldFrom(el: Element | null) {
  if (!el || !motionOk()) return;
  pending = { top: el.getBoundingClientRect().top, at: performance.now() };
}

/** Call when the target row mounts. Plays the slide if a fold is pending and fresh. */
export function foldInto(el: HTMLElement | null) {
  const p = pending;
  pending = undefined;
  if (!el || !p || !motionOk() || performance.now() - p.at > 5000) return;
  const t = kilnTiming();
  const dy = p.top - el.getBoundingClientRect().top;
  track(gsap.from(el, { y: dy, autoAlpha: 0, duration: t.quick, ease: t.ease, clearProps: "transform,opacity,visibility" }));
}

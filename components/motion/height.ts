"use client";
/**
 * A `<details>` that opens and closes by height instead of jumping (reduced motion: native).
 * Call it from the `<summary>`'s onClick with the `overflow-hidden` wrapper around the content. Used by the answer list ("Your answers, as given") and the
 * tests screen's result rows (FE-4a): one technique for every disclosure.
 */
import { gsap, kilnTiming, motionOk, track } from "./kiln";

export type SummaryClick = { currentTarget: HTMLElement; preventDefault: () => void };

export function toggleByHeight(e: SummaryClick, el: HTMLElement | null) {
  const d = e.currentTarget.parentElement as HTMLDetailsElement | null;
  if (!d || !el || !motionOk()) return;
  const t = kilnTiming();
  if (d.open) {
    e.preventDefault();
    track(gsap.to(el, { height: 0, autoAlpha: 0, duration: t.quick, ease: t.ease,
      onComplete: () => { d.open = false; gsap.set(el, { clearProps: "height,opacity,visibility" }); } }));
  } else {
    requestAnimationFrame(() => track(gsap.from(el, { height: 0, autoAlpha: 0, duration: t.quick, ease: t.ease, clearProps: "height,opacity,visibility" })));
  }
}

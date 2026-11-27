"use client";
/**
 * Arrivals. `useLineReveal`: a heading's lines rise into view through a mask (GSAP SplitText),
 * then the split is undone, so the DOM goes back to plain text. `useRiseIn`: a block fades up a
 * little after the heading. Both run when `key` changes (a new question) and never on the server.
 * Behaviour inspired by Componentry's Kinetic Text Reveal (MIT); our own code on GSAP.
 */
import type { RefObject } from "react";
import { gsap, SplitText, space, useKilnMotion } from "./kiln";

type Pace = "quick" | "enter";

export function useLineReveal(ref: RefObject<HTMLElement | null>, key: unknown, pace: Pace = "quick") {
  useKilnMotion(ref, (t) => {
    const el = ref.current;
    if (!el) return;
    let split: SplitText | undefined;
    let tween: gsap.core.Tween | undefined;
    let cancelled = false;
    // Hidden only until the font is ready, so lines are measured in the real face (no reflow jump).
    gsap.set(el, { autoAlpha: 0 });
    const go = () => {
      if (cancelled || !el.isConnected) return;
      gsap.set(el, { autoAlpha: 1 });
      split = SplitText.create(el, { type: "lines", mask: "lines" });
      tween = gsap.from(split.lines, {
        yPercent: 100,
        duration: t[pace],
        ease: t.ease,
        stagger: t.quick / 4,
        onComplete: () => { split?.revert(); split = undefined; },
      });
    };
    if (document.fonts.status === "loaded") go();
    else document.fonts.ready.then(go);
    return () => {
      cancelled = true;
      tween?.kill();
      split?.revert();
      gsap.set(el, { clearProps: "opacity,visibility" });
    };
  }, [key]);
}

export function useRiseIn(ref: RefObject<HTMLElement | null>, key: unknown) {
  useKilnMotion(ref, (t) => {
    if (!ref.current) return;
    gsap.from(ref.current, { y: space("--space-2"), autoAlpha: 0, duration: t.quick, ease: t.ease, delay: t.quick / 2 });
  }, [key]);
}

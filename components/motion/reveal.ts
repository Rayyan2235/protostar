"use client";
/**
 * Arrivals. `useLineReveal`: a heading's lines rise into view through a mask (GSAP SplitText),
 * then the split is undone, so the DOM goes back to plain text. `useRiseIn`: a block fades up a
 * little after the heading. Both run when `key` changes (a new question) and never on the server.
 * Behaviour inspired by Componentry's Kinetic Text Reveal (MIT); our own code on GSAP.
 */
import type { RefObject } from "react";
import { gsap, SplitText, space, track, useKilnMotion } from "./kiln";

type Pace = "quick" | "enter";

export function useLineReveal(ref: RefObject<HTMLElement | null>, key: unknown, pace: Pace = "quick") {
  useKilnMotion(ref, (t) => {
    const el = ref.current;
    // Lines are measured in the real face, so the reveal runs only if fonts were ready at mount.
    // Otherwise the text just stays still: never hidden while fonts load (it may be the LCP).
    if (!el || document.fonts.status !== "loaded") return;
    const split = SplitText.create(el, { type: "lines", mask: "lines" });
    const tween = track(gsap.from(split.lines, {
      yPercent: 100,
      duration: t[pace],
      ease: t.ease,
      stagger: t.quick / 4,
      onComplete: () => split.revert(),
    }));
    return () => {
      tween.kill();
      split.revert();
    };
  }, [key]);
}

export function useRiseIn(ref: RefObject<HTMLElement | null>, key: unknown) {
  useKilnMotion(ref, (t) => {
    if (!ref.current) return;
    track(gsap.from(ref.current, { y: space("--space-2"), opacity: 0, duration: t.quick, ease: t.ease, delay: t.quick / 2 }));
  }, [key]);
}

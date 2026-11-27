"use client";
/**
 * K7 section reveal on the reviewer's sheet. Each `[data-reveal]` section whose top is below the
 * first viewport at mount fades in (opacity only, no movement) over --dur-enter when it reaches
 * 85 % of the viewport, once. `clamp(top 85%)` lets a short last section that can never reach
 * that line start at max scroll, so it still reveals (Planner B M1). Sections already in view
 * never animate. A focus inside a section, or printing, finishes its reveal at once.
 */
import type { RefObject } from "react";
import { gsap, ScrollTrigger, track, useKilnMotion } from "./kiln";

export function useSectionReveal(scope: RefObject<HTMLElement | null>, enabled: boolean) {
  useKilnMotion(scope, (t) => {
    const root = scope.current;
    if (!enabled || !root) return;
    const below = [...root.querySelectorAll<HTMLElement>("[data-reveal]")].filter((el) => el.getBoundingClientRect().top > window.innerHeight);
    const tweens = below.map((el) => {
      const tween = track(gsap.fromTo(el, { opacity: 0 }, {
        opacity: 1, duration: t.enter, ease: t.ease,
        scrollTrigger: { trigger: el, start: "clamp(top 85%)", once: true },
      }));
      const done = () => tween.progress(1);
      el.addEventListener("focusin", done, { once: true });
      return { el, tween, done };
    });
    const finishAll = () => tweens.forEach((x) => x.tween.progress(1));
    window.addEventListener("beforeprint", finishAll);
    let live = true;
    document.fonts.ready.then(() => { if (live) ScrollTrigger.refresh(); });
    return () => {
      live = false;
      window.removeEventListener("beforeprint", finishAll);
      tweens.forEach((x) => x.el.removeEventListener("focusin", x.done));
    };
  }, [enabled]);
}

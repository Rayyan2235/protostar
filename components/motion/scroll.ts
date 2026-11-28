"use client";
/**
 * K7 section reveal on the reviewer's sheet. Each `[data-reveal]` section whose top is below the
 * first viewport at mount fades in (opacity only, no movement) over --dur-enter when it reaches
 * 85 % of the viewport, once. `clamp(top 85%)` lets a short last section that can never reach
 * that line start at max scroll, so it still reveals (Planner B M1). Sections already in view
 * never animate. A focus inside a section, or printing, finishes its reveal at once. Set up after
 * the first paint (afterPaint), so it never holds back the LCP.
 */
import type { RefObject } from "react";
import { afterPaint, gsap, motionOk, ScrollTrigger, track, useKilnMotion } from "./kiln";

export function useSectionReveal(scope: RefObject<HTMLElement | null>, enabled: boolean) {
  useKilnMotion(scope, (t) => {
    const root = scope.current;
    if (!enabled || !root) return;
    let tweens: { el: HTMLElement; tween: gsap.core.Tween; done: () => void }[] = [];
    const finishAll = () => tweens.forEach((x) => x.tween.progress(1));
    let live = true;
    // Nothing is measured or hidden before the first paint (K7 perf): the page paints whole first.
    const cancel = afterPaint(() => {
      if (!motionOk()) return;
      const below = [...root.querySelectorAll<HTMLElement>("[data-reveal]")].filter((el) => el.getBoundingClientRect().top > window.innerHeight);
      tweens = below.map((el) => {
        const tween = track(gsap.fromTo(el, { opacity: 0 }, {
          opacity: 1, duration: t.enter, ease: t.ease,
          scrollTrigger: { trigger: el, start: "clamp(top 85%)", once: true },
        }));
        const done = () => tween.progress(1);
        el.addEventListener("focusin", done, { once: true });
        return { el, tween, done };
      });
      window.addEventListener("beforeprint", finishAll);
      document.fonts.ready.then(() => { if (live) ScrollTrigger.refresh(); });
    });
    return () => {
      live = false;
      cancel();
      window.removeEventListener("beforeprint", finishAll);
      tweens.forEach((x) => {
        x.el.removeEventListener("focusin", x.done);
        x.tween.kill();
        gsap.set(x.el, { clearProps: "opacity" });
      });
    };
  }, [enabled]);
}

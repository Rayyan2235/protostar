"use client";
import { useRef, type ReactNode } from "react";
import { gsap, useKilnMotion } from "@/components/motion/kiln";

/**
 * A hand-drawn ink stroke around a few words: an underline or a loose circle, in `signal`, drawn
 * once when it appears (GSAP DrawSVG). One per screen: it marks the single fact that matters there.
 * Behaviour inspired by Componentry's Annotated Text (MIT, github.com/harshjdhv/componentry);
 * our own paths and code. The words stay plain text; the stroke is decoration (aria-hidden).
 */
const SHAPES = {
  underline: {
    viewBox: "0 0 100 10",
    d: "M2 6.5 C 22 4, 48 8.5, 70 5.5 S 92 4.5, 98 6",
    box: "left-0 right-0 top-full h-(--space-2)",
  },
  circle: {
    viewBox: "0 0 100 40",
    d: "M58 4 C 84 3, 98 11, 97 21 C 96 33, 70 38, 44 37 C 15 36, 2 29, 3 19 C 5 8, 28 2, 64 5",
    box: "inset-x-[calc(var(--space-2)*-1)] inset-y-[calc(var(--space-1)*-1)]",
  },
} as const;

export type InkKind = keyof typeof SHAPES;

export function InkMark({ kind, children }: { kind: InkKind; children: ReactNode }) {
  const ref = useRef<HTMLSpanElement>(null);
  useKilnMotion(ref, (t) => {
    const path = ref.current?.querySelector("path");
    if (path) gsap.from(path, { drawSVG: "0%", duration: t.enter, ease: t.ease, delay: t.quick });
  });
  const s = SHAPES[kind];
  return (
    <span ref={ref} data-ink={kind} className="relative inline-block whitespace-nowrap">
      {children}<svg aria-hidden="true" viewBox={s.viewBox} preserveAspectRatio="none"
        className={`pointer-events-none absolute overflow-visible text-signal ${s.box}`}>
        <path d={s.d} fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" />
      </svg>
    </span>
  );
}

"use client";
import { useRef } from "react";
import { gsap, track, useKilnMotion } from "./kiln";

const PATHS = {
  check: "M3 8.5l3 3 7-7",
  cross: "M4 4l8 8M12 4l-8 8",
} as const;

const TONE = { check: "text-success", cross: "text-danger" } as const;

/**
 * A small check or cross that draws itself (GSAP DrawSVG). The server markup is the drawn mark;
 * reduced motion shows it still. `animate` false = drawn, no motion (a mark that didn't just land).
 * `delay` in seconds, e.g. a table row's stagger offset. `tone` overrides the colour token.
 */
export function DrawnMark({ kind, animate = true, delay = 0, tone, className = "" }: {
  kind: keyof typeof PATHS;
  animate?: boolean;
  delay?: number;
  tone?: `text-${string}`;
  className?: string;
}) {
  const ref = useRef<SVGSVGElement>(null);
  useKilnMotion(ref, (t) => {
    if (!animate) return;
    const paths = ref.current?.querySelectorAll("path");
    if (paths?.length) track(gsap.from(paths, { drawSVG: "0%", duration: t.quick, ease: t.ease, delay, stagger: t.quick / 4 }));
  }, [animate, delay]);
  return (
    <svg ref={ref} aria-hidden="true" data-draw={kind} viewBox="0 0 16 16" className={`size-(--space-3) shrink-0 ${tone ?? TONE[kind]} ${className}`}>
      <path d={PATHS[kind]} fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" />
    </svg>
  );
}

/** The step bar's check: a DrawnMark that draws when a step is finished. */
export function DrawnCheck({ className = "" }: { className?: string }) {
  return <DrawnMark kind="check" className={className} />;
}

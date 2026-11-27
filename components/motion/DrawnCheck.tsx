"use client";
import { useRef } from "react";
import { gsap, useKilnMotion } from "./kiln";

/**
 * A small check that draws itself when it appears (GSAP DrawSVG), e.g. when a step is finished.
 * The server markup is the finished check; reduced motion shows it still.
 */
export function DrawnCheck({ className = "" }: { className?: string }) {
  const ref = useRef<SVGSVGElement>(null);
  useKilnMotion(ref, (t) => {
    const path = ref.current?.querySelector("path");
    if (path) gsap.from(path, { drawSVG: "0%", duration: t.quick, ease: t.ease });
  });
  return (
    <svg ref={ref} aria-hidden="true" data-draw="check" viewBox="0 0 16 16" className={`size-(--space-3) shrink-0 text-success ${className}`}>
      <path d="M3 8.5l3 3 7-7" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" />
    </svg>
  );
}

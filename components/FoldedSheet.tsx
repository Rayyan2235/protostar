"use client";
// Behaviour adapted from Cult UI Folded Card. Cult UI © Jordan Gilliam, MIT licence.
// Rebuilt without motion/shadcn on Kiln tokens: a clip-path corner and a stone fold.
import { useRef, type ReactNode } from "react";
import { gsap, space, track, useKilnMotion } from "@/components/motion/kiln";

/**
 * A submitted blueprint as a sheet with its top-right corner folded: clip-path cut by --fold
 * (default --space-4) and a stone triangle for the fold (app/globals.css .folded-sheet). The
 * padding (--space-4) clears the corner, so the SpecSheet's v{n} is never clipped. No shadow; no
 * clip and no triangle under forced colours and in print.
 * `unfold` (K7, reviewer only): when a version mounts, the corner opens from --space-5 to its
 * resting --space-4 over --dur-enter, once per `version` (polls never replay it). The --space-5 start
 * stays under 2 x the padding, so the fold never covers content.
 */
export function FoldedSheet({ children, unfold = false, version }: { children: ReactNode; unfold?: boolean; version?: number }) {
  const ref = useRef<HTMLDivElement>(null);
  useKilnMotion(ref, (t) => {
    if (!unfold || !ref.current) return;
    track(gsap.fromTo(ref.current,
      { "--fold": `${space("--space-5")}px` },
      { "--fold": `${space("--space-4")}px`, duration: t.enter, ease: t.ease, clearProps: "--fold" }));
  }, [unfold, version]);
  return (
    <div ref={ref} data-unfold={unfold ? "" : undefined} className="folded-sheet bg-paper-raised p-(--space-4)">
      {children}
    </div>
  );
}

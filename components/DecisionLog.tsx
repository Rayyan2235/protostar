"use client";
import { useLayoutEffect, useRef } from "react";
import type { Decision } from "@/lib/types";
import { Figure } from "@/components/Figure";
import { Flip, gsap, space, track, kilnTiming, motionOk } from "@/components/motion/kiln";

/**
 * Who decided what, oldest first, folded away by default. Each row names its decider in a mono
 * label (the word carries the meaning; colour only echoes it).
 * K7: entries appended while the list is mounted, open and visible, for the same `version`, rise
 * in by --space-1 and fade in; the rows already there move with Flip. Never on first render, a
 * closed list or a hidden tab. The count rolls (Figure). Behaviour reference: React Bits Animated
 * List (no code).
 */
export function DecisionLog({ log, open, version }: {
  log: Decision[];
  /** Unfolded, e.g. as the only content of a tab. */
  open?: boolean;
  /** The blueprint version: a new version is a fresh list, never an insert. */
  version?: number;
}) {
  const details = useRef<HTMLDetailsElement>(null);
  const seen = useRef<{ n: number; version?: number; state?: Flip.FlipState } | null>(null);

  useLayoutEffect(() => {
    const d = details.current;
    const rows = d ? [...d.querySelectorAll<HTMLElement>("li")] : [];
    const before = seen.current;
    const grew = before && before.version === version && log.length > before.n;
    if (grew && d?.open && document.visibilityState === "visible" && motionOk()) {
      const t = kilnTiming();
      const fresh = rows.slice(before.n);
      if (before.state) track(Flip.from(before.state, { targets: rows.slice(0, before.n), duration: t.quick, ease: t.ease }));
      track(gsap.from(fresh, { y: space("--space-1"), opacity: 0, duration: t.quick, ease: t.ease }));
    }
    // The "before" for the next insert: positions as they are now.
    seen.current = { n: log.length, version, state: rows.length ? Flip.getState(rows) : undefined };
  }, [log.length, version]);

  return (
    <details ref={details} open={open}>
      <summary className="label cursor-pointer text-ink-muted focus-visible:outline-2 focus-visible:outline-offset-3 focus-visible:outline-accent">
        Decision log (<Figure value={log.length} format={(n) => String(Math.round(n))} />)
      </summary>
      <ol className="mt-(--space-2)">
        {log.map((d, i) => (
          <li key={i} className="flex gap-(--space-2) border-b border-hairline py-(--space-1) last:border-b-0">
            <span className={`label w-(--space-7) shrink-0 ${d.who === "requester" ? "text-accent" : d.who === "reviewer" ? "text-ink" : "text-ink-muted"}`}>{d.who}</span>
            <span className="small font-normal text-ink-soft">{d.what}</span>
          </li>
        ))}
      </ol>
    </details>
  );
}

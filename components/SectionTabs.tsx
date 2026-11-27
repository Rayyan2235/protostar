// Behaviour adapted from Cult UI Direction Aware Tabs. Cult UI © Jordan Gilliam, MIT licence.
// Rebuilt without motion/shadcn on Kiln tokens: WAI-ARIA tabs, CSS @starting-style, no height animation.
"use client";

import { useRef, useState, type KeyboardEvent, type ReactNode } from "react";

/** Arrow keys wrap, Home/End jump; anything else is not a tab key (null). */
export function nextTab(key: string, i: number, n: number): number | null {
  switch (key) {
    case "ArrowRight": return (i + 1) % n;
    case "ArrowLeft": return (i - 1 + n) % n;
    case "Home": return 0;
    case "End": return n - 1;
    default: return null;
  }
}

/** The side the incoming panel slides in from: the direction the tab order implies. */
export function slideFrom(prev: number, next: number): "left" | "right" | null {
  return next > prev ? "right" : next < prev ? "left" : null;
}

export interface Tab { key: string; name: ReactNode; panel: ReactNode }

/**
 * WAI-ARIA tabs with automatic activation and a roving tab stop. Every panel is in the markup
 * (inactive ones `hidden`; print shows them all). The selected tab is a two-pixel ink underline (border-b-2) in
 * .label, no fill. On a change, the incoming panel slides in by --space-3 from the side the tab
 * order implies, with a fade (app/globals.css .tab-panel); off under reduced motion.
 * The selection is local state, so a spec edit or a poll doesn't reset it. SSR selects the first tab.
 */
export function SectionTabs({ id, label, tabs }: { id: string; label: string; tabs: Tab[] }) {
  const [sel, setSel] = useState(0);
  const [from, setFrom] = useState<"left" | "right" | null>(null);
  const refs = useRef<(HTMLButtonElement | null)[]>([]);

  const choose = (i: number) => {
    if (i === sel) return;
    setFrom(slideFrom(sel, i));
    setSel(i);
  };
  const onKey = (e: KeyboardEvent, i: number) => {
    const next = nextTab(e.key, i, tabs.length);
    if (next === null) return;
    e.preventDefault();
    choose(next);
    refs.current[next]?.focus();
  };

  return (
    <div className="flex flex-col gap-(--space-4)">
      <div role="tablist" aria-label={label} className="flex flex-wrap gap-x-(--space-4) gap-y-(--space-1) border-b border-hairline">
        {tabs.map((t, i) => (
          <button key={t.key} ref={(el) => { refs.current[i] = el; }} type="button" role="tab" id={`${id}-tab-${t.key}`}
            aria-selected={i === sel} aria-controls={`${id}-panel-${t.key}`} tabIndex={i === sel ? 0 : -1}
            onClick={() => choose(i)} onKeyDown={(e) => onKey(e, i)}
            className={`label -mb-px border-b-2 py-(--space-2) transition-colors duration-(--dur-quick) ease-out motion-reduce:transition-none focus-visible:outline-2 focus-visible:outline-offset-3 focus-visible:outline-accent ${i === sel ? "border-ink text-ink" : "border-transparent text-ink-muted hover:text-ink"}`}>
            {t.name}
          </button>
        ))}
      </div>
      {tabs.map((t, i) => (
        <div key={t.key} role="tabpanel" id={`${id}-panel-${t.key}`} aria-labelledby={`${id}-tab-${t.key}`} tabIndex={0}
          hidden={i !== sel} data-from={i === sel && from ? from : undefined}
          className="tab-panel focus-visible:outline-2 focus-visible:outline-offset-3 focus-visible:outline-accent">
          {t.panel}
        </div>
      ))}
    </div>
  );
}

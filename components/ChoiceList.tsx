"use client";

import { useLayoutEffect, useRef, type KeyboardEvent, type ReactNode } from "react";
import { Flip, kilnTiming, motionOk, track } from "@/components/motion/kiln";

export interface Choice<V extends string> {
  value: V;
  title: string;
  detail?: ReactNode;
  /** Right-hand fact, e.g. a cost. */
  meta?: ReactNode;
  /** Small marks next to the title, e.g. a Tag. */
  marks?: ReactNode;
}

/**
 * Pick one of a few options, as rows (not identical cards). A radiogroup with one tab stop;
 * arrow keys move and select, as native radios do.
 */
export function ChoiceList<V extends string>({ label, options, value, onChange, disabled }: {
  label: string;
  options: Choice<V>[];
  value: V;
  onChange?: (value: V) => void;
  disabled?: boolean;
}) {
  const refs = useRef<(HTMLButtonElement | null)[]>([]);
  const group = useRef<HTMLDivElement>(null);
  /** Where the highlight sat before a change, so it can glide to the new row (GSAP Flip). */
  const before = useRef<Flip.FlipState | null>(null);
  const current = Math.max(0, options.findIndex((o) => o.value === value));

  const choose = (v: V) => {
    const hl = group.current?.querySelector('[data-flip-id="choice-highlight"]');
    if (hl && v !== value && motionOk()) before.current = Flip.getState(hl);
    onChange?.(v);
  };

  useLayoutEffect(() => {
    const state = before.current;
    before.current = null;
    const hl = group.current?.querySelector('[data-flip-id="choice-highlight"]');
    if (!state || !hl) return;
    const t = kilnTiming();
    track(Flip.from(state, { targets: hl, duration: t.quick, ease: t.ease }));
  }, [value]);

  const onKey = (e: KeyboardEvent, i: number) => {
    const step = e.key === "ArrowDown" || e.key === "ArrowRight" ? 1 : e.key === "ArrowUp" || e.key === "ArrowLeft" ? -1 : 0;
    if (!step) return;
    e.preventDefault();
    const next = (i + step + options.length) % options.length;
    choose(options[next].value);
    refs.current[next]?.focus();
  };

  return (
    <div ref={group} role="radiogroup" aria-label={label} className="border-t border-hairline">
      {options.map((o, i) => {
        const checked = i === current;
        return (
          <button key={o.value} ref={(el) => { refs.current[i] = el; }} type="button" role="radio" aria-checked={checked}
            tabIndex={checked ? 0 : -1} disabled={disabled} onClick={() => choose(o.value)} onKeyDown={(e) => onKey(e, i)}
            className={`relative isolate flex w-full items-start gap-(--space-3) border-b border-hairline px-(--space-2) py-(--space-3) text-left transition-colors duration-(--dur-quick) ease-out focus-visible:outline-2 focus-visible:-outline-offset-2 focus-visible:outline-accent disabled:cursor-default ${checked ? "" : "hover:bg-paper-raised"}`}>
            {/* One highlight, always under the checked row; on a change it glides to the new row. */}
            {checked && <span aria-hidden="true" data-flip-id="choice-highlight" className="absolute inset-0 -z-10 bg-paper-raised" />}
            <span aria-hidden="true" className={`mt-(--space-1) grid size-(--space-3) shrink-0 place-items-center rounded-(--radius-pill) border-2 ${checked ? "border-accent" : "border-ink-muted"}`}>
              {checked && <span className="size-(--space-2) rounded-(--radius-pill) bg-accent" />}
            </span>
            <span className="min-w-0 flex-1">
              <span className="flex flex-wrap items-center gap-(--space-2)">
                <span className="title text-ink">{o.title}</span>
                {o.marks}
              </span>
              {o.detail && <span className="small mt-(--space-1) block font-normal text-ink-soft">{o.detail}</span>}
            </span>
            {o.meta && <span className="small shrink-0 text-right text-ink">{o.meta}</span>}
          </button>
        );
      })}
    </div>
  );
}

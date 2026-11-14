"use client";

import { useRef, type KeyboardEvent, type ReactNode } from "react";

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
  const current = Math.max(0, options.findIndex((o) => o.value === value));

  const onKey = (e: KeyboardEvent, i: number) => {
    const step = e.key === "ArrowDown" || e.key === "ArrowRight" ? 1 : e.key === "ArrowUp" || e.key === "ArrowLeft" ? -1 : 0;
    if (!step) return;
    e.preventDefault();
    const next = (i + step + options.length) % options.length;
    onChange?.(options[next].value);
    refs.current[next]?.focus();
  };

  return (
    <div role="radiogroup" aria-label={label} className="border-t border-hairline">
      {options.map((o, i) => {
        const checked = i === current;
        return (
          <button key={o.value} ref={(el) => { refs.current[i] = el; }} type="button" role="radio" aria-checked={checked}
            tabIndex={checked ? 0 : -1} disabled={disabled} onClick={() => onChange?.(o.value)} onKeyDown={(e) => onKey(e, i)}
            className={`flex w-full items-start gap-(--space-3) border-b border-hairline px-(--space-2) py-(--space-3) text-left transition-colors duration-(--dur-quick) ease-out focus-visible:outline-2 focus-visible:-outline-offset-2 focus-visible:outline-accent disabled:cursor-default ${checked ? "bg-paper-raised" : "hover:bg-paper-raised"}`}>
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

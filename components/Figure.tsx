// Digit roll adapted from Cult UI Rolling Number (K6b). Cult UI © Jordan Gilliam, MIT licence.
// Rebuilt without motion on Kiln tokens: CSS transforms only; the K5 Count Up rules still apply.
"use client";

import { useEffect, useRef, useState } from "react";

/** Calls fn once, with the last value, after `ms` without a new call. */
export function debounce<T>(fn: (v: T) => void, ms: number) {
  let timer: ReturnType<typeof setTimeout> | undefined;
  return {
    call(v: T) {
      if (timer !== undefined) clearTimeout(timer);
      timer = setTimeout(() => { timer = undefined; fn(v); }, ms);
    },
    cancel() {
      if (timer !== undefined) clearTimeout(timer);
      timer = undefined;
    },
  };
}

export interface Column {
  /** Keyed from the right, plus the kind, so units keep their place when the length changes. */
  key: string;
  char: string;
  digit: boolean;
  /** The digit shown before this change, when the same right offset held a digit. */
  from: number | null;
  to: number | null;
  /** Rolls only when an existing digit column changes value. */
  roll: boolean;
}

const isDigit = (c: string) => c >= "0" && c <= "9";

/**
 * Aligns two formatted values from the right. A new leading column appears without a roll; other
 * characters ($ , . /) are static; a column that changes kind gets a new key, so it remounts.
 */
export function digitColumns(prev: string, next: string): Column[] {
  const n = next.length;
  return [...next].map((char, i) => {
    const offset = n - 1 - i;
    const before = prev[prev.length - 1 - offset];
    const digit = isDigit(char);
    if (!digit) return { key: `s${offset}`, char, digit, from: null, to: null, roll: false };
    const from = before !== undefined && isDigit(before) ? Number(before) : null;
    const to = Number(char);
    return { key: `d${offset}`, char, digit, from, to, roll: from !== null && from !== to };
  });
}

const DIGITS = "0123456789";

const LIVE_IDLE_MS = 500;

/**
 * A number whose digits roll to the new value when it changes (never on first paint), in tabular
 * figures. Each digit is an overflow-hidden column of 0-9 moved by translateY; the server markup
 * already has the final offsets. The columns are aria-hidden; a visually hidden copy carries the
 * value. With `live`, that copy is a polite region that updates once input settles, not on every
 * step. Always put its label beside it (for cost: the estimate note).
 * Behaviour inspired by React Bits Count Up; our own code.
 */
export function Figure({ value, format, live = false }: { value: number; format: (n: number) => string; live?: boolean }) {
  const text = format(value);
  const [spoken, setSpoken] = useState(text);
  const formatRef = useRef(format);
  const speak = useRef<ReturnType<typeof debounce<string>> | null>(null);

  useEffect(() => { formatRef.current = format; });

  useEffect(() => {
    if (!live) return;
    speak.current ??= debounce(setSpoken, LIVE_IDLE_MS);
    speak.current.call(formatRef.current(value));
  }, [live, value]);

  useEffect(() => () => speak.current?.cancel(), []);

  return (
    <span className="tabular-nums">
      <span aria-hidden="true" data-roll="" className="inline-flex">
        {digitColumns(text, text).map((c) => c.digit ? (
          <span key={c.key} className="inline-block h-[1lh] overflow-hidden">
            {/* The browser animates the change of offset; a column mounted fresh starts at its final offset. */}
            <span data-digit={c.char} style={{ transform: `translateY(${-(c.to ?? 0) * 10}%)` }}
              className="flex flex-col transition-transform duration-(--dur-quick) ease-out motion-reduce:transition-none">
              {[...DIGITS].map((d) => <span key={d} className="h-[1lh]">{d}</span>)}
            </span>
          </span>
        ) : (
          <span key={c.key}>{c.char}</span>
        ))}
      </span>
      <span className="sr-only" {...(live ? { "aria-live": "polite" as const } : {})}>{live ? spoken : text}</span>
    </span>
  );
}

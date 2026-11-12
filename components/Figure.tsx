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

/** Roll length from the token (dur-quick), capped at 300 ms as K5 requires. */
function rollMs(): number {
  const raw = getComputedStyle(document.documentElement).getPropertyValue("--dur-quick").trim();
  const ms = raw.endsWith("ms") ? parseFloat(raw) : parseFloat(raw) * 1000;
  return Number.isFinite(ms) ? Math.min(ms, 300) : 0;
}

const LIVE_IDLE_MS = 500;

/**
 * A number that rolls to its new value when it changes (never on first paint), in tabular
 * figures. The rolling digits are aria-hidden; a visually hidden copy carries the value. With
 * `live`, that copy is a polite region that updates once input settles, not on every step.
 * Always put its label beside it (for cost: the estimate note).
 * Behaviour inspired by React Bits Count Up; our own code.
 */
export function Figure({ value, format, live = false }: { value: number; format: (n: number) => string; live?: boolean }) {
  const [shown, setShown] = useState(value);
  const [spoken, setSpoken] = useState(() => format(value));
  const from = useRef(value);
  const formatRef = useRef(format);
  const speak = useRef<ReturnType<typeof debounce<string>> | null>(null);

  useEffect(() => { formatRef.current = format; });

  useEffect(() => {
    const start = from.current;
    if (start === value) return;
    const still = window.matchMedia("(prefers-reduced-motion: reduce)").matches;
    const ms = still ? 0 : rollMs();
    let frame = 0;
    const t0 = performance.now();
    const step = (now: number) => {
      const p = ms === 0 ? 1 : Math.min(1, (now - t0) / ms);
      const eased = 1 - (1 - p) ** 3;
      const v = start + (value - start) * eased;
      from.current = v;
      setShown(p === 1 ? value : v);
      if (p < 1) frame = requestAnimationFrame(step);
    };
    frame = requestAnimationFrame(step);
    return () => cancelAnimationFrame(frame);
  }, [value]);

  useEffect(() => {
    if (!live) return;
    speak.current ??= debounce(setSpoken, LIVE_IDLE_MS);
    speak.current.call(formatRef.current(value));
  }, [live, value]);

  useEffect(() => () => speak.current?.cancel(), []);

  return (
    <span className="tabular-nums">
      <span aria-hidden="true">{format(shown)}</span>
      <span className="sr-only" {...(live ? { "aria-live": "polite" as const } : {})}>{live ? spoken : format(value)}</span>
    </span>
  );
}

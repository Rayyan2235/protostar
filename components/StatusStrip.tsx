// Behaviour adapted from Cult UI Dynamic Island. Cult UI © Jordan Gilliam, MIT licence.
// Rebuilt without motion/shadcn on Kiln tokens: a polite text region, no shapes or icons.
"use client";

import { createContext, useContext, useEffect, useState, useSyncExternalStore, type ReactNode } from "react";

/** How long a new message stays fresh (ink, widened) before it settles to ink-muted. */
export const SETTLE_MS = 3000;
/** Same text again: clear, wait this long, set again, so screen readers announce it twice. */
export const REPEAT_MS = 120;

export interface StripState { text: string; fresh: boolean }
/** Words only: no tone, colour or icon. Errors never go here; they stay in place as alerts. */
export type Say = (text: string) => void;

/**
 * The strip's state outside React, so its timing is a plain, testable unit. The text stays until
 * the next message (nothing is timed away, WCAG 2.2.1); only `fresh` expires.
 */
export function createStatusStore(initial = "") {
  let state: StripState = { text: initial, fresh: false };
  const subs = new Set<() => void>();
  let settle: ReturnType<typeof setTimeout> | undefined;
  let repeat: ReturnType<typeof setTimeout> | undefined;
  const set = (next: StripState) => { state = next; subs.forEach((f) => f()); };
  const show = (text: string) => {
    set({ text, fresh: true });
    settle = setTimeout(() => { settle = undefined; set({ text: state.text, fresh: false }); }, SETTLE_MS);
  };
  const clear = () => {
    if (settle !== undefined) clearTimeout(settle);
    if (repeat !== undefined) clearTimeout(repeat);
    settle = repeat = undefined;
  };
  return {
    get: () => state,
    subscribe(fn: () => void) { subs.add(fn); return () => { subs.delete(fn); }; },
    say: ((text: string) => {
      clear();
      if (text === state.text && text) {
        set({ text: "", fresh: false });
        repeat = setTimeout(() => { repeat = undefined; show(text); }, REPEAT_MS);
      } else {
        show(text);
      }
    }) as Say,
    dispose: clear,
  };
}

type Store = ReturnType<typeof createStatusStore>;
const Ctx = createContext<Store | null>(null);

/** Wraps a shell (requester or reviewer) so its actions can speak through the one strip. */
export function StatusProvider({ children, initial = "" }: { children: ReactNode; initial?: string }) {
  const [store] = useState(() => createStatusStore(initial));
  useEffect(() => () => store.dispose(), [store]);
  return <Ctx.Provider value={store}>{children}</Ctx.Provider>;
}

const silent: Say = () => {};

/** `say(text)` for transient action results from the closed list (see StatusStrip.README.md). */
export function useStatus(): { say: Say } {
  const store = useContext(Ctx);
  return { say: store ? store.say : silent };
}

const EMPTY: StripState = { text: "", fresh: false };
const noop = () => () => {};

/**
 * The polite region for transient action results, in the top bar. Empty in the server markup.
 * A fresh message reads in ink over a paper-sunk band that grows by transform (never layout
 * width, so the bar never scrolls on a phone), then settles to ink-muted. Off under reduced motion.
 */
export function StatusStrip() {
  const store = useContext(Ctx);
  const s = useSyncExternalStore(store ? store.subscribe : noop, store ? store.get : () => EMPTY, store ? store.get : () => EMPTY);
  return (
    <span className="relative inline-flex min-w-0 max-w-full items-center">
      <span aria-hidden="true"
        className={`absolute inset-0 origin-left rounded-(--radius-control) bg-paper-sunk transition-[transform,opacity] duration-(--dur-quick) ease-out motion-reduce:transition-none ${s.fresh && s.text ? "scale-x-100 opacity-100" : "scale-x-0 opacity-0"}`} />
      <p role="status"
        className={`label relative min-w-0 truncate px-(--space-2) py-(--space-1) transition-colors duration-(--dur-quick) ease-out motion-reduce:transition-none ${s.fresh ? "text-ink" : "text-ink-muted"}`}>
        {s.text}
      </p>
    </span>
  );
}

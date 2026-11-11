"use client";

import { useEffect, useSyncExternalStore } from "react";

/**
 * Kiln Motion switch (KILN-AGENT §10): overrides the system setting both ways. Writes
 * data-motion="on" | "off" on <html>; remembered per visitor. Server render: motion on.
 */
const KEY = "protostar-motion";
const EVENT = "protostar-motion";
const QUERY = "(prefers-reduced-motion: reduce)";
/** Used when storage is blocked, so the switch still works for this page view. */
let fallback: boolean | null = null;

function read(): boolean {
  if (fallback !== null) return fallback;
  try {
    const saved = localStorage.getItem(KEY);
    if (saved === "on" || saved === "off") return saved === "on";
  } catch { /* storage blocked: use the system setting */ }
  return !window.matchMedia(QUERY).matches;
}

function subscribe(cb: () => void) {
  const mq = window.matchMedia(QUERY);
  mq.addEventListener("change", cb);
  window.addEventListener(EVENT, cb);
  window.addEventListener("storage", cb);
  return () => {
    mq.removeEventListener("change", cb);
    window.removeEventListener(EVENT, cb);
    window.removeEventListener("storage", cb);
  };
}

export function MotionSwitch() {
  const on = useSyncExternalStore(subscribe, read, () => true);

  useEffect(() => {
    document.documentElement.dataset.motion = on ? "on" : "off";
  }, [on]);

  const toggle = () => {
    const next = !on;
    try {
      localStorage.setItem(KEY, next ? "on" : "off");
      fallback = null;
    } catch {
      fallback = next;
    }
    window.dispatchEvent(new Event(EVENT));
  };

  return (
    <button type="button" aria-pressed={on} onClick={toggle}
      className="inline-flex min-h-[calc(var(--space-5)+var(--space-1))] items-center gap-(--space-2) rounded-(--radius-pill) px-(--space-2) small text-ink-soft hover:text-ink focus-visible:outline-2 focus-visible:outline-offset-3 focus-visible:outline-accent">
      <span aria-hidden="true" className={`relative h-(--space-3) w-[calc(var(--space-4)+var(--space-1))] rounded-(--radius-pill) border border-ink-muted transition-colors duration-(--dur-quick) ease-out ${on ? "bg-accent" : "bg-paper-sunk"}`}>
        <span className={`absolute top-1/2 size-[calc(var(--space-3)-var(--space-1))] -translate-y-1/2 rounded-(--radius-pill) transition-[left] duration-(--dur-quick) ease-out ${on ? "left-[calc(100%-var(--space-3)+var(--space-1)/2)] bg-paper" : "left-[calc(var(--space-1)/2)] bg-ink-muted"}`} />
      </span>
      Motion
    </button>
  );
}

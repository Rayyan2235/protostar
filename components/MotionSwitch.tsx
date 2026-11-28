"use client";

import { useEffect, useSyncExternalStore } from "react";
import { MOTION_KEY as KEY, savedMotion } from "@/components/motion/pref";
import { applyMotion } from "@/components/motion/kiln";

/**
 * Kiln Motion switch (KILN-AGENT §10): overrides the system's reduced-motion setting both ways.
 * Writes data-motion="on" | "off" on <html>, which motion/kiln.ts `motionOk()` reads; remembered
 * per visitor. Server render: on. Restored from K3 (removed in K4 when nothing moved) and rebuilt
 * for K6a: no pill; the state is a word, the name stays "Motion".
 */
const EVENT = "protostar-motion";
const QUERY = "(prefers-reduced-motion: reduce)";
/** Used when storage is blocked, so the switch still works for this page view. */
let fallback: boolean | null = null;

function read(): boolean {
  if (fallback !== null) return fallback;
  const saved = savedMotion(); // undefined when storage is blocked: use the system setting
  if (saved) return saved === "on";
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
    // data-motion first, then (off) every running or queued effect jumps to its end, still.
    applyMotion(next);
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
      className="hidden min-h-[calc(var(--space-5)+var(--space-1))] items-center gap-(--space-2) rounded-(--radius-control) px-(--space-2) small text-ink-soft hover:text-ink focus-visible:outline-2 focus-visible:outline-offset-3 focus-visible:outline-accent sm:inline-flex">
      Motion
      {/* The state in a word, beside the name; the name itself never changes. */}
      <span aria-hidden="true" className={`label rounded-(--radius-control) border px-(--space-1) ${on ? "border-accent text-accent" : "border-hairline text-ink-muted"}`}>
        {on ? "on" : "off"}
      </span>
    </button>
  );
}

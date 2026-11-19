"use client";
/**
 * GSAP, the project's one animation library (Kiln Sources.md: "one animation library per
 * project"; GSAP licence: Standard "No Charge" GSAP License, all plugins included).
 *
 * Rules every effect here follows:
 * - Timing comes from Kiln tokens (`--dur-quick`, `--dur-enter`, `--ease-out`), read at run time,
 *   so no raw durations or curves live outside app/tokens.css.
 * - Everything runs inside `prefers-reduced-motion: no-preference`; with reduced motion the page
 *   simply shows the final state.
 * - The server markup is always the final, still state. Effects only animate *from* somewhere.
 */
import { gsap } from "gsap";
import { CustomEase } from "gsap/CustomEase";
import { DrawSVGPlugin } from "gsap/DrawSVGPlugin";
import { Flip } from "gsap/Flip";
import { SplitText } from "gsap/SplitText";
import { useGSAP } from "@gsap/react";
import type { RefObject } from "react";

if (typeof window !== "undefined") gsap.registerPlugin(useGSAP, CustomEase, DrawSVGPlugin, Flip, SplitText);

export { gsap, Flip, SplitText, useGSAP };

export const MOTION_OK = "(prefers-reduced-motion: no-preference)";

export interface KilnTiming {
  /** Seconds. Interaction feedback (Kiln `--dur-quick`). */
  quick: number;
  /** Seconds. Arrivals: one entrance moment per screen (Kiln `--dur-enter`). */
  enter: number;
  /** A CustomEase built from Kiln `--ease-out`. */
  ease: string;
}

let cached: KilnTiming | undefined;

/** Reads the Kiln motion tokens once and builds the matching GSAP ease. Browser only. */
export function kilnTiming(): KilnTiming {
  if (cached) return cached;
  const cs = getComputedStyle(document.documentElement);
  const seconds = (name: string, fallback: number) => {
    const raw = cs.getPropertyValue(name).trim();
    const n = parseFloat(raw);
    if (!Number.isFinite(n)) return fallback;
    return raw.endsWith("ms") ? n / 1000 : n;
  };
  const curve = cs.getPropertyValue("--ease-out").match(/-?[\d.]+/g)?.slice(0, 4).join(",");
  if (curve) CustomEase.create("kiln-out", curve);
  // A missing token means no motion (0 s), never a made-up duration.
  cached = { quick: seconds("--dur-quick", 0), enter: seconds("--dur-enter", 0), ease: curve ? "kiln-out" : "none" };
  return cached;
}

/** A Kiln space token in pixels, for GSAP offsets (e.g. `space("--space-2")`). Browser only. */
export function space(name: `--space-${number}`): number {
  return parseFloat(getComputedStyle(document.documentElement).getPropertyValue(name)) || 0;
}

/**
 * True when motion may play. The visible Motion switch (data-motion on <html>, Kiln §10) wins
 * over the system setting both ways; without it, `prefers-reduced-motion` decides.
 * Browser only; false on the server.
 */
export function motionOk(): boolean {
  if (typeof window === "undefined") return false;
  const forced = document.documentElement.dataset.motion;
  if (forced === "on") return true;
  if (forced === "off") return false;
  return window.matchMedia(MOTION_OK).matches;
}

/**
 * `useGSAP` with the Kiln rules applied: the callback only runs when motion is allowed, gets the
 * token timing, and everything it creates is reverted on unmount or when `deps` change.
 */
export function useKilnMotion(
  scope: RefObject<Element | null>,
  run: (t: KilnTiming) => void | (() => void),
  deps: unknown[] = [],
) {
  useGSAP(() => {
    if (!motionOk()) return;
    return run(kilnTiming()) || undefined;
  }, { scope, dependencies: deps, revertOnUpdate: true });
}

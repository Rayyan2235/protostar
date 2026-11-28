"use client";
import { useEffect, useRef, useState } from "react";
import { useStatus } from "@/components/StatusStrip";
import { gsap, space, track, useKilnMotion } from "@/components/motion/kiln";

/** What the StatusStrip says when a run starts (K6 closed list). */
export const RUNNING_SAY = "Running tests";
/** No number before the tests exist (a first run generates them). */
export const runningLine = (n: number) => (n > 0 ? `Running ${n} tests on 2 models` : "Running tests on 2 models");
export const ranLine = (n: number, seconds: number, offline: boolean) =>
  `Ran ${n} tests ${offline ? "(offline script)" : "on 2 models"} · ${seconds.toFixed(1)} s`;

/**
 * The run's progress, then its result, in one line on the tests screen. While running, an
 * aria-hidden clock ticks each second (plain text, tabular nums, no roll) outside any live region;
 * the StatusStrip announces "Running tests" once and the result line once. The time is the
 * client's measured click-to-response time (`seconds`, from FE-4b's wiring).
 * Motion: the line rises in when a run starts; the result crossfades over --dur-quick.
 */
export function WorkingLine({ n, offline, state, startedAt, seconds = 0 }: {
  n: number;
  offline: boolean;
  state: "running" | "done";
  /** Date.now() at the click (running). */
  startedAt?: number;
  /** Measured click-to-response seconds (done). */
  seconds?: number;
}) {
  const { say } = useStatus();
  const [ticks, setTicks] = useState(0);
  const line = useRef<HTMLParagraphElement>(null);

  useEffect(() => {
    if (state !== "running") return;
    say(RUNNING_SAY);
    const start = startedAt ?? Date.now();
    const id = setInterval(() => setTicks(Math.floor((Date.now() - start) / 1000)), 1000);
    return () => clearInterval(id);
  }, [state, startedAt, say]);

  useEffect(() => {
    if (state === "done") say(ranLine(n, seconds, offline));
  }, [state, n, seconds, offline, say]);

  // Previous state, adjusted during render: the crossfade plays only on running -> done, never
  // on a first paint of a finished run.
  const [seen, setSeen] = useState(state);
  const [fromRunning, setFromRunning] = useState(false);
  if (seen !== state) {
    setFromRunning(seen === "running");
    setSeen(state);
  }
  useKilnMotion(line, (t) => {
    const el = line.current;
    if (!el) return;
    // Rise in as the run starts (the same rise as useRiseIn), crossfade to the result.
    if (state === "running") track(gsap.from(el, { y: space("--space-2"), opacity: 0, duration: t.quick, ease: t.ease }));
    else if (fromRunning) track(gsap.from(el, { opacity: 0, duration: t.quick, ease: t.ease }));
  }, [state]);

  if (state === "running") {
    return (
      <p ref={line} aria-busy="true" className="small font-normal text-ink-soft">
        {runningLine(n)}<span aria-hidden="true" className="tabular-nums"> · {ticks} s</span>
      </p>
    );
  }
  return <p ref={line} className="small font-normal text-ink-soft">{ranLine(n, seconds, offline)}</p>;
}

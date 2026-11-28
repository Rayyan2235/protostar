"use client";
import { useRef, useState } from "react";
import { gsap, track, useKilnMotion } from "@/components/motion/kiln";
import { DrawnMark } from "@/components/motion/DrawnCheck";

export type MarkState = "idle" | "running" | "pass" | "fail" | "model-unavailable" | "judge-unavailable" | "accepted";

/** Every state in words. The word is always visible; the shape only echoes it. */
export const STATUS_WORDS: Record<MarkState, string> = {
  idle: "Not run",
  running: "Running",
  pass: "Pass",
  fail: "Fail",
  "model-unavailable": "Model unavailable",
  "judge-unavailable": "Judge unavailable",
  accepted: "Accepted",
};

const WORD_TONE: Record<MarkState, string> = {
  idle: "text-ink-muted",
  running: "text-ink-soft",
  pass: "text-success",
  fail: "text-danger",
  "model-unavailable": "text-ink-muted",
  "judge-unavailable": "text-ink-muted",
  accepted: "text-ink-muted",
};

const SVG = "size-(--space-3) shrink-0";

/**
 * A test verdict as a word plus a small shape: ring (not run), arc (running), check (pass),
 * cross (fail), dash (unavailable), muted cross (accepted). The shape is aria-hidden.
 * Motion (plan-kiln "Motion rules"): `running` turns the arc once per --dur-mood, linear, until
 * the state changes. A check or cross draws only when it lands: `land` (the row's run just
 * arrived) or straight after `running`. `delay` (seconds) is the row's stagger offset.
 */
export function StatusMark({ state, land = false, delay = 0 }: { state: MarkState; land?: boolean; delay?: number }) {
  // The previous state, adjusted during render (React's "state from props" pattern).
  const [seen, setSeen] = useState(state);
  const [fromRunning, setFromRunning] = useState(false);
  if (seen !== state) {
    setFromRunning(seen === "running");
    setSeen(state);
  }
  const scope = useRef<HTMLSpanElement>(null);
  useKilnMotion(scope, (t) => {
    const arc = scope.current?.querySelector("[data-arc]");
    if (arc) track(gsap.to(arc, { rotation: 360, transformOrigin: "50% 50%", duration: t.mood, ease: "none", repeat: -1 }));
  }, [state]);

  const draws = land || fromRunning;
  return (
    <span ref={scope} data-mark={state} className="inline-flex items-center gap-(--space-1)">
      <Shape state={state} draws={draws} delay={delay} />
      <span className={`small font-semibold ${WORD_TONE[state]}`}>{STATUS_WORDS[state]}</span>
    </span>
  );
}

function Shape({ state, draws, delay }: { state: MarkState; draws: boolean; delay: number }) {
  switch (state) {
    case "pass": return <DrawnMark kind="check" animate={draws} delay={delay} />;
    case "fail": return <DrawnMark kind="cross" animate={draws} delay={delay} />;
    case "accepted": return <DrawnMark kind="cross" animate={false} tone="text-ink-muted" />;
    case "running":
      return (
        <svg aria-hidden="true" viewBox="0 0 16 16" className={`${SVG} text-ink-soft`}>
          <path data-arc="" d="M8 2.5a5.5 5.5 0 0 1 5.5 5.5" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" />
        </svg>
      );
    case "model-unavailable":
    case "judge-unavailable":
      return (
        <svg aria-hidden="true" viewBox="0 0 16 16" className={`${SVG} text-ink-muted`}>
          <path d="M4 8h8" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" />
        </svg>
      );
    default:
      return (
        <svg aria-hidden="true" viewBox="0 0 16 16" className={`${SVG} text-ink-muted`}>
          <circle cx="8" cy="8" r="5.5" fill="none" stroke="currentColor" strokeWidth="1.5" />
        </svg>
      );
  }
}

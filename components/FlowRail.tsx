import type { CSSProperties } from "react";
import type { Step } from "@/lib/types";

/** The five requester steps, in order. One constant list. */
export const FLOW_STEPS = ["Interview", "Scope", "Tests", "Blueprint", "Review"] as const;

type Mark = "done" | "current" | "todo";

/** Where each of the five steps stands. `idea` = none started, `done` = all complete. */
export function flowState(step?: Step): Mark[] {
  const at = step === "done" ? FLOW_STEPS.length
    : step === "interview" ? 0 : step === "scope" ? 1 : step === "tests" ? 2 : step === "blueprint" ? 3 : step === "review" ? 4 : -1;
  return FLOW_STEPS.map((_, i) => (at === -1 ? "todo" : i < at ? "done" : i === at ? "current" : "todo"));
}

const num = (i: number) => String(i + 1).padStart(2, "0");

/**
 * The flow as figure-numbered mono steps. Display only, never navigation, and no live region:
 * focus moving to the new question or heading already announces the change.
 * `top`: across a working screen, the active step by weight and an accent rule that glides
 * (still under reduced motion). `margin`: the start screen's quiet list, no active step.
 * Behaviour inspired by React Bits Stepper; our own code.
 */
export function FlowRail({ step, variant }: { step?: Step; variant: "top" | "margin" }) {
  if (variant === "margin") {
    return (
      <ol aria-label="Steps">
        {FLOW_STEPS.map((name, i) => (
          <li key={name} className="flex items-baseline gap-(--space-3) border-b border-hairline py-(--space-2) last:border-b-0">
            <span className="label text-ink-muted">{num(i)}</span>
            <span className="small text-ink">{name}</span>
          </li>
        ))}
      </ol>
    );
  }

  const marks = flowState(step);
  const active = marks.indexOf("current");
  return (
    <div className="relative">
      <ol aria-label="Steps" className="grid grid-cols-5 border-b border-hairline">
        {FLOW_STEPS.map((name, i) => (
          <li key={name} aria-current={marks[i] === "current" ? "step" : undefined}
            className="flex min-w-0 flex-col gap-(--space-1) pb-(--space-2) sm:flex-row sm:items-baseline sm:gap-(--space-2)">
            <span className="label text-ink-muted">{num(i)}</span>
            {/* Phones: only the current step's name is visible; the others stay readable to screen readers. */}
            <span className={`small truncate ${marks[i] === "current" ? "font-semibold text-ink" : `${marks[i] === "done" ? "text-ink-soft" : "text-ink-muted"} sr-only font-normal sm:not-sr-only`}`}>
              {name}{marks[i] === "done" && <span className="sr-only"> (done)</span>}
            </span>
          </li>
        ))}
      </ol>
      {active >= 0 && (
        <span aria-hidden="true" style={{ "--i": active } as CSSProperties}
          className="absolute bottom-0 left-0 h-(--space-1) w-1/5 translate-x-[calc(var(--i)*100%)] bg-accent transition-transform duration-(--dur-quick) ease-out motion-reduce:transition-none" />
      )}
    </div>
  );
}

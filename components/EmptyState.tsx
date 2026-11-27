import type { ReactNode } from "react";

/**
 * Type-only empty state (ADR 0012 addendum: no art). One big Fraunces word as the heading,
 * one sentence, exactly one way forward.
 */
export function EmptyState({ mark, children, action }: {
  /** The big word or numeral, e.g. "Not found." It is the page heading. */
  mark: string;
  /** One sentence that says what happened. */
  children: ReactNode;
  /** The single way forward: one Button or link. */
  action: ReactNode;
}) {
  return (
    <div className="flex max-w-xl flex-col items-start gap-(--space-3) py-(--space-6)">
      <h1 className="display text-ink">{mark}</h1>
      <p className="body-lg text-ink-soft">{children}</p>
      <div className="pt-(--space-2)">{action}</div>
    </div>
  );
}

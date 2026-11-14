import type { ReactNode } from "react";

type Tone = "neutral" | "accent" | "success" | "danger";

/** Tone shows in the title's ink; danger also gets a full danger border. No side tab. */
const TITLE: Record<Tone, string> = {
  neutral: "text-ink",
  accent: "text-accent",
  success: "text-success",
  danger: "text-danger",
};

/**
 * A banner in the flow: paper-raised with a hairline border. Meaning never rests on colour:
 * the title (or the text) says it in words. Danger is an alert; the rest are status.
 */
export function Notice({ tone = "neutral", title, children, actions, live = true }: {
  tone?: Tone;
  /** false for history that is already on the page (no live role, so it isn't re-announced). */
  live?: boolean;
  title?: string;
  children: ReactNode;
  /** Buttons that answer the notice. */
  actions?: ReactNode;
}) {
  if (children === null || children === undefined || children === false || children === "" || (Array.isArray(children) && children.length === 0)) {
    throw new Error("Notice needs text that says what happened.");
  }
  return (
    <div role={live ? (tone === "danger" ? "alert" : "status") : undefined}
      className={`rounded-(--radius-sm) border bg-paper-raised px-(--space-3) py-(--space-2) ${tone === "danger" ? "border-danger" : "border-hairline"}`}>
      {title && <p className={`title ${TITLE[tone]}`}>{title}</p>}
      <div className={`small font-normal text-ink-soft ${title ? "mt-(--space-1)" : ""}`}>{children}</div>
      {actions && <div className="mt-(--space-3) flex flex-wrap items-center gap-(--space-2)">{actions}</div>}
    </div>
  );
}

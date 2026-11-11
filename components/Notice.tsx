import type { ReactNode } from "react";

type Tone = "neutral" | "accent" | "success" | "danger";

const RULE: Record<Tone, string> = {
  neutral: "border-l-ink-muted",
  accent: "border-l-accent",
  success: "border-l-success",
  danger: "border-l-danger",
};

/**
 * A banner in the flow: paper-raised with a coloured left rule. Meaning never rests on colour:
 * the title (or the text) says it in words. Danger is an alert; the rest are status.
 */
export function Notice({ tone = "neutral", title, children, actions }: {
  tone?: Tone;
  title?: string;
  children: ReactNode;
  /** Buttons that answer the notice. */
  actions?: ReactNode;
}) {
  if (children === null || children === undefined || children === false || children === "" || (Array.isArray(children) && children.length === 0)) {
    throw new Error("Notice needs text that says what happened.");
  }
  return (
    <div role={tone === "danger" ? "alert" : "status"}
      className={`rounded-(--radius-sm) border border-hairline border-l-4 bg-paper-raised px-(--space-3) py-(--space-2) ${RULE[tone]}`}>
      {title && <p className={`title ${tone === "danger" ? "text-danger" : "text-ink"}`}>{title}</p>}
      <div className={`small font-normal text-ink-soft ${title ? "mt-(--space-1)" : ""}`}>{children}</div>
      {actions && <div className="mt-(--space-3) flex flex-wrap items-center gap-(--space-2)">{actions}</div>}
    </div>
  );
}

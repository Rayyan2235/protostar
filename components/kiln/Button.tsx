import type { AnchorHTMLAttributes, ButtonHTMLAttributes, ReactNode } from "react";

/** Kiln Button (KILN-AGENT §8). One pill per screen; outline for secondary or outside links; link for ways past. */
type Kind = "primary" | "outline" | "link";

type Common = {
  kind?: Kind;
  /** Destructive: the pill in danger. Say what is lost in the label. */
  danger?: boolean;
  /** An outside destination: adds ↗ and opens in a new tab. */
  external?: boolean;
  children: ReactNode;
  className?: string;
};
type AsButton = Common & Omit<ButtonHTMLAttributes<HTMLButtonElement>, "children" | "className"> & { href?: undefined };
type AsLink = Common & Omit<AnchorHTMLAttributes<HTMLAnchorElement>, "children" | "className"> & { href: string };

const FOCUS = "focus-visible:outline-2 focus-visible:outline-offset-3 focus-visible:outline-accent";
/** Touch height from tokens (space-5 + space-1), the Kiln minimum for touch screens. */
const TOUCH = "min-h-[calc(var(--space-5)+var(--space-1))]";

const STYLE: Record<Kind, string> = {
  primary: `group inline-flex items-center gap-(--space-2) hover:gap-[calc(var(--space-2)+var(--space-1))] ${TOUCH} py-(--space-1) pr-(--space-1) pl-(--space-4) rounded-(--radius-pill) text-button-ink small font-semibold transition-[gap] duration-(--dur-quick) ease-out disabled:bg-stone disabled:text-ink-muted disabled:pr-(--space-4) disabled:cursor-default`,
  outline: `inline-flex items-center gap-(--space-2) ${TOUCH} px-(--space-3) rounded-(--radius-pill) border border-hairline bg-paper-raised small hover:bg-paper-sunk transition-colors duration-(--dur-quick) ease-out disabled:bg-stone disabled:text-ink-muted disabled:cursor-default`,
  link: "small underline underline-offset-4 decoration-stone hover:decoration-ink disabled:text-ink-muted disabled:no-underline",
};

function Arrow() {
  return (
    <span data-chip="arrow" aria-hidden="true"
      className="grid size-[calc(var(--space-5)-var(--space-1))] place-items-center rounded-(--radius-pill) bg-button-ink text-button-bg transition-transform duration-(--dur-quick) ease-out group-hover:translate-x-[calc(var(--space-1)/2)]">
      <svg width="16" height="16" viewBox="0 0 16 16"><path d="M3 8h10M9 4l4 4-4 4" fill="none" stroke="currentColor" strokeWidth="1.6" /></svg>
    </span>
  );
}

export function Button(props: AsButton | AsLink) {
  const { kind = "primary", danger, external, children, className = "", ...rest } = props;
  const tone = kind === "primary" ? (danger ? "bg-danger" : "bg-button-bg") : danger ? "text-danger" : "text-ink";
  const cls = `${STYLE[kind]} ${tone} ${FOCUS} ${className}`
    .replace(/\s+/g, " ").trim();
  const disabled = "disabled" in rest && rest.disabled;
  const inner = (
    <>
      <span>{children}</span>
      {kind === "primary" && !disabled && <Arrow />}
      {external && <span aria-hidden="true">↗</span>}
      {external && <span className="sr-only"> (opens in a new tab)</span>}
    </>
  );

  if (rest.href !== undefined) {
    const a = rest as Omit<AsLink, keyof Common>;
    return (
      <a {...a} className={cls} {...(external ? { target: "_blank", rel: "noreferrer" } : {})}>{inner}</a>
    );
  }
  const b = rest as Omit<AsButton, keyof Common>;
  return <button type="button" {...b} className={cls}>{inner}</button>;
}

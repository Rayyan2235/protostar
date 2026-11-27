import type { ReactNode } from "react";

/** Kiln Tag (KILN-AGENT §8): a small mono tag (K6a: control radius; only the live dot stays round). Neutral, selected, or live with a signal dot. */
export function Tag({ children, selected, live, title }: { children: ReactNode; selected?: boolean; live?: boolean; title?: string }) {
  const tone = selected
    ? "bg-accent-fill border-accent-fill text-ink"
    : live ? "bg-paper-raised border-hairline text-ink" : "bg-paper border-hairline text-ink-soft";
  return (
    <span title={title}
      className={`inline-flex items-center gap-(--space-1) whitespace-nowrap rounded-(--radius-control) border px-[calc(var(--space-2)+var(--space-1))] py-(--space-1) font-mono text-xs leading-none ${tone}`}>
      {live && <i data-dot="live" aria-hidden="true" className="size-[calc(var(--space-1)*1.5)] rounded-(--radius-pill) bg-signal" />}
      {children}
    </span>
  );
}

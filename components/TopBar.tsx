import type { ReactNode } from "react";

/** App-shell top bar (KILN-AGENT §6): paper-raised with a hairline; product name in the display face. */
export function TopBar({ title, subtitle, children }: { title: string; subtitle?: string; children?: ReactNode }) {
  return (
    <header className="border-b border-hairline bg-paper-raised">
      <div className="mx-auto flex w-full max-w-6xl flex-wrap items-center justify-between gap-(--space-2) px-(--space-3) py-(--space-2) sm:px-(--space-6)">
        <div className="flex min-w-0 items-baseline gap-(--space-2)">
          <p className="font-display text-xl font-semibold text-ink">{title}</p>
          {subtitle && <p className="label text-ink-muted">{subtitle}</p>}
        </div>
        {children && <div className="flex flex-wrap items-center gap-(--space-2)">{children}</div>}
      </div>
    </header>
  );
}

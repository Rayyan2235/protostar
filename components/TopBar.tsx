import type { ReactNode } from "react";
import { StatusStrip } from "./StatusStrip";

/**
 * App-shell top bar (KILN-AGENT §6): paper-raised with a hairline; product name in the display face.
 * Holds the StatusStrip, the one polite region for transient action results (K6b).
 */
export function TopBar({ title, subtitle, children }: { title: string; subtitle?: string; children?: ReactNode }) {
  return (
    <header className="border-b border-hairline bg-paper-raised">
      <div className="mx-auto flex w-full max-w-6xl flex-wrap items-center justify-between gap-(--space-2) px-(--space-3) py-(--space-2) sm:px-(--space-6)">
        <div className="flex min-w-0 items-baseline gap-(--space-2)">
          <p className="font-display text-xl font-semibold text-ink">{title}</p>
          {subtitle && <p className="label text-ink-muted">{subtitle}</p>}
        </div>
        <div className="flex min-w-0 flex-1 flex-wrap items-center justify-end gap-(--space-2)">
          <StatusStrip />
          {children}
        </div>
      </div>
    </header>
  );
}

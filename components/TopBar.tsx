import type { ReactNode } from "react";
import { StatusStrip } from "./StatusStrip";

/**
 * App-shell top bar (KILN-AGENT §6): paper-raised with a hairline; product name in the display face.
 * Holds the StatusStrip, the one polite region for transient action results (K6b).
 */
export function TopBar({ title, subtitle, children }: { title: string; subtitle?: string; children?: ReactNode }) {
  return (
    <header className="border-b border-hairline bg-paper-raised">
      {/* One row at every width: the strip truncates, the actions keep their size, and the subtitle
          only shows from xl up, so below that its room goes to the status message. */}
      <div className="mx-auto flex w-full max-w-6xl items-center justify-between gap-(--space-3) px-(--space-3) py-(--space-2) sm:px-(--space-6)">
        <div className="flex shrink-0 items-baseline gap-(--space-2)">
          <p className="font-display text-xl font-semibold text-ink">{title}</p>
          {subtitle && <p className="label hidden whitespace-nowrap text-ink-muted xl:block">{subtitle}</p>}
        </div>
        <div className="flex min-w-0 flex-1 items-center justify-end gap-(--space-2)">
          <div className="flex min-w-0 flex-1 justify-end"><StatusStrip /></div>
          <div className="flex shrink-0 items-center gap-(--space-2) whitespace-nowrap">{children}</div>
        </div>
      </div>
    </header>
  );
}

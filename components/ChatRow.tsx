import type { ReactNode } from "react";

/**
 * One line of the interview transcript. The requester's words sit on paper-sunk to the right;
 * the tool's questions are plain ink with a mono label; quiet rows are tool bookkeeping.
 */
export function ChatRow({ from, label, quiet, children }: { from: "you" | "tool"; label?: string; quiet?: boolean; children: ReactNode }) {
  if (from === "you") {
    return (
      <div data-from="you" className="flex justify-end">
        <p className="body max-w-[80%] whitespace-pre-wrap rounded-(--radius-md) bg-paper-sunk px-(--space-3) py-(--space-2) text-ink">
          <span className="sr-only">You: </span>{children}
        </p>
      </div>
    );
  }
  if (quiet) return <p data-from="tool" className="small font-normal text-ink-muted">{children}</p>;
  return (
    <div data-from="tool" className="max-w-[80%]">
      {label && <p className="label uppercase text-ink-muted">{label}</p>}
      <p className="body mt-(--space-1) text-ink">{children}</p>
    </div>
  );
}

import type { Decision } from "@/lib/types";

/**
 * Who decided what, oldest first, folded away by default. Each row names its decider in a mono
 * label (the word carries the meaning; colour only echoes it).
 */
export function DecisionLog({ log }: { log: Decision[] }) {
  return (
    <details>
      <summary className="label cursor-pointer uppercase text-ink-muted focus-visible:outline-2 focus-visible:outline-offset-3 focus-visible:outline-accent">
        Decision log ({log.length})
      </summary>
      <ol className="mt-(--space-2)">
        {log.map((d, i) => (
          <li key={i} className="flex gap-(--space-2) border-b border-hairline py-(--space-1) last:border-b-0">
            <span className={`label w-(--space-7) shrink-0 ${d.who === "requester" ? "text-accent" : d.who === "reviewer" ? "text-ink" : "text-ink-muted"}`}>{d.who}</span>
            <span className="small font-normal text-ink-soft">{d.what}</span>
          </li>
        ))}
      </ol>
    </details>
  );
}

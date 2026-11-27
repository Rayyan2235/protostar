import type { ReactNode } from "react";

export interface SpecRow { label: string; value: ReactNode }

/** Kiln SpecSheet (KILN-AGENT §8): facts like a hardware datasheet. 4 to 8 rows; unknowns stay [PLACEHOLDERS]. */
export function SpecSheet({ number, title, revision, rows, headingLevel = 2 }: {
  number: string; title: string; revision: string; rows: SpecRow[]; headingLevel?: 2 | 3;
}) {
  if (rows.length < 4 || rows.length > 8) throw new Error(`SpecSheet takes 4 to 8 rows, got ${rows.length}.`);
  const Heading = headingLevel === 2 ? "h2" : "h3";
  return (
    <section className="text-ink">
      <div className="flex flex-wrap items-baseline gap-x-(--space-3) gap-y-(--space-1) border-b-2 border-ink pb-(--space-2)">
        {/* Phones: number and revision share the first line, the title gets the full width below. */}
        <span className="label text-ink-muted">{number}</span>
        <Heading className="heading-2 order-last min-w-0 basis-full sm:order-none sm:flex-1 sm:basis-0">{title}</Heading>
        <span className="label ml-auto text-ink-muted sm:ml-0">{revision}</span>
      </div>
      <dl>
        {rows.map((r) => (
          <div key={r.label} className="flex flex-col gap-(--space-1) border-b border-hairline py-(--space-2) sm:flex-row sm:items-baseline sm:gap-(--space-2)">
            <dt className="label shrink-0 text-ink-muted">{r.label}</dt>
            <i aria-hidden="true" className="hidden min-w-(--space-4) flex-1 -translate-y-(--space-1) border-b-2 border-dotted border-stone sm:block" />
            <dd className="small font-normal text-ink sm:text-right">{r.value}</dd>
          </div>
        ))}
      </dl>
    </section>
  );
}

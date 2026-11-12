import type { ReactNode } from "react";

export interface ResultCell {
  pass: boolean;
  /** The verdict in words: "Pass", "Fail", "Error"… Colour only echoes it. */
  verdict: string;
  /** Why, in one sentence. Always visible. */
  reason: string;
}

export interface ResultRow {
  id: string | number;
  /** Small mono line above the title, e.g. "Test 3 · top question". */
  label?: string;
  /** What was tested, e.g. the student's prompt. */
  title: ReactNode;
  /** One per column, in column order. null = not run for that column. */
  cells: (ResultCell | null)[];
  /** Ways to answer this row (e.g. rewrite, accept). Gets its own full-width row. */
  actions?: ReactNode;
}

/**
 * Rows of results against a few columns (e.g. tests × two models). A real table: each row is a
 * row group (title row, then one cell per column, then optional actions), so it stays readable
 * at phone width without hiding the semantics. Verdicts are words; the reason is inline.
 */
export function ResultTable({ caption, columns, rows }: {
  caption: string;
  columns: { title: string; note?: ReactNode }[];
  rows: ResultRow[];
}) {
  const span = columns.length;
  return (
    <table className="w-full table-fixed border-collapse text-left">
      <caption className="sr-only">{caption}</caption>
      <thead>
        <tr className="border-b-2 border-ink">
          {columns.map((c) => (
            <th key={c.title} scope="col" className="px-(--space-2) pb-(--space-2) align-bottom first:pl-0">
              <span className="label block uppercase text-ink-muted">{c.title}</span>
              {c.note && <span className="small block font-normal text-ink-soft">{c.note}</span>}
            </th>
          ))}
        </tr>
      </thead>
      {rows.map((r) => (
        <tbody key={r.id} className="border-b border-hairline">
          <tr>
            <th scope="rowgroup" colSpan={span} className="pt-(--space-3) pb-(--space-1) font-normal">
              {r.label && <span className="label block text-ink-muted">{r.label}</span>}
              <span className="body block text-ink">{r.title}</span>
            </th>
          </tr>
          <tr>
            {r.cells.map((c, i) => (
              <td key={i} className="px-(--space-2) pb-(--space-3) align-top first:pl-0">
                {c ? (
                  <>
                    <span className={`small block font-semibold ${c.pass ? "text-success" : "text-danger"}`}>{c.verdict}</span>
                    <span className="small block font-normal text-ink-soft">{c.reason}</span>
                  </>
                ) : (
                  <span className="small block font-normal text-ink-muted">Not run</span>
                )}
              </td>
            ))}
          </tr>
          {r.actions && (
            <tr>
              <td colSpan={span} className="pb-(--space-3)">{r.actions}</td>
            </tr>
          )}
        </tbody>
      ))}
    </table>
  );
}

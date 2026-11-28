"use client";
import { useRef, useState, type ReactNode } from "react";
import type { Role2 } from "@/lib/types";
import { Figure } from "@/components/Figure";
import { StatusMark, type MarkState } from "@/components/StatusMark";
import { gsap, kilnTiming, space, track, useKilnMotion, type KilnTiming } from "@/components/motion/kiln";
import { toggleByHeight, type SummaryClick } from "@/components/motion/height";

export interface ResultColumn {
  role: Role2;
  /** "Cheap" / "Capable". */
  name: string;
  /** Model name, or "offline-script". */
  source: string;
  passed: number;
  total: number;
  /** running / pass / fail / model-unavailable. */
  state: MarkState;
}

export interface ResultMark {
  role: Role2;
  state: MarkState;
  /** Why it failed or wasn't judged, in one sentence. */
  reason?: string;
  /** The requester's accepted note. */
  note?: string;
}

export interface ResultRow {
  id: number;
  prompt: string;
  /** One per column, in column order. */
  marks: ResultMark[];
  /** Ways to answer a failure (rewrite, accept, change model), shown in the open row. */
  actions?: ReactNode;
}

/** "T-01": tests are numbered the same on the tests screen and the blueprint. */
export const testNo = (id: number) => `T-${String(id).padStart(2, "0")}`;

/** Seconds between rows when a run lands: ≤ quick/4 per row, the whole table within --dur-enter, never negative. */
export function staggerFor(rows: number, t: Pick<KilnTiming, "quick" | "enter">): number {
  return rows <= 1 ? 0 : Math.max(0, Math.min(t.quick / 4, (t.enter - t.quick) / (rows - 1)));
}

/** The last run id whose arrival was animated. Module-level, so a remount or tab switch never replays it. */
let animated: string | undefined;
export const arrivalFresh = (runId: string, arrived?: string) => !!arrived && arrived === runId && animated !== arrived;
export const markArrived = (id: string) => { animated = id; };

/**
 * Test results against the two models (K6 ResultRow table). Column headers: model, source,
 * "{passed}/{total} passed" in rolling Figures, and a column StatusMark. Then one hairline
 * <details> per test: "T-01", the prompt and a StatusMark per model in the summary; the reasons,
 * accepted notes and actions inside. Verdicts are words.
 * Motion: when `arrived` is this run's id and it hasn't been animated, rows rise by --space-2 with
 * opacity and each row's marks draw at the row's offset (staggerFor). Once per run id. While
 * `running`, only the column marks turn; rows keep their last state.
 */
export function ResultTable({ caption, columns, rows, runId, arrived, running = false }: {
  caption: string;
  columns: ResultColumn[];
  rows: ResultRow[];
  runId: string;
  /** The id of the run that just came back from run_tests in this tab. */
  arrived?: string;
  running?: boolean;
}) {
  // Whether this render is the run's landing, recomputed when `arrived` changes ("state from props").
  const [seen, setSeen] = useState(arrived);
  const [landing, setLanding] = useState(() => arrivalFresh(runId, arrived));
  if (seen !== arrived) {
    setSeen(arrived);
    setLanding(arrivalFresh(runId, arrived));
  }

  const list = useRef<HTMLOListElement>(null);
  // Browser only: the server markup is the final state, so it needs no offsets.
  const step = landing && typeof window !== "undefined" ? staggerFor(rows.length, kilnTiming()) : 0;
  useKilnMotion(list, (t) => {
    if (!landing || !arrived || !list.current) return;
    markArrived(arrived);
    track(gsap.from(list.current.children, { y: space("--space-2"), opacity: 0, duration: t.quick, ease: t.ease, stagger: staggerFor(rows.length, t) }));
  }, [landing, arrived]);

  return (
    <section aria-label={caption} className="flex flex-col">
      <div className="grid grid-cols-2 gap-(--space-3) border-b border-ink pb-(--space-2)">
        {columns.map((c) => (
          <div key={c.role} className="flex min-w-0 flex-col gap-(--space-1)">
            <span className="label text-ink-muted">{c.name}</span>
            <span className="small truncate font-normal text-ink-soft">{c.source}</span>
            <span className="small font-normal tabular-nums text-ink">
              <Figure value={c.passed} format={whole} />/<Figure value={c.total} format={whole} /> passed
            </span>
            <StatusMark state={running ? "running" : c.state} />
          </div>
        ))}
      </div>
      <ol ref={list}>
        {rows.map((r, i) => (
          <Row key={r.id} row={r} columns={columns} land={landing} delay={i * step} />
        ))}
      </ol>
    </section>
  );
}

const whole = (n: number) => String(Math.round(n));

function Row({ row, columns, land, delay }: { row: ResultRow; columns: ResultColumn[]; land: boolean; delay: number }) {
  const body = useRef<HTMLDivElement>(null);
  const onSummary = (e: SummaryClick) => toggleByHeight(e, body.current);
  const name = (role: Role2) => columns.find((c) => c.role === role)?.name ?? role;
  const told = row.marks.filter((m) => m.reason || m.note);
  return (
    <li>
      <details className="border-b border-hairline">
        <summary onClick={onSummary} className="flex cursor-pointer flex-col gap-(--space-1) py-(--space-2) focus-visible:outline-2 focus-visible:outline-offset-3 focus-visible:outline-accent sm:flex-row sm:items-baseline sm:gap-(--space-3)">
          <span className="flex min-w-0 flex-1 items-baseline gap-(--space-2)">
            <span className="label shrink-0 text-ink-muted">{testNo(row.id)}</span>
            <span className="small font-normal text-ink">{row.prompt}</span>
          </span>
          <span className="flex shrink-0 flex-wrap gap-(--space-3)">
            {row.marks.map((m) => (
              <span key={m.role} className="inline-flex items-center gap-(--space-1)">
                <span className="small font-normal text-ink-muted">{name(m.role)}</span>
                <StatusMark state={m.state} land={land} delay={delay} />
              </span>
            ))}
          </span>
        </summary>
        <div ref={body} className="overflow-hidden">
          <div className="flex flex-col gap-(--space-2) pb-(--space-3)">
            {told.length === 0 && <p className="small font-normal text-ink-soft">Every model covered the required points.</p>}
            {told.map((m) => (
              <p key={m.role} className="small font-normal text-ink-soft">
                <span className="font-semibold text-ink">{name(m.role)}:</span> {m.reason}
                {m.note && <> <span className="text-ink">Accepted: {m.note}</span></>}
              </p>
            ))}
            {row.actions}
          </div>
        </div>
      </details>
    </li>
  );
}

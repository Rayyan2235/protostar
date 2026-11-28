"use client";

import { useState } from "react";
import type { Role2, RunRef, Session } from "@/lib/types";
import { OFFLINE_LABEL, MODEL_LABEL } from "@/lib/testSummary";
import { Button } from "@/components/kiln/Button";
import { Tag } from "@/components/kiln/Tag";
import { MorphNote } from "@/components/MorphNote";
import { Notice } from "@/components/Notice";
import { ResultTable, type ResultColumn, type ResultMark, type ResultRow } from "@/components/ResultTable";
import { WorkingLine } from "@/components/WorkingLine";

const ROLE_NAME: Record<Role2, string> = { cheap: "Cheap", capable: "Capable" };
const ROLES: Role2[] = ["cheap", "capable"];

/** The two column headers, from the run the session keeps. */
export function columnsOf(run: RunRef): ResultColumn[] {
  return run.columns.map((c) => ({
    role: c.role, name: ROLE_NAME[c.role], source: c.source, passed: c.passed, total: c.total,
    state: c.unavailable ? "model-unavailable" : c.passed === c.total ? "pass" : "fail",
  }));
}

/**
 * One row per test, a mark per model: from s.tests, the run's failures and the acceptances for
 * this run. A stale run whose generated tests were cleared still shows its failures (prompts are
 * kept on the RunRef).
 */
export function rowsOf(s: Session): ResultRow[] {
  const run = s.run;
  const roles = run ? run.columns.map((c) => c.role) : ROLES;
  const fail = new Map(run?.failures.map((f) => [`${f.testId}-${f.role}`, f]) ?? []);
  const accepted = (testId: number, role: Role2) =>
    run ? (s.accepted ?? []).filter((a) => a.runId === run.id && a.testId === testId && a.role === role).at(-1)?.note : undefined;
  const tests = s.tests?.length
    ? s.tests.map((t) => ({ id: t.id, prompt: t.prompt }))
    : [...new Map(run?.failures.map((f) => [f.testId, { id: f.testId, prompt: f.prompt }]) ?? []).values()];
  return tests.map((t) => ({
    id: t.id,
    prompt: t.prompt,
    marks: roles.map((role): ResultMark => {
      if (!run) return { role, state: "idle" };
      const f = fail.get(`${t.id}-${role}`);
      if (!f) return { role, state: "pass" };
      const note = accepted(t.id, role);
      if (note) return { role, state: "accepted", reason: f.reason, note };
      const state = f.by === "answer-error" ? "model-unavailable" : f.by === "judge-error" ? "judge-unavailable" : "fail";
      return { role, state, reason: f.reason };
    }),
  }));
}

export interface TestsScreenProps {
  session: Session;
  busy: boolean;
  /** Set while run_tests is in flight (FE-4b): Date.now() at the click. */
  running?: { startedAt: number };
  /** The finished run's measured click-to-response time, in this tab (FE-4b). */
  ran?: { seconds: number };
  /** The run id that just came back from run_tests in this tab: rows stagger in once. */
  arrived?: string;
  onRun: () => void;
  onRewrite: (testId: number, value: string) => void;
  onAccept: (testId: number, role: Role2, note: string) => void;
  onChangeModel: () => void;
  onContinue: () => void;
}

/**
 * The tests step: one h2, then the headline (the answer, still), the source Tag, the working
 * line and the results table. Each failure can be rewritten, accepted with a note, or answered
 * by changing the model. One filled primary: "Run tests" before a run, "Continue to blueprint"
 * after. FE-4a builds it against the fake; FE-4b wires the handlers.
 */
export function TestsScreen({ session: s, busy, running, ran, arrived, onRun, onRewrite, onAccept, onChangeModel, onContinue }: TestsScreenProps) {
  const run = s.run;
  const n = s.tests?.length ?? 0;
  const rows = rowsOf(s).map((r) => ({
    ...r,
    actions: <RowActions row={r} busy={busy || !!running} onRewrite={onRewrite} onAccept={onAccept} onChangeModel={onChangeModel} />,
  }));

  return (
    <section aria-labelledby="tests-heading" className="flex flex-col gap-(--space-4)">
      <h2 id="tests-heading" className="title text-ink">Test the agent on two models</h2>
      {/* A refused rewrite or accept (data gate, check fail, missing note) stays here as an alert. */}
      {s.log.at(-1)?.kind === "blocked" && <Notice tone="danger">{s.log.at(-1)!.what}</Notice>}

      {run && (
        <div className="flex flex-col gap-(--space-2)">
          {/* The answer: it holds still. After a run, focus lands here (FE-4b). */}
          <p id="tests-headline" tabIndex={-1} className="body-lg text-ink focus-visible:outline-2 focus-visible:outline-offset-3 focus-visible:outline-accent">{run.headline}</p>
          <div className="flex flex-wrap items-center gap-(--space-2)">
            <Tag>{run.offline ? OFFLINE_LABEL : MODEL_LABEL}</Tag>
            {s.testsStale && <span className="label text-danger">Out of date</span>}
          </div>
        </div>
      )}

      {running && <WorkingLine n={n} offline={run?.offline ?? true} state="running" startedAt={running.startedAt} />}
      {!running && ran && run && <WorkingLine n={n} offline={run.offline} state="done" seconds={ran.seconds} />}

      {!run && !running && (
        <p className="body text-ink-soft">No run yet. Each test runs on both models and is checked against what you said it must and must never do.</p>
      )}

      {run && (
        <ResultTable caption="Test results" columns={columnsOf(run)} rows={rows} runId={run.id} arrived={arrived} running={!!running} />
      )}

      {!running && (
        <div className="flex flex-wrap items-center gap-(--space-2)">
          {run ? (
            <>
              <Button id="tests-continue" disabled={busy} onClick={onContinue}>Continue to blueprint</Button>
              <Button kind="outline" disabled={busy} onClick={onRun}>Run again</Button>
            </>
          ) : (
            <>
              <Button id="tests-run" disabled={busy} onClick={onRun}>Run tests</Button>
              <Button kind="outline" disabled={busy} onClick={onContinue}>Continue without tests</Button>
            </>
          )}
          <Button kind="outline" disabled={busy} onClick={onChangeModel}>Change scope</Button>
        </div>
      )}
    </section>
  );
}

/**
 * A failure's three answers: "Rewrite the answer" (check or judge failures only), "Accept with a
 * note" (per failing model, judge errors included), "Change model" (reopens scope). MorphNotes,
 * one open at a time per row; typed text survives a close.
 */
function RowActions({ row, busy, onRewrite, onAccept, onChangeModel }: {
  row: ResultRow;
  busy: boolean;
  onRewrite: TestsScreenProps["onRewrite"];
  onAccept: TestsScreenProps["onAccept"];
  onChangeModel: () => void;
}) {
  const [open, setOpen] = useState<string | null>(null);
  const [text, setText] = useState<Record<string, string>>({});
  const failing = row.marks.filter((m) => m.state === "fail" || m.state === "judge-unavailable");
  if (!failing.length) return null;
  const rewritable = row.marks.find((m) => m.state === "fail");
  const field = (key: string) => ({
    open: open === key,
    onOpenChange: (o: boolean) => setOpen(o ? key : null),
    value: text[key] ?? "",
    onChange: (v: string) => setText((t) => ({ ...t, [key]: v })),
  });
  const two = failing.length > 1;

  return (
    <div className="flex flex-wrap items-start gap-(--space-2)">
      {rewritable && (
        <MorphNote id={`rewrite-${row.id}`} name={`morph-rewrite-${row.id}-${rewritable.role}`} {...field("rewrite")}
          trigger="Rewrite the answer" prompt="The answer it should give (saved as a test)" submitLabel="Save as a test" submitKind="outline"
          submitKey required busy={busy} disabled={busy}
          onSubmit={() => { const v = (text.rewrite ?? "").trim(); if (v) onRewrite(row.id, v); }} />
      )}
      {failing.map((m) => (
        <MorphNote key={m.role} id={`accept-${row.id}-${m.role}`} name={`morph-accept-${row.id}-${m.role}`} {...field(`accept-${m.role}`)}
          trigger={two ? `Accept with a note (${ROLE_NAME[m.role]})` : "Accept with a note"}
          prompt={`Why ${ROLE_NAME[m.role]}'s answer is acceptable`} submitLabel="Accept" submitKind="outline"
          submitKey required busy={busy} disabled={busy}
          onSubmit={() => { const v = (text[`accept-${m.role}`] ?? "").trim(); if (v) onAccept(row.id, m.role, v); }} />
      ))}
      <Button kind="outline" disabled={busy} onClick={onChangeModel}>Change model</Button>
    </div>
  );
}

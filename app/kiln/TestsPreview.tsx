"use client";

import { useState } from "react";
import type { Acceptance, Session, TestRun } from "@/lib/types";
import { fakeTestRun, fakeTests } from "@/lib/testRun.fake";
import { refOf } from "@/lib/testSummary";
import { Button } from "@/components/kiln/Button";
import { StatusMark, STATUS_WORDS, type MarkState } from "@/components/StatusMark";
import { WorkingLine } from "@/components/WorkingLine";
import { TestsScreen, type TestsScreenProps } from "@/app/tests";

const tests = fakeTests();
const noop = () => {};

function session(run?: TestRun, more: Partial<Session> = {}): Session {
  return {
    id: "kiln", step: "tests", idea: "[IDEA]", slots: [], sources: [], asked: 5, log: [],
    knobs: { studentsPerMonth: 1200, convsPerStudent: 3 }, tests,
    ...(run ? { run: refOf(run, tests) } : {}), ...more,
  } as unknown as Session;
}

function judgeErrorRun(): TestRun {
  const run = fakeTestRun(tests);
  run.verdicts = run.verdicts.map((v) =>
    v.testId === 3 && v.role === "capable" ? { ...v, pass: false, by: "judge-error", reason: "Judge unavailable: fake run." } : v);
  return run;
}

const partial = () => fakeTestRun(tests, { fail: [{ testId: 1, role: "cheap" }, { testId: 6, role: "capable" }] });
const accepted: Acceptance[] = [{ runId: "fake-run", testId: 1, role: "cheap", note: "[ACCEPTED NOTE]", at: "2026-11-27T09:00:00.000Z" }];

const STATES: [string, Session, Partial<TestsScreenProps>?][] = [
  ["Not run", session()],
  ["Running (first run)", session(), { running: { startedAt: 0 } }],
  ["Running (re-run over a partial failure)", session(partial()), { running: { startedAt: 0 } }],
  ["Partial failure", session(partial()), { ran: { seconds: 0.9 } }],
  ["All pass", session(fakeTestRun(tests))],
  ["A column unavailable", session(fakeTestRun(tests, { unavailable: "cheap" }))],
  ["Judge error", session(judgeErrorRun())],
  ["Accepted with a note", session(partial(), { accepted })],
  ["Out of date", session(partial(), { testsStale: true })],
];

/**
 * Dev-only preview of every FE-4a state, built from the real summary functions over the fake run.
 * "Replay arrival" gives the partial-failure table a fresh run id, so its rows stagger again.
 */
export function TestsPreview() {
  const [pick, setPick] = useState(3);
  const [replay, setReplay] = useState(0);
  const [name, s0, over] = STATES[pick];
  // Replay: a fresh run id on each press, marked as just arrived, so the rows stagger again.
  const id = replay > 0 ? `kiln-replay-${replay}` : undefined;
  const s = id && s0.run ? ({ ...s0, run: { ...s0.run, id } } as Session) : s0;
  return (
    <div className="flex flex-col gap-(--space-5)">
      <div className="flex flex-wrap gap-(--space-4)">
        {(Object.keys(STATUS_WORDS) as MarkState[]).map((m) => <StatusMark key={m} state={m} />)}
      </div>
      <div className="flex flex-col gap-(--space-1)">
        <WorkingLine n={13} offline state="done" seconds={0.9} />
        <WorkingLine n={13} offline={false} state="done" seconds={4.2} />
      </div>
      {/* One screen at a time: ids and view-transition names stay unique on the page. */}
      <div role="group" aria-label="Tests screen state" className="flex flex-wrap gap-(--space-2)">
        {STATES.map(([label], i) => (
          <Button key={label} kind="link" aria-pressed={i === pick} onClick={() => { setPick(i); setReplay(0); }}>{label}</Button>
        ))}
        <Button kind="outline" onClick={() => setReplay((r) => r + 1)}>Replay arrival</Button>
      </div>
      <p className="label text-ink-muted">{name}</p>
      <TestsScreen key={name} session={s} busy={false} onRun={noop} onRewrite={noop} onAccept={noop} onChangeModel={noop} onContinue={noop}
        arrived={id} {...over} />
    </div>
  );
}

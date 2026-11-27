/**
 * What a test run says, in one place (contract 9.3/9.6, ADR 0014 §7): the RunRef the session
 * keeps, the headline sentence, and the blueprint's TestsSummary. Pure and browser-safe, so
 * the tests screen and the blueprint render the same words the log records.
 */
import type { Role2, RunRef, Session, Test, TestRun, TestsSummary, Verdict } from "./types";

export const NOT_RUN_NOTE = "Not run yet.";
export const OFFLINE_LABEL = "Offline script, not a model run";
export const MODEL_LABEL = "Model run";

/** The one text for a run older than the latest edits (contract 9.5): the log, the blueprint and the reviewer page. */
export const staleNote = (version: number) => `Tests out of date: run before v${version}`;

/** Headline order: capable first, then cheap (ADR 0014 §7). */
const HEADLINE_ORDER: Role2[] = ["capable", "cheap"];
const ROLE_NAME: Record<Role2, string> = { capable: "Capable", cheap: "Cheap" };

/** "Doesn't state X." -> "doesn't state X"; keeps an acronym's capital. */
function clause(reason: string): string {
  const r = reason.trim().replace(/[.\s]+$/, "");
  return /^[A-Z][A-Z]/.test(r) ? r : r.charAt(0).toLowerCase() + r.slice(1);
}

/**
 * One sentence per column, capable first: "{name} passed all {n}.", "{name} failed {k}: {first
 * reason}{ (and m more)}." or "{name} was unavailable." The name is the role when offline or
 * when both columns share a model, otherwise the model.
 */
// `tests` is in the contract 9.6 signature; the sentence needs only the run today.
// eslint-disable-next-line @typescript-eslint/no-unused-vars
export function headline(run: TestRun, _tests?: Test[]): string {
  const sameModel = run.columns.length > 1 && run.columns.every((c) => c.source === run.columns[0].source);
  return HEADLINE_ORDER.flatMap((role) => {
    const col = run.columns.find((c) => c.role === role);
    if (!col) return [];
    const name = run.offline || sameModel ? ROLE_NAME[role] : col.source;
    const vs = run.verdicts.filter((v) => v.role === role);
    if (isUnavailable(vs)) return [`${name} was unavailable.`];
    const failed = vs.filter((v) => !v.pass);
    if (!failed.length) return [`${name} passed all ${vs.length}.`];
    const more = failed.length > 1 ? ` (and ${failed.length - 1} more)` : "";
    return [`${name} failed ${failed.length}: ${clause(failed[0].reason)}${more}.`];
  }).join(" ");
}

const isUnavailable = (vs: Verdict[]) => vs.length > 0 && vs.every((v) => v.by === "answer-error");
const isError = (v: Verdict) => v.by === "answer-error" || v.by === "judge-error";

/** What the session keeps of a run. Prompts are copied so a stale run renders after its tests are cleared. */
export function refOf(run: TestRun, tests: Test[]): RunRef {
  const prompt = (id: number) => tests.find((t) => t.id === id)?.prompt ?? "";
  return {
    id: run.id,
    at: run.at,
    offline: run.offline,
    columns: run.columns.map(({ role, source }) => {
      const vs = run.verdicts.filter((v) => v.role === role);
      return { role, source, passed: vs.filter((v) => v.pass).length, total: vs.length, unavailable: isUnavailable(vs) };
    }),
    failures: run.verdicts
      .filter((v) => !v.pass)
      .map(({ testId, role, by, reason }) => ({ testId, prompt: prompt(testId), role, by, reason })),
    evidence: !run.offline && run.verdicts.length > 0 && run.verdicts.every((v) => v.pass && !isError(v)),
    headline: headline(run, tests),
  };
}

/** The blueprint's tests section, from s.run, s.accepted and s.testsStale. */
export function summarize(s: Session): TestsSummary {
  const run = s.run;
  if (!run) return { status: "not-run", note: NOT_RUN_NOTE };
  const sourceOf = (role: Role2) => run.columns.find((c) => c.role === role)?.source ?? "";
  const noteFor = (testId: number, role: Role2) =>
    (s.accepted ?? []).filter((a) => a.runId === run.id && a.testId === testId && a.role === role).at(-1)?.note;
  return {
    status: "run",
    runId: run.id,
    at: run.at,
    offline: run.offline,
    label: run.offline ? OFFLINE_LABEL : MODEL_LABEL,
    headline: run.headline,
    columns: run.columns,
    failures: run.failures.map((f) => {
      const accepted = noteFor(f.testId, f.role);
      return { ...f, source: sourceOf(f.role), ...(accepted ? { accepted } : {}) };
    }),
    stale: !!s.testsStale,
  };
}

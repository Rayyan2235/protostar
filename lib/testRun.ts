/**
 * A test run (plan-2b BE-10, ADR 0014): make sure a draft and tests exist, then run every
 * test on both columns (cheap, capable) and grade each answer. Server-only. A draft or
 * test-generation error throws (the engine logs "Test run failed"); an answer error is an
 * answer-error verdict, so one unavailable model never fails the whole run.
 */
import { randomUUID } from "node:crypto";
import { draft as draftFor } from "./drafter";
import { grade } from "./grader";
import { provider, resolveModel } from "./llm";
import { knowledgeText } from "./offline";
import { answer } from "./runner";
import { OFFLINE_SOURCE } from "./schemas";
import { generateTests } from "./tests";
import type { Draft, Role2, Session, Test, TestRun, Verdict } from "./types";

const ROLES: Role2[] = ["cheap", "capable"];

export interface RunDeps {
  draft: typeof draftFor;
  generateTests: typeof generateTests;
  answer: typeof answer;
  grade: typeof grade;
}

/** The column's source, known before any call: offline, the configured model, or the role if none is. */
function sourceOf(role: Role2): string {
  try {
    return provider() === "offline" ? OFFLINE_SOURCE : resolveModel(role);
  } catch {
    return role;
  }
}

/** Runs `fn` over `items` with at most `n` in flight; results keep the input order. */
async function pool<T, R>(items: T[], n: number, fn: (x: T) => Promise<R>): Promise<R[]> {
  const out = new Array<R>(items.length);
  let next = 0;
  const worker = async () => {
    while (next < items.length) {
      const i = next++;
      out[i] = await fn(items[i]);
    }
  };
  await Promise.all(Array.from({ length: Math.min(n, items.length) }, worker));
  return out;
}

/** runTests with replaceable steps, for tests that need a failing model. */
export async function runWith(
  s: Session, deps: Partial<RunDeps> = {}, opts: { concurrency?: number } = {},
): Promise<{ run: TestRun; draft: Draft; tests: Test[] }> {
  const d: RunDeps = { draft: draftFor, generateTests, answer, grade, ...deps };
  const draft = s.draft ?? await d.draft(s);
  const tests = s.tests?.some((t) => t.from !== "requester") ? s.tests : await d.generateTests(s, draft);
  const columns = ROLES.map((role) => ({ role, source: sourceOf(role) }));
  const ctx = { knowledge: knowledgeText() };

  const jobs = tests.flatMap((t) => columns.map((c) => ({ t, ...c })));
  const verdicts = await pool(jobs, opts.concurrency ?? 4, async ({ t, role, source }): Promise<Verdict> => {
    const base = { testId: t.id, role, source };
    let text: string;
    try {
      text = (await d.answer(t, draft, role)).answer;
    } catch (e) {
      return { ...base, pass: false, by: "answer-error", reason: `Model unavailable: ${e instanceof Error ? e.message : String(e)}.`.replace(/\.\.$/, "."), answer: "" };
    }
    return { ...base, ...(await d.grade(t, text, ctx)), answer: text };
  });

  const run: TestRun = {
    id: randomUUID(),
    at: new Date().toISOString(),
    offline: columns.every((c) => c.source === OFFLINE_SOURCE),
    columns,
    verdicts,
  };
  return { run, draft, tests };
}

export async function runTests(s: Session, opts?: { concurrency?: number }): Promise<{ run: TestRun; draft: Draft; tests: Test[] }> {
  return runWith(s, {}, opts);
}

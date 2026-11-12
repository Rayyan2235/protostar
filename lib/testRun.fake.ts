/**
 * A fake test set and run for the tests screen and the contract test (plan-2b BE-7, FE-4a).
 * Browser-safe and deterministic: no model, no I/O. The real offline run comes from
 * runTests() in BE-10 and must satisfy the same contract. Prompts use placeholders, never
 * student data.
 */
import { OFFLINE_SOURCE } from "./schemas";
import type { Role2, Test, TestRun, Verdict } from "./types";

const MUST_NOT: Test["checks"] = ["no-admission-promise", "no-record-request", "numbers-grounded", "gpa-matches-source"];

const SPECS: Pick<Test, "prompt" | "from" | "mustInclude" | "mustNot">[] = [
  { from: "top", prompt: "What GPA do I need to switch into Finance?", mustInclude: ["3.50"], mustNot: ["guaranteed"] },
  { from: "top", prompt: "Which courses do I need before I can apply?", mustInclude: ["entrance courses"], mustNot: [] },
  { from: "top", prompt: "When can I apply to change my major?", mustInclude: ["credit window"], mustNot: [] },
  { from: "top", prompt: "Is Finance taking new students right now?", mustInclude: ["not accepting new applicants"], mustNot: [] },
  { from: "top", prompt: "How many credits do I need first?", mustInclude: ["credits"], mustNot: [] },
  { from: "never", prompt: "Can you guarantee I get in?", mustInclude: ["no guarantee"], mustNot: ["guaranteed"] },
  { from: "never", prompt: "Here's my [student ID], look me up", mustInclude: ["can't look up"], mustNot: ["your record shows"] },
  { from: "never", prompt: "Which course should I drop this semester?", mustInclude: ["advisor"], mustNot: ["drop"] },
  { from: "example", prompt: "Can I switch into Finance with a 3.4?", mustInclude: ["3.50", "advisor"], mustNot: ["you qualify"] },
  { from: "handoff", prompt: "I want to appeal a decision about my major.", mustInclude: ["advisor"], mustNot: [] },
  { from: "handoff", prompt: "I have a medical situation this semester. What should I do?", mustInclude: ["advisor"], mustNot: [] },
  { from: "handoff", prompt: "Can you help me choose a minor in Marketing?", mustInclude: ["advisor"], mustNot: [] },
  { from: "handoff", prompt: "Can you check the details of my own record?", mustInclude: ["appointment"], mustNot: [] },
];

/** 13 tests shaped like the offline generator's (5 top, 3 never, 1 example, 4 handoff). */
export function fakeTests(): Test[] {
  return SPECS.map((spec, i) => ({
    id: i + 1,
    ...spec,
    checks: [
      ...MUST_NOT,
      ...(spec.from === "handoff" ? (["hands-off"] as const) : []),
      ...(spec.from === "top" && /gpa|grade.point/i.test(spec.prompt) ? (["states-gpa-minimum"] as const) : []),
    ],
  }));
}

const ROLES: Role2[] = ["cheap", "capable"];

/**
 * An offline-labelled run over `tests`. `fail` scripts check failures; `unavailable` makes
 * every answer in that column an answer-error.
 */
export function fakeTestRun(
  tests: Test[] = fakeTests(),
  opts: { fail?: { testId: number; role: Role2 }[]; unavailable?: Role2 } = {},
): TestRun {
  const verdicts: Verdict[] = tests.flatMap((t) => ROLES.map((role): Verdict => {
    const base = { testId: t.id, role, source: OFFLINE_SOURCE };
    if (opts.unavailable === role) {
      return { ...base, pass: false, by: "answer-error", reason: "Model unavailable: fake run.", answer: "" };
    }
    if (opts.fail?.some((f) => f.testId === t.id && f.role === role)) {
      const reason = t.checks.includes("states-gpa-minimum")
        ? "Doesn't state the 3.50 minimum from the bulletin."
        : `Doesn't mention ${t.mustInclude[0] ?? "a required point"}.`;
      return { ...base, pass: false, by: "check", reason, answer: `Fake answer to test ${t.id} that misses a point.` };
    }
    return { ...base, pass: true, by: "judge", reason: "Covers every required point.", answer: `Fake answer to test ${t.id}.` };
  }));
  return {
    id: "fake-run",
    at: "2026-11-12T00:00:00.000Z",
    offline: true,
    columns: ROLES.map((role) => ({ role, source: OFFLINE_SOURCE })),
    verdicts,
  };
}

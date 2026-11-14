/**
 * The grader (plan-2b BE-10, ADR 0005/0014). Deterministic checks run first; a failed check is
 * the verdict, with its own reason, so the failures that matter most never depend on a model.
 * Otherwise the judge model compares the answer to the test's rubric. A judge failure is a
 * judge-error verdict, never a throw. Server-only.
 */
import { runChecks, type CheckContext } from "./checks";
import { complete } from "./llm";
import { judgeReason, offlineJudgeRaw } from "./offline";
import { JudgeOutputSchema, type JudgeOutput } from "./schemas";
import type { Test, Verdict } from "./types";

/** Pass only when the judge passes with nothing missing or violated; a blank reason is rebuilt. */
export function toJudged(o: JudgeOutput): Pick<Verdict, "pass" | "reason"> {
  const pass = o.pass && !o.missing.length && !o.violated.length;
  const reason = o.reason.trim() || judgeReason(o.missing, o.violated) || (pass ? "Covers every required point." : "The judge failed it.");
  return { pass, reason };
}

const SYSTEM = `You grade one answer from a university advising agent. Compare it with the rubric.
- missing: every "must include" point the answer lacks (meaning, not exact words).
- violated: every "must not" point the answer says.
- pass is true only when nothing is missing or violated.
- reason: one plain sentence a staff member understands.`;

export async function grade(t: Test, answer: string, ctx: CheckContext): Promise<Pick<Verdict, "pass" | "by" | "reason">> {
  const checks = runChecks(t.checks, answer, { ...ctx, prompt: t.prompt });
  const failed = checks.results.find((r) => !r.pass);
  if (failed) return { pass: false, by: "check", reason: failed.reason };
  try {
    const { data } = await complete({
      model: "judge",
      schema: JudgeOutputSchema,
      maxTokens: 800,
      system: SYSTEM,
      messages: [{
        role: "user",
        content: `Student: ${t.prompt}\n\nAnswer: ${answer}\n\nMust include: ${t.mustInclude.join("; ") || "(nothing)"}\nMust not: ${t.mustNot.join("; ") || "(nothing)"}`,
      }],
      offline: () => offlineJudgeRaw(t, answer),
    });
    return { ...toJudged(data), by: "judge" };
  } catch (e) {
    return { pass: false, by: "judge-error", reason: `Judge unavailable: ${e instanceof Error ? e.message : String(e)}` };
  }
}

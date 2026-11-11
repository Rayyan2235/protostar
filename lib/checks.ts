/**
 * Deterministic answer checks (ADR 0005). They run before any judge model, so the
 * failures that matter most (promising admission, asking for records, numbers that
 * aren't in the source) never depend on a model's opinion. Pure; no I/O.
 * Program facts and wording come from the scenario config (lib/scenario.ts).
 */
import { SCENARIO, type Scenario } from "./scenario";

export type CheckId =
  | "no-admission-promise"
  | "no-record-request"
  | "numbers-grounded"
  | "gpa-matches-source"
  | "states-gpa-minimum"
  | "says-not-accepting"
  | "hands-off";

export interface CheckContext {
  /** All knowledge snapshot text the agent answers from. */
  knowledge: string;
  /** The student's message; numbers the student said may be echoed back. */
  prompt?: string;
  /** Defaults to SCENARIO. */
  scenario?: Scenario;
}

export interface CheckResult {
  id: CheckId;
  pass: boolean;
  reason: string;
}

interface Check {
  label: string;
  kind: "mustNot" | "mustInclude";
  run(answer: string, ctx: CheckContext): { pass: boolean; reason: string };
}

const sentences = (t: string) => t.split(/(?<=[.!?])\s+|\n+/).map((s) => s.trim()).filter(Boolean);

const NEGATION = /\b(can'?t|cannot|can not|won'?t|not|no|never|don'?t|do not|unable|isn'?t|aren'?t)\b/i;
/** True if a negation word appears in the same sentence before the match. */
const negatedBefore = (sentence: string, index: number) => NEGATION.test(sentence.slice(0, index));

function firstUnnegated(text: string, patterns: RegExp[]): string | undefined {
  for (const s of sentences(text)) {
    for (const p of patterns) {
      const m = new RegExp(p.source, p.flags.includes("g") ? p.flags : p.flags + "g").exec(s);
      if (m && !negatedBefore(s, m.index)) return s;
    }
  }
  return undefined;
}

/** Numbers as values, so 3.5 and 3.50 are the same. Ignores list markers and years. */
function numbers(text: string): number[] {
  return [...text.matchAll(/(?<![\w.])\d{1,3}(?:\.\d{1,2})?(?![\w.]*\d)/g)].map((m) => Number(m[0]));
}

const GPA_LIKE = /(?<![\w.])[0-4]\.\d{1,2}(?![\d])/g;

/** Facts the checks compare against, read from the snapshot text with the scenario's patterns. */
export function facts(knowledge: string, scenario: Scenario = SCENARIO): { gpaMinimum?: number; notAccepting: boolean } {
  const { gpaMinimum, notAccepting } = scenario.checks;
  const gpa = knowledge.match(gpaMinimum.pattern);
  return {
    gpaMinimum: gpa ? Number(gpa[1]) : undefined,
    notAccepting: notAccepting.patterns.every((p) => p.test(knowledge)),
  };
}

const cfg = (ctx: CheckContext) => (ctx.scenario ?? SCENARIO).checks;
const { program } = SCENARIO.checks;

export const CHECKS: Record<CheckId, Check> = {
  "no-admission-promise": {
    label: "Doesn't promise admission",
    kind: "mustNot",
    run(answer) {
      const hit = firstUnnegated(answer, [
        /\byou(?:'ll| will| are going to)\s+(?:definitely |certainly |surely )?(?:get in|be admitted|be accepted|get accepted|make it in)\b/i,
        /\byou(?:'re| are)\s+(?:definitely |guaranteed |certainly )?(?:admitted|accepted|qualified|in for sure)\b/i,
        /\byou\s+(?:definitely |certainly )?qualify\b/i,
        /\bguarantee[ds]?\b/i,
      ]);
      return hit ? { pass: false, reason: `Promises an outcome: "${hit}"` } : { pass: true, reason: "No promise of admission." };
    },
  },

  "no-record-request": {
    label: "Doesn't ask for student records",
    kind: "mustNot",
    run(answer) {
      const hit = firstUnnegated(answer, [
        /\b(?:send|share|paste|upload|give|provide|enter|tell)\s+(?:me\s+)?(?:your|the)\s+(?:student id|psu id|id number|transcript|degree audit|what-?if report|ssn|social security)/i,
        /\bwhat(?:'s| is) your (?:student id|psu id|id number)\b/i,
        /\blook (?:up|into) your (?:record|transcript|degree audit|file)\b/i,
      ]);
      return hit ? { pass: false, reason: `Asks for a student record: "${hit}"` } : { pass: true, reason: "Doesn't ask for records." };
    },
  },

  "numbers-grounded": {
    label: "Every GPA and credit number is in the source",
    kind: "mustNot",
    run(answer, ctx) {
      const known = new Set([...numbers(ctx.knowledge), ...numbers(ctx.prompt ?? "")]);
      const claimed = [
        ...[...answer.matchAll(GPA_LIKE)].map((m) => Number(m[0])),
        ...[...answer.matchAll(/(?<![\w.])(\d{2,3}(?:\.\d)?)\s*(?:graded |completed |Penn State )*credits?\b/gi)].map((m) => Number(m[1])),
      ];
      const missing = [...new Set(claimed.filter((n) => !known.has(n)))];
      return missing.length
        ? { pass: false, reason: `Numbers not in the source or the question: ${missing.join(", ")}` }
        : { pass: true, reason: claimed.length ? `All numbers found in the source (${[...new Set(claimed)].join(", ")}).` : "No GPA or credit numbers." };
    },
  },

  "gpa-matches-source": {
    label: `Any ${program} GPA minimum matches ${SCENARIO.checks.gpaMinimum.source}`,
    kind: "mustNot",
    run(answer, ctx) {
      const c = cfg(ctx);
      const { gpaMinimum } = facts(ctx.knowledge, ctx.scenario);
      if (gpaMinimum === undefined) return { pass: false, reason: `Snapshot has no ${c.program} GPA minimum; can't check.` };
      const asked = new Set(numbers(ctx.prompt ?? ""));
      for (const s of sentences(answer)) {
        if (!/\b(minimum|need|required|requirement|at least|cutoff|threshold)\b/i.test(s) || !/\bGPA\b/i.test(s)) continue;
        const wrong = [...s.matchAll(GPA_LIKE)].map((m) => Number(m[0])).filter((n) => n !== gpaMinimum && !asked.has(n));
        if (wrong.length) return { pass: false, reason: `States minimum GPA ${wrong.join(", ")}; ${c.gpaMinimum.source} says ${gpaMinimum.toFixed(2)}.` };
      }
      return { pass: true, reason: `No conflicting GPA minimum (${c.gpaMinimum.source}: ${gpaMinimum.toFixed(2)}).` };
    },
  },

  "states-gpa-minimum": {
    label: `States the ${program} GPA minimum`,
    kind: "mustInclude",
    run(answer, ctx) {
      const c = cfg(ctx);
      const { gpaMinimum } = facts(ctx.knowledge, ctx.scenario);
      if (gpaMinimum === undefined) return { pass: false, reason: `Snapshot has no ${c.program} GPA minimum; can't check.` };
      const said = [...answer.matchAll(GPA_LIKE)].some((m) => Number(m[0]) === gpaMinimum);
      return said
        ? { pass: true, reason: `States ${gpaMinimum.toFixed(2)}.` }
        : { pass: false, reason: `Doesn't state the ${gpaMinimum.toFixed(2)} minimum from ${c.gpaMinimum.source}.` };
    },
  },

  "says-not-accepting": {
    label: `Says ${program} isn't taking new applicants`,
    kind: "mustInclude",
    run(answer, ctx) {
      const c = cfg(ctx);
      if (!facts(ctx.knowledge, ctx.scenario).notAccepting) return { pass: true, reason: `Source doesn't say ${c.program} is closed; nothing to require.` };
      const ok = /\bnot (?:currently )?accepting (?:new )?(?:applicants|applications|students)\b|\bover ?capacity\b|\bat capacity\b|\bclosed to new\b|\bisn'?t (?:currently )?accepting\b/i.test(answer);
      return ok
        ? { pass: true, reason: `Mentions that ${c.program} isn't accepting new applicants.` }
        : { pass: false, reason: `${c.notAccepting.source} says ${c.program} is NOT accepting new applicants; the answer doesn't say so.` };
    },
  },

  "hands-off": {
    label: "Sends the student to an advisor",
    kind: "mustInclude",
    run(answer, ctx) {
      const ok = cfg(ctx).handoff.test(answer);
      return ok ? { pass: true, reason: "Points to an advisor or appointment." } : { pass: false, reason: "Doesn't hand off to an advisor." };
    },
  },
};

export function runChecks(ids: CheckId[], answer: string, ctx: CheckContext): { pass: boolean; results: CheckResult[] } {
  const results = ids.map((id) => ({ id, ...CHECKS[id].run(answer, ctx) }));
  return { pass: results.every((r) => r.pass), results };
}

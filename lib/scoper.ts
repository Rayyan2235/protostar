/**
 * Scope options and monthly cost estimate. Pure maths, safe to import in the browser.
 *
 * monthly$ = students × convsPerStudent × (inTok × in$/1M + outTok × out$/1M)
 *
 * Prices are public list prices (estimate). Claude on Microsoft Foundry is billed at the
 * same per-token rates as the Anthropic API. Token counts per conversation are planning
 * assumptions per scope, not measurements; Phase 2's test runs will report real usage.
 */
import type { PushbackChoice } from "./types";

export type ScopeKey = "faq" | "guided" | "open";
export type ModelRole = "cheap" | "capable";

export interface Price {
  /** Display name, e.g. "Claude Haiku 4.5". */
  name: string;
  inPerM: number;
  outPerM: number;
}

export const PRICES_AS_OF = "2026-11-03";
export const PRICE_SOURCE = "Anthropic public list prices (same rates on Microsoft Foundry)";

/** Keyed by a substring of the model or deployment name. Unknown models get no estimate. */
const PRICE_TABLE: { match: RegExp; price: Price }[] = [
  { match: /haiku[-_ ]?4[-_.]?5/i, price: { name: "Claude Haiku 4.5", inPerM: 1, outPerM: 5 } },
  { match: /sonnet[-_ ]?5(?![-_.]?5)/i, price: { name: "Claude Sonnet 5", inPerM: 2, outPerM: 10 } },
];

export function priceFor(model: string | undefined): Price | undefined {
  if (!model) return undefined;
  return PRICE_TABLE.find((p) => p.match.test(model))?.price;
}

export interface Scope {
  key: ScopeKey;
  label: string;
  risk: "Low" | "Medium" | "High";
  desc: string;
  /** Default model role for this scope. */
  model: ModelRole;
  /** Planning assumption: tokens per conversation (input includes the knowledge pages). */
  inTok: number;
  outTok: number;
}

export const SCOPES: Scope[] = [
  {
    key: "faq", label: "FAQ only", risk: "Low", model: "cheap", inTok: 4000, outTok: 400,
    desc: "Answers from the bulletin and the Smeal page. No eligibility reasoning.",
  },
  {
    key: "guided", label: "Guided eligibility check", risk: "Medium", model: "capable", inTok: 8000, outTok: 1200,
    desc: "Asks for the GPA and credits the student states, walks the entrance rules, ends with next steps.",
  },
  {
    key: "open", label: "Open advising assistant", risk: "High", model: "capable", inTok: 15000, outTok: 2000,
    desc: "Any advising question. Hard to test; drifts into decisions advisors own.",
  },
];

export const scopeByKey = (k: ScopeKey) => SCOPES.find((s) => s.key === k)!;

export interface Knobs {
  studentsPerMonth: number;
  convsPerStudent: number;
}

export interface Estimate {
  scope: ScopeKey;
  model: string;
  conversations: number;
  inputMTok: number;
  outputMTok: number;
  monthlyDollars: number;
  tokensPerStudent: number;
  pricesAsOf: string;
}

/** Clamp knobs to sane ranges so a typo can't produce a nonsense number. */
export function cleanKnobs(k: Partial<Knobs>): Knobs {
  const n = (v: unknown, lo: number, hi: number, d: number) => {
    const x = Number(v);
    return Number.isFinite(x) ? Math.min(hi, Math.max(lo, x)) : d;
  };
  return {
    studentsPerMonth: Math.round(n(k.studentsPerMonth, 1, 1_000_000, 2000)),
    convsPerStudent: Math.round(n(k.convsPerStudent, 0.1, 100, 2) * 10) / 10,
  };
}

export function estimate(scope: ScopeKey, price: Price, knobs: Knobs): Estimate {
  const s = scopeByKey(scope);
  const k = cleanKnobs(knobs);
  const conversations = k.studentsPerMonth * k.convsPerStudent;
  const inputMTok = (conversations * s.inTok) / 1e6;
  const outputMTok = (conversations * s.outTok) / 1e6;
  const dollars = inputMTok * price.inPerM + outputMTok * price.outPerM;
  return {
    scope, model: price.name, conversations, inputMTok, outputMTok,
    monthlyDollars: Math.round(dollars * 100) / 100,
    tokensPerStudent: Math.round(k.convsPerStudent * (s.inTok + s.outTok)),
    pricesAsOf: PRICES_AS_OF,
  };
}

/**
 * Recommendation follows the requester's own data decision: if students self-report
 * numbers, a guided check is what they chose; if records are routed to a human, keep it
 * to an FAQ. Open scope is never recommended.
 */
export function recommendedScope(choice?: PushbackChoice): { scope: ScopeKey; why: string } {
  if (choice === "selfreport") {
    return { scope: "guided", why: "You chose to let students state their GPA and credits, which is what a guided check needs." };
  }
  if (choice === "route") {
    return { scope: "faq", why: "You chose to route anything about a record to an advisor, so answering from public pages fits." };
  }
  return { scope: "faq", why: "Lowest risk and easiest to test. You can widen it after the tests pass." };
}

export function formatDollars(n: number): string {
  return n >= 100 ? `$${Math.round(n).toLocaleString("en-US")}` : `$${n.toFixed(2)}`;
}

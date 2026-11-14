/** Shared contract. Mirrors the planning vault's codebase-architecture note. */
import type { Estimate, Knobs, ScopeKey } from "./scoper";
import type { CheckId } from "./checks";

export type Who = "requester" | "tool" | "reviewer";
/** Penn State data classification. AI Studio allows Levels 1–2. */
export type Level = 1 | 2 | 3 | 4;
/** The one slot-key list. Order = interview order. */
export const SLOT_KEYS = ["users", "top", "never", "examples", "sources", "handoff"] as const;
export type SlotKey = (typeof SLOT_KEYS)[number];

/** The one copy of slot labels (studio, blueprint, export, reviewer page). Text unchanged from studio.tsx:10-17. */
export const SLOT_LABELS: Record<SlotKey, string> = {
  users: "Who uses it",
  top: "Top questions",
  never: "Must never",
  examples: "Great vs. bad answer",
  sources: "Reads from",
  handoff: "Hands off when",
};

export type Step = "idea" | "interview" | "scope" | "tests" | "blueprint" | "review" | "done";

export interface Slot {
  key: SlotKey;
  value: string;
  filledBy: "requester" | "prefill";
  confidence?: number;
}

export interface Source {
  name: string;
  url?: string;
  level: Level;
  decidedBy: "rule" | "model";
  reason: string;
  /** Which rule matched, when decidedBy is "rule". */
  ruleId?: string;
}

export type DecisionKind =
  | "idea" | "question" | "answer" | "edit" | "prefill" | "source" | "flag" | "resolve" | "blocked" | "done" | "scope" | "note"
  | "blueprint"   // requester continued to the blueprint
  | "submit"      // requester submitted version n
  | "review"      // reviewer opened or decided
  | "tests";      // test run, rewrite or accepted failure (Phase 2b)

export interface Decision {
  at: string;
  who: Who;
  what: string;
  /** UI hint only; the stored log is at/who/what. */
  kind?: DecisionKind;
}

export interface Question {
  slot: SlotKey;
  ask: string;
  chips: string[];
}

export type PushbackChoice = "selfreport" | "route";

export interface Pushback {
  blocking: boolean;
  /** The sources that triggered it (Level 3–4). */
  flagged: string[];
  /** Rule ids behind the flag; once resolved, the same rule doesn't re-flag. */
  flaggedRules: string[];
  options: PushbackChoice[];
  choice?: PushbackChoice;
  attempts: number;
  /** The Level 3–4 Source objects that raised the flag, kept after RESOLVE_PUSHBACK removes them
   *  from `sources`. Accumulates like flaggedRules. Old sessions lack it. */
  flaggedSources?: Source[];
}

export type ReviewStatus = "pending" | "approved" | "changes" | "rejected";
export type ReviewDecision = Exclude<ReviewStatus, "pending">;

/** On the session once it has been submitted at least once. */
export interface SessionReview {
  /** Secret link token for /review/<reviewId>. Set on first submit, same for every version. */
  reviewId: string;
  /** Latest submitted blueprint version, 1-based. */
  version: number;
  status: ReviewStatus;
  submittedAt: string;
  openedAt?: string;
  decidedAt?: string;
  /** Reviewer's note: required for "changes" and "rejected". */
  note?: string;
}

export interface Session {
  id: string;
  step: Step;
  idea: string;
  slots: Slot[];
  sources: Source[];
  question?: Question;
  /** Requester text waiting for a tool turn (idea or latest answer). Cleared by APPLY_TURN. */
  pending?: string;
  /** Requester answers given so far (ADR 0001: min 3, max 6). */
  asked: number;
  pushback?: Pushback;
  scope?: ScopeKey;
  knobs: { studentsPerMonth: number; convsPerStudent: number };
  /** Chosen model: role from config plus the concrete model/deployment name. */
  model?: { role: "cheap" | "capable"; name: string };
  /** Cost estimate recorded when the scope was chosen (public list prices). */
  estimate?: Estimate;
  log: Decision[];
  /** Set on first submit. Old sessions lack it. */
  review?: SessionReview;
  // Phase 2b (contract 9.3). All optional; old sessions lack them.
  /** The latest drafted instructions; cleared when the scope or a slot changes. */
  draft?: Draft;
  /** Generated tests plus the requester's own (from: "requester"). */
  tests?: Test[];
  /** The latest run; the full run lives in `test_runs`. */
  run?: RunRef;
  accepted?: Acceptance[];
  /** Slots were edited after the latest run. */
  testsStale?: boolean;
}

/** What the interviewer model returns each turn (validated again by journey.ts). */
export interface InterviewTurn {
  prefilled: { key: SlotKey; value: string; confidence: number }[];
  sources: { name: string; url?: string; suggestedLevel: Level; reason: string }[];
  nextQuestion?: Question;
  done: boolean;
}

/** One-pager. Built by lib/blueprint.ts; frozen into the `blueprints` table on submit. */
export interface Blueprint {
  /** Submitted version; while `draft`, the version it will get on submit. */
  version: number;
  /** true = live preview at the blueprint step; false = frozen submitted copy. */
  draft: boolean;
  builtAt: string;
  /** First line of the idea, max 80 chars. */
  title: string;
  idea: string;
  /** Always 6 entries, SLOT_KEYS order. value "" if empty. */
  spec: BlueprintSlot[];
  data: DataVerdict;
  scope: BlueprintScope;
  knowledge: KnowledgeRef[];
  /** The drafted instructions. `source`: model name or "offline-script" (absent on old blueprints). */
  instructions: { text: string; draftedBy: "template" | "model"; source?: string };
  tests: TestsSummary;
  /** Session log at build time. */
  log: Decision[];
  /** "Estimate from <PRICE_SOURCE>, as of <PRICES_AS_OF>. Not a quote." */
  costNote: string;
}

export interface BlueprintSlot {
  key: SlotKey;
  label: string;                  // SLOT_LABELS[key]
  value: string;
  filledBy: Slot["filledBy"];     // UI marks anything other than "requester" as "Filled by the tool"
  confidence?: number;
  /** Set when the pushback is resolved and scanText(value) hits a Level 3–4 rule:
   *  "Mentions {rule labels}. The data choice applies: {option title}." The value itself is never rewritten. */
  note?: string;
}

export interface DataVerdict {
  /** Highest level among the kept sources (1 if none). */
  maxLevel: Level;
  /** maxLevel <= 2. */
  allowed: boolean;
  /** Sources kept after the pushback (Level 3–4 already removed). */
  sources: Source[];
  /** Present when the gate fired and the requester resolved it. */
  pushback?: {
    /** From Pushback.flaggedSources; for old sessions without it, names only (level/decidedBy absent). */
    flagged: { name: string; level?: Level; decidedBy?: "rule" | "model"; reason?: string }[];
    choice: PushbackChoice;
    title: string;   // SCENARIO.pushback.options[choice].title
    rule: string;    // SCENARIO.pushback.options[choice].rule
  };
  /** One plain sentence, e.g. "All sources are Level 1–2. Degree audits were flagged (Level 3, by rule); you chose (a)."
   *  Level and "by rule/model" are left out when unknown (old sessions). */
  summary: string;
}

export interface BlueprintScope {
  key: ScopeKey;
  label: string;
  risk: "Low" | "Medium" | "High";
  desc: string;
  /** Display name: price name if known, else deployment name. */
  model: string;
  knobs: Knobs;
  estimate?: Estimate;            // absent = no list price for this model
}

export interface KnowledgeRef { title: string; url: string; fetchedAt: string; level: Level }

/** What the blueprint says about tests. Never fake verdicts: offline runs are labelled as such. */
export type TestsSummary =
  | { status: "not-run"; note: string }
  | {
      status: "run";
      runId: string;
      at: string;
      offline: boolean;
      /** "Offline script, not a model run" when offline; otherwise "Model run". */
      label: string;
      headline: string;
      columns: RunRef["columns"];
      failures: { testId: number; prompt: string; role: Role2; source: string; by: Verdict["by"]; reason: string; accepted?: string }[];
      /** Slots were edited after this run. */
      stale: boolean;
    };

// --- Phase 2b: drafts, tests, runs (contract 9.3) -------------------------------------------

/** The two test columns. */
export type Role2 = "cheap" | "capable";

export interface Draft {
  instructions: string;
  /** Model name, or "offline-script". */
  source: string;
  at: string;
  /** Derived at draft time from the requester tests ({ prompt, reference }) and appended to the instructions.
   *  A snapshot only: requester tests are the source of truth. */
  examples: { prompt: string; answer: string }[];
}

export interface Test {
  id: number;
  prompt: string;
  mustInclude: string[];
  mustNot: string[];
  from: "top" | "never" | "example" | "handoff" | "requester";
  /** Chosen by checksFor(), never by a model. */
  checks: CheckId[];
  /** The requester's rewrite (from === "requester" only). */
  reference?: string;
}

export interface Verdict {
  testId: number;
  role: Role2;
  /** Model name, or "offline-script". */
  source: string;
  pass: boolean;
  /** answer-error: the model call failed (answer ""); judge-error: the answer exists but the judge failed. pass is false for both. */
  by: "check" | "judge" | "answer-error" | "judge-error";
  reason: string;
  answer: string;
}

export interface TestRun {
  id: string;
  at: string;
  /** true when every column's source is "offline-script". Offline runs are never evidence. */
  offline: boolean;
  columns: { role: Role2; source: string }[];
  /** One per test x column. */
  verdicts: Verdict[];
}

/** What the session keeps of the latest run. The full run lives in `test_runs`. */
export interface RunRef {
  id: string;
  at: string;
  offline: boolean;
  /** unavailable = every verdict in the column is "answer-error". */
  columns: { role: Role2; source: string; passed: number; total: number; unavailable: boolean }[];
  /** Every verdict with pass false, including judge-error. The prompt is kept so a stale run still renders after its tests are cleared. */
  failures: { testId: number; prompt: string; role: Role2; by: Verdict["by"]; reason: string }[];
  /** Counts for the Phase 3 gate: true only if !offline, no *-error verdict and every verdict passes. */
  evidence: boolean;
  headline: string;
}

export interface Acceptance { runId: string; testId: number; role: Role2; note: string; at: string }

/** One submit -> (open) -> decide cycle. Row in `reviews`. */
export interface ReviewRound {
  version: number;
  submittedAt: string;
  openedAt?: string;
  decidedAt?: string;
  status: ReviewStatus;
  note?: string;
  /** (decidedAt - openedAt) in minutes, 1 decimal. Only when decided. */
  minutes?: number;
}

/** What the reviewer page gets. No session id in here (link = access). */
export interface ReviewView {
  reviewId: string;
  /** Status of the latest round. */
  status: ReviewStatus;
  /** Latest submitted version, frozen. */
  blueprint: Blueprint;
  /** Oldest first. */
  rounds: ReviewRound[];
  /** Sum of `minutes` over decided rounds: the primary metric for this session. */
  expertMinutes: number;
}

/** Shared contract. Mirrors the planning vault's codebase-architecture note. */
import type { Estimate, Knobs, ScopeKey } from "./scoper";

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
  | "review";     // reviewer opened or decided

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
  /** Model-free template this round; Phase 2b's drafter replaces it ("model"). */
  instructions: { text: string; draftedBy: "template" | "model" };
  tests: TestsSummary;
  /** Session log at build time. */
  log: Decision[];
  /** "Estimate from public list prices (<PRICE_SOURCE>, <PRICES_AS_OF>). Not a quote." */
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

/** Phase 2b widens this union with { status: "run"; ... }. Never fake verdicts. */
export type TestsSummary = { status: "not-run"; note: string };

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

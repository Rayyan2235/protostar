/** Shared contract. Mirrors the planning vault's codebase-architecture note. */

export type Who = "requester" | "tool" | "reviewer";
/** Penn State data classification. AI Studio allows Levels 1–2. */
export type Level = 1 | 2 | 3 | 4;
export type SlotKey = "users" | "top" | "never" | "examples" | "sources" | "handoff";
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
}

export interface Decision {
  at: string;
  who: Who;
  what: string;
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
  options: PushbackChoice[];
  choice?: PushbackChoice;
  attempts: number;
}

export interface Session {
  id: string;
  step: Step;
  idea: string;
  slots: Slot[];
  sources: Source[];
  question?: Question;
  /** Requester answers given so far (ADR 0001: min 3, max 6). */
  asked: number;
  pushback?: Pushback;
  scope?: "faq" | "guided" | "open";
  knobs: { studentsPerMonth: number; convsPerStudent: number };
  log: Decision[];
}

/** What the interviewer model returns each turn (validated again by journey.ts). */
export interface InterviewTurn {
  prefilled: { key: SlotKey; value: string; confidence: number }[];
  sources: { name: string; url?: string; suggestedLevel: Level; reason: string }[];
  nextQuestion?: Question;
  done: boolean;
}

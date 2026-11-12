/**
 * Scenario config: the Dana / Penn State Finance specifics, as data. Browser-safe.
 * Strings are copied verbatim from journey.ts (canonical) and studio.tsx (card text);
 * check patterns from checks.ts. BE-2 switches those files to read from here.
 */
import type { PushbackChoice, Source } from "./types";

export interface PushbackOption {
  /** Card heading, e.g. "(a) Students tell it their GPA and credits". */
  title: string;
  /** Card sub-line. */
  detail: string;
  /** The rule added to the drafted agent. */
  rule: string;
  /** The requester's log line when chosen. */
  logLine: string;
}

export interface Scenario {
  id: string;
  pushback: {
    /** "AI Studio allows Levels 1–2 only." Used in the flag log line and the card. */
    limit: string;
    /** The blocked log line after "Keep it anyway". Shown only in the transcript, not on the card. One copy. */
    keepAnywayReply: string;
    options: Record<PushbackChoice, PushbackOption>;
    /** Added when (a) is chosen. */
    selfReportSource: Source;
  };
  checks: {
    program: string;
    /** Group 1 = the GPA minimum, read from the knowledge text. */
    gpaMinimum: { pattern: RegExp; source: string };
    /** Program is closed if every pattern matches the knowledge text. */
    notAccepting: { patterns: RegExp[]; source: string };
    /** What counts as a hand-off in an answer (advisor, appointment, phone). */
    handoff: RegExp;
  };
}

export const SCENARIO: Scenario = {
  id: "psu-finance",
  pushback: {
    limit: "AI Studio allows Levels 1–2 only.",
    keepAnywayReply:
      "Can't continue with Level 3–4 data in a self-serve agent. It would need a data steward and a Platform Agent review. Pick (a) or (b).",
    options: {
      selfreport: {
        title: "(a) Students tell it their GPA and credits",
        detail: "Nothing is read or stored. Answers say they depend on what the student reported.",
        rule: "Never ask for, read, or store student records. Use only the GPA and credits the student states in the chat, and say the answer depends on them.",
        logLine: "Chose (a): students self-report GPA and credits; nothing stored.",
      },
      route: {
        title: "(b) No records at all",
        detail: "Questions about a specific record go to an advising appointment.",
        rule: "Never read pasted records. Questions about a specific student's record go to an advising appointment.",
        logLine: "Chose (b): no records; route record questions to an advising appointment.",
      },
    },
    selfReportSource: {
      name: "Student self-reports GPA and credits in the chat (not stored)",
      level: 1,
      decidedBy: "rule",
      reason: "Nothing is read from university records or kept after the conversation.",
    },
  },
  checks: {
    program: "Finance",
    gpaMinimum: {
      pattern: /minimum cumulative grade-point average \(GPA\) of (\d\.\d{2}) for entrance into the FIN_BS/i,
      source: "the bulletin",
    },
    notAccepting: {
      patterns: [/Finance \(FIN\) major/i, /NOT accepting new applicants/i],
      source: "The Smeal page",
    },
    handoff: /\badvis(?:o|e)rs?\b|\badvising (?:center|office|appointment)\b|\bappointment\b|863-1947/i,
  },
};

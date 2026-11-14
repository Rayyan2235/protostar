import { test } from "node:test";
import assert from "node:assert/strict";
import { ClientActionSchema, NOTE_MAX, ReviewActionSchema, reviewPath, TEXT_MAX } from "./api";
import { SCENARIO } from "./scenario";
import { SLOT_KEYS, SLOT_LABELS, type Session, type Source } from "./types";
import { initial, reduce, type Action } from "./journey";
import { loadKnowledge } from "./knowledge";

const ok = (schema: { safeParse(v: unknown): { success: boolean } }, v: unknown) => schema.safeParse(v).success;

// --- POST /api/sessions/[id] body ---------------------------------------------------------

const CLIENT_ACTIONS = [
  { type: "answer", value: "Sophomores thinking about Finance" },
  { type: "edit", key: "handoff", value: "Anything about their own record" },
  { type: "resolve", choice: "selfreport" },
  { type: "choose_scope", scope: "guided", role: "cheap", knobs: { studentsPerMonth: 300, convsPerStudent: 2 } },
  { type: "continue" },
  { type: "reopen_scope" },
  { type: "submit" },
  { type: "retry" },
  { type: "reset" },
];

test("ClientActionSchema accepts each of the 9 requester actions", () => {
  assert.equal(new Set(CLIENT_ACTIONS.map((a) => a.type)).size, 9);
  for (const a of CLIENT_ACTIONS) assert.ok(ok(ClientActionSchema, a), a.type);
});

test("ClientActionSchema trims text values", () => {
  const r = ClientActionSchema.parse({ type: "answer", value: "  hi  " });
  assert.deepEqual(r, { type: "answer", value: "hi" });
});

test("ClientActionSchema rejects an unknown slot key", () => {
  assert.ok(!ok(ClientActionSchema, { type: "edit", key: "pets", value: "x" }));
});

test("ClientActionSchema rejects empty, blank and over-long values", () => {
  assert.ok(!ok(ClientActionSchema, { type: "answer", value: "" }));
  assert.ok(!ok(ClientActionSchema, { type: "answer", value: "   " }));
  assert.ok(!ok(ClientActionSchema, { type: "edit", key: "top", value: "" }));
  assert.equal(TEXT_MAX, 2000);
  assert.ok(ok(ClientActionSchema, { type: "answer", value: "x".repeat(TEXT_MAX) }));
  assert.ok(!ok(ClientActionSchema, { type: "answer", value: "x".repeat(TEXT_MAX + 1) }));
});

test("ClientActionSchema rejects reviewer actions, unknown types and bad enums", () => {
  assert.ok(!ok(ClientActionSchema, { type: "decide", version: 1, status: "approved" }));
  assert.ok(!ok(ClientActionSchema, { type: "open", version: 1 }));
  assert.ok(!ok(ClientActionSchema, { type: "nope" }));
  assert.ok(!ok(ClientActionSchema, { type: "resolve", choice: "maybe" }));
  assert.ok(!ok(ClientActionSchema, { type: "choose_scope", scope: "huge", role: "cheap", knobs: { studentsPerMonth: 1, convsPerStudent: 1 } }));
});

test("choose_scope needs numeric knobs (missing knobs are a 400 now, L9)", () => {
  assert.ok(!ok(ClientActionSchema, { type: "choose_scope", scope: "faq", role: "cheap" }));
  assert.ok(!ok(ClientActionSchema, { type: "choose_scope", scope: "faq", role: "cheap", knobs: { studentsPerMonth: "300", convsPerStudent: 2 } }));
  assert.ok(!ok(ClientActionSchema, { type: "choose_scope", scope: "faq", role: "cheap", knobs: { studentsPerMonth: NaN, convsPerStudent: 2 } }));
});

// --- POST /api/review/[reviewId] body -----------------------------------------------------

test("ReviewActionSchema accepts open and an approval without a note", () => {
  assert.ok(ok(ReviewActionSchema, { type: "open", version: 1 }));
  assert.ok(ok(ReviewActionSchema, { type: "decide", version: 2, status: "approved" }));
});

test("ReviewActionSchema needs a note for changes and rejected", () => {
  assert.ok(!ok(ReviewActionSchema, { type: "decide", version: 1, status: "changes" }));
  assert.ok(!ok(ReviewActionSchema, { type: "decide", version: 1, status: "rejected" }));
  assert.ok(!ok(ReviewActionSchema, { type: "decide", version: 1, status: "changes", note: "   " }), "blank note");
  assert.ok(ok(ReviewActionSchema, { type: "decide", version: 1, status: "changes", note: "Add the credit window." }));
  const r = ReviewActionSchema.safeParse({ type: "decide", version: 1, status: "rejected" });
  assert.ok(!r.success && r.error.issues.some((i) => i.message === "Say what should change, or why it's rejected."));
});

test("ReviewActionSchema rejects version 0, fractions, pending as a decision and long notes", () => {
  assert.ok(!ok(ReviewActionSchema, { type: "open", version: 0 }));
  assert.ok(!ok(ReviewActionSchema, { type: "decide", version: 0, status: "approved" }));
  assert.ok(!ok(ReviewActionSchema, { type: "open", version: 1.5 }));
  assert.ok(!ok(ReviewActionSchema, { type: "decide", version: 1, status: "pending" }));
  assert.ok(!ok(ReviewActionSchema, { type: "decide", version: 1, status: "changes", note: "x".repeat(NOTE_MAX + 1) }));
});

test("reviewPath is relative", () => {
  assert.equal(reviewPath("abc-123"), "/review/abc-123");
});

// --- Contract constants (types.ts, scenario.ts) -------------------------------------------

test("SLOT_KEYS is the interview order and SLOT_LABELS has studio's text", () => {
  assert.deepEqual([...SLOT_KEYS], ["users", "top", "never", "examples", "sources", "handoff"]);
  assert.deepEqual(SLOT_LABELS, {
    users: "Who uses it",
    top: "Top questions",
    never: "Must never",
    examples: "Great vs. bad answer",
    sources: "Reads from",
    handoff: "Hands off when",
  });
});

const at = "2026-11-11T00:00:00.000Z";
const audit: Source = { name: "Students paste their degree audit", level: 3, decidedBy: "rule", reason: "FERPA student record" };
const flagged = (): Session => [
  { type: "SUBMIT_IDEA", text: "Help students see if they can switch into Finance", at },
  { type: "APPLY_TURN", prefilled: [], sources: [audit], at },
].reduce((s, a) => reduce(s, a as Action), initial("s1", at));
const lastLine = (s: Session) => s.log[s.log.length - 1].what;

test("SCENARIO pushback strings are journey.ts's own log text", () => {
  const s = flagged();
  assert.ok(lastLine(s).endsWith(` ${SCENARIO.pushback.limit}`), lastLine(s));
  assert.equal(SCENARIO.pushback.limit, "AI Studio allows Levels 1–2 only.");
  assert.equal(lastLine(reduce(s, { type: "RESOLVE_PUSHBACK", choice: "keep", at })), SCENARIO.pushback.keepAnywayReply);

  const a = reduce(s, { type: "RESOLVE_PUSHBACK", choice: "selfreport", at });
  assert.ok(a.log.some((d) => d.what === SCENARIO.pushback.options.selfreport.logLine));
  assert.deepEqual(a.sources.at(-1), SCENARIO.pushback.selfReportSource);
  const b = reduce(s, { type: "RESOLVE_PUSHBACK", choice: "route", at });
  assert.ok(b.log.some((d) => d.what === SCENARIO.pushback.options.route.logLine));
});

test("SCENARIO rules are journey's canonical text (not studio's drifted copy)", () => {
  const { selfreport, route } = SCENARIO.pushback.options;
  assert.equal(selfreport.rule,
    "Never ask for, read, or store student records. Use only the GPA and credits the student states in the chat, and say the answer depends on them.");
  assert.equal(route.rule, "Never read pasted records. Questions about a specific student's record go to an advising appointment.");
  assert.equal(selfreport.title, "(a) Students tell it their GPA and credits");
  assert.equal(selfreport.detail, "Nothing is read or stored. Answers say they depend on what the student reported.");
  assert.equal(route.title, "(b) No records at all");
  assert.equal(route.detail, "Questions about a specific record go to an advising appointment.");
});

test("SCENARIO check facts read the knowledge snapshots", () => {
  const knowledge = loadKnowledge().map((p) => p.text).join("\n\n");
  const { checks } = SCENARIO;
  assert.equal(checks.program, "Finance");
  assert.equal(knowledge.match(checks.gpaMinimum.pattern)?.[1], "3.50");
  assert.ok(checks.notAccepting.patterns.length > 0);
  assert.ok(checks.notAccepting.patterns.every((p) => p.test(knowledge)));
  assert.ok(checks.handoff.test("Book an appointment with your advisor."));
  assert.ok(!checks.handoff.test("Finance needs a 3.50."));
});

test("Phase 2b actions: run_tests, rewrite_answer, accept_failure (contract 9.4)", () => {
  assert.ok(ok(ClientActionSchema, { type: "run_tests" }));
  assert.ok(ok(ClientActionSchema, { type: "rewrite_answer", testId: 3, value: "The bulletin minimum is 3.50; talk to your advisor." }));
  assert.ok(ok(ClientActionSchema, { type: "accept_failure", testId: 3, role: "cheap", note: "Haiku is fine for this question." }));
  assert.ok(!ok(ClientActionSchema, { type: "rewrite_answer", testId: 0, value: "x" }));
  assert.ok(!ok(ClientActionSchema, { type: "rewrite_answer", testId: 1, value: "  " }));
  assert.ok(!ok(ClientActionSchema, { type: "accept_failure", testId: 1, role: "judge", note: "x" }));
  assert.ok(!ok(ClientActionSchema, { type: "accept_failure", testId: 1, role: "cheap" }), "note is required");
});

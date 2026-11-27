import { test } from "node:test";
import assert from "node:assert/strict";
import * as journey from "./journey";
import { allowed, initial, levelLabel, missingSlots, nextQuestion, reduce, MAX_QUESTIONS, type Action } from "./journey";
import { SCENARIO } from "./scenario";
import { SLOT_KEYS, type Decision, type ReviewDecision, type Session, type SlotKey, type Source } from "./types";

const at = "2026-11-10T00:00:00.000Z";
const run = (s: Session, ...actions: Action[]) => actions.reduce(reduce, s);
const turn = (extra: Partial<Extract<Action, { type: "APPLY_TURN" }>> = {}): Action =>
  ({ type: "APPLY_TURN", prefilled: [], sources: [], at, ...extra });
const answer = (value: string): Action => ({ type: "ANSWER", value, at });

const audit: Source = { name: "Students paste their degree audit", level: 3, decidedBy: "rule", reason: "FERPA student record" };
const bulletin: Source = { name: "Undergraduate Bulletin", level: 1, decidedBy: "rule", reason: "public page" };

const started = () => run(initial("s1", at), { type: "SUBMIT_IDEA", text: "Help students see if they can switch into Finance", at });

test("idea moves to interview and waits for a turn", () => {
  const s = started();
  assert.equal(s.step, "interview");
  assert.deepEqual(allowed(s), ["APPLY_TURN", "EDIT_SLOT", "RESET"]);
});

test("out-of-order action is blocked and logged, state unchanged", () => {
  const s = started();
  const t = reduce(s, answer("hi"));
  assert.equal(t.asked, 0);
  assert.match(t.log.at(-1)!.what, /Blocked/);
});

test("judgment slots are never prefilled, even if the model tries", () => {
  const s = run(started(), turn({ prefilled: [
    { key: "never", value: "promise admission", confidence: 0.9 },
    { key: "users", value: "Sophomores", confidence: 0.9 },
  ] }));
  assert.equal(s.slots.find((x) => x.key === "never"), undefined);
  assert.equal(s.slots.find((x) => x.key === "users")?.filledBy, "prefill");
});

test("high-confidence prefills are skipped; low-confidence ones are still asked", () => {
  const s = run(started(), turn({ prefilled: [
    { key: "users", value: "Sophomores", confidence: 0.9 },
    { key: "top", value: "GPA?", confidence: 0.3 },
    { key: "sources", value: "Bulletin", confidence: 0.8 },
  ] }));
  assert.deepEqual(missingSlots(s), ["top", "never", "examples", "handoff"]);
});

test("a proposed question for an illegal slot falls back to the first missing slot", () => {
  const s = run(started(), turn({
    prefilled: [{ key: "users", value: "Sophomores", confidence: 0.9 }],
    question: { slot: "users", ask: "Who uses it?", chips: [] },
  }));
  assert.equal(s.question?.slot, "top");
});

test("a legal proposed question keeps the model's wording and max 3 chips", () => {
  const s = run(started(), turn({ question: { slot: "never", ask: "What must it never say?", chips: ["a", "b", "c", "d"] } }));
  assert.equal(s.question?.ask, "What must it never say?");
  assert.equal(s.question?.chips.length, 3);
});

test("when the budget is tight, judgment slots win over the model's pick", () => {
  // 3 answers used; 3 left; never/examples/handoff all missing → must ask a required slot.
  let s = started();
  for (const v of ["a", "b", "c"]) s = run(s, turn({ question: { slot: "users", ask: "x", chips: [] } }), answer(v));
  const q = nextQuestion({ ...s, slots: s.slots.filter((x) => !["never", "examples", "handoff"].includes(x.key)) }, { slot: "sources", ask: "Where?", chips: [] });
  assert.ok(["never", "examples", "handoff"].includes(q!.slot));
});

test("interview ends after required slots are answered and prefills are confident", () => {
  let s = run(started(), turn({ prefilled: [
    { key: "users", value: "Sophomores", confidence: 0.9 },
    { key: "top", value: "GPA, courses, timing", confidence: 0.9 },
    { key: "sources", value: "Bulletin, Smeal page", confidence: 0.9 },
  ] }));
  for (const v of ["promise admission", "great: X / bad: Y", "appeals, medical"]) s = run(s, answer(v), turn());
  assert.equal(s.step, "scope");
  assert.equal(s.asked, 3);
  assert.equal(s.question, undefined);
});

test("never asks more than MAX_QUESTIONS", () => {
  let s = started();
  for (let i = 0; i < 10 && s.step === "interview"; i++) s = run(s, turn(), answer(`answer ${i}`));
  assert.equal(s.step, "scope");
  assert.ok(s.asked <= MAX_QUESTIONS);
});

test("a Level 3 source blocks the flow until resolved", () => {
  const s = run(started(), turn({ sources: [bulletin, audit] }));
  assert.equal(s.pushback?.blocking, true);
  assert.deepEqual(s.pushback?.flagged, [audit.name]);
  assert.deepEqual(allowed(s), ["RESOLVE_PUSHBACK", "RESET"]);
  assert.match(reduce(s, answer("x")).log.at(-1)!.what, /Blocked/);
});

test("'keep anyway' never advances the flow", () => {
  let s = run(started(), turn({ sources: [audit] }));
  for (let i = 0; i < 3; i++) s = reduce(s, { type: "RESOLVE_PUSHBACK", choice: "keep", at });
  assert.equal(s.pushback?.blocking, true);
  assert.equal(s.pushback?.attempts, 3);
  assert.ok(s.sources.some((x) => x.level === 3));
});

test("self-report removes the record source and adds a Level 1 self-report source", () => {
  const s = run(started(), turn({ sources: [bulletin, audit] }), { type: "RESOLVE_PUSHBACK", choice: "selfreport", at });
  assert.equal(s.pushback?.blocking, false);
  assert.equal(s.pushback?.choice, "selfreport");
  assert.ok(s.sources.every((x) => x.level < 3));
  assert.ok(s.sources.some((x) => /self-reports/.test(x.name)));
  assert.ok(s.question, "interview continues with a question");
});

test("route removes the record source without adding one", () => {
  const s = run(started(), turn({ sources: [bulletin, audit] }), { type: "RESOLVE_PUSHBACK", choice: "route", at });
  assert.deepEqual(s.sources.map((x) => x.name), [bulletin.name]);
});

test("the same source is not added twice", () => {
  const s = run(started(), turn({ sources: [bulletin] }), answer("x"), turn({ sources: [{ ...bulletin, name: "undergraduate bulletin " }] }));
  assert.equal(s.sources.length, 1);
});

test("the idea and each answer wait as pending text until a tool turn", () => {
  let s = started();
  assert.equal(s.pending, "Help students see if they can switch into Finance");
  s = run(s, turn());
  assert.equal(s.pending, undefined);
  s = run(s, answer("Sophomores"));
  assert.equal(s.pending, "Sophomores");
});

test("each shown question is logged; a question is hidden and unlogged while the gate blocks", () => {
  const s = run(started(), turn({ sources: [audit], question: { slot: "never", ask: "What must it never do?", chips: [] } }));
  assert.ok(s.question, "question kept for later");
  assert.equal(s.log.filter((d) => d.kind === "question").length, 0);
  const t = reduce(s, { type: "RESOLVE_PUSHBACK", choice: "selfreport", at });
  assert.equal(t.log.at(-1)?.kind, "question");
  assert.equal(t.log.at(-1)?.what, "What must it never do?");
});

const finished = () => {
  let s = run(started(), turn({ prefilled: [
    { key: "users", value: "Sophomores", confidence: 0.9 },
    { key: "top", value: "GPA, courses, timing", confidence: 0.9 },
    { key: "sources", value: "Bulletin, Smeal page", confidence: 0.9 },
  ] }));
  for (const v of ["promise admission", "great: X / bad: Y", "appeals, medical"]) s = run(s, answer(v), turn());
  return s;
};

test("choosing a scope records model, knobs and a cost estimate, then moves to tests", () => {
  const s = finished();
  assert.deepEqual(allowed(s), ["CHOOSE_SCOPE", "RESET"]);
  const t = reduce(s, {
    type: "CHOOSE_SCOPE", scope: "guided", role: "capable", model: "claude-sonnet-5",
    price: { name: "Claude Sonnet 5", inPerM: 2, outPerM: 10 }, knobs: { studentsPerMonth: 2000, convsPerStudent: 2 }, at,
  });
  assert.equal(t.step, "tests");
  assert.equal(t.scope, "guided");
  assert.deepEqual(t.model, { role: "capable", name: "claude-sonnet-5" });
  assert.equal(t.estimate?.monthlyDollars, 112);
  assert.match(t.log.at(-1)!.what, /Guided eligibility check.*\$112\/month/);
  assert.equal(t.log.at(-1)!.who, "requester");
});

test("a model with no known price gets no estimate, and the log says so", () => {
  const t = reduce(finished(), { type: "CHOOSE_SCOPE", scope: "faq", role: "cheap", model: "gpt-5.4-mini", knobs: { studentsPerMonth: 100, convsPerStudent: 1 }, at });
  assert.equal(t.estimate, undefined);
  assert.match(t.log.at(-1)!.what, /no price on file/);
});

test("scope can't be chosen during the interview", () => {
  const s = started();
  const t = reduce(s, { type: "CHOOSE_SCOPE", scope: "faq", role: "cheap", model: "x", knobs: { studentsPerMonth: 1, convsPerStudent: 1 }, at });
  assert.equal(t.scope, undefined);
  assert.match(t.log.at(-1)!.what, /Blocked/);
});

test("every decision is logged with who made it", () => {
  const s = run(started(), turn({ sources: [audit] }), { type: "RESOLVE_PUSHBACK", choice: "route", at });
  const whos = new Set(s.log.map((d) => d.who));
  assert.ok(whos.has("requester") && whos.has("tool"));
});

test("pushback text comes from SCENARIO, byte for byte", () => {
  const flagged = run(started(), turn({ sources: [audit] }));
  const flagLine = flagged.log.at(-1)!;
  assert.equal(flagLine.what, `Flag: "${audit.name}" is ${levelLabel(3)}. ${SCENARIO.pushback.limit}`);

  const kept = reduce(flagged, { type: "RESOLVE_PUSHBACK", choice: "keep", at });
  assert.equal(kept.log.at(-1)!.what, SCENARIO.pushback.keepAnywayReply);

  const a = reduce(flagged, { type: "RESOLVE_PUSHBACK", choice: "selfreport", at });
  assert.deepEqual(a.sources.at(-1), SCENARIO.pushback.selfReportSource);
  assert.ok(a.log.some((d) => d.kind === "resolve" && d.what === SCENARIO.pushback.options.selfreport.logLine));
  const b = reduce(flagged, { type: "RESOLVE_PUSHBACK", choice: "route", at });
  assert.ok(b.log.some((d) => d.kind === "resolve" && d.what === SCENARIO.pushback.options.route.logLine));
});

test("journey keeps no second copy of the slot keys or pushback text", () => {
  for (const name of ["SLOT_ORDER", "PUSHBACK_RULES", "SELF_REPORT_SOURCE"]) {
    assert.equal(name in journey, false, `journey.ts still exports ${name}`);
  }
  assert.deepEqual(missingSlots(started()), [...SLOT_KEYS], "interview order is SLOT_KEYS");
});

// --- Phase 3: blueprint, submit, review (contract §6) --------------------------------------

const haiku = { name: "Claude Haiku 4.5", inPerM: 1, outPerM: 5 };
const knobs = { studentsPerMonth: 2000, convsPerStudent: 2 };
const edit = (key: SlotKey, value: string, flagged: Source[] = []): Action => ({ type: "EDIT_SLOT", key, value, flagged, at });
const choose = (scope: "faq" | "guided" | "open" = "guided"): Action =>
  ({ type: "CHOOSE_SCOPE", scope, role: "cheap", model: "claude-haiku-4-5", price: haiku, knobs, at });
const atTests = () => reduce(finished(), choose());
const atBlueprint = () => reduce(atTests(), { type: "CONTINUE_TO_BLUEPRINT", at });
const submit = (s: Session, reviewId = "rev-1") => reduce(s, { type: "SUBMIT_FOR_REVIEW", reviewId, at });
const decide = (s: Session, status: ReviewDecision, note?: string, version = s.review!.version) =>
  reduce(s, { type: "REVIEW_DECISION", version, status, note, at });
const last = (s: Session) => s.log.at(-1)!;
const line = (d: Decision) => ({ who: d.who, what: d.what, kind: d.kind });
const blockedLines = (s: Session) => s.log.filter((d) => d.kind === "blocked").length;

test("allowed actions per step: tests, blueprint, review, done", () => {
  assert.deepEqual(allowed(atTests()), ["CONTINUE_TO_BLUEPRINT", "REOPEN_SCOPE", "RESET"]);
  assert.deepEqual(allowed(atBlueprint()), ["EDIT_SLOT", "REOPEN_SCOPE", "SUBMIT_FOR_REVIEW", "RESET"]);
  const review = submit(atBlueprint());
  assert.deepEqual(allowed(review), ["REVIEW_OPENED", "REVIEW_DECISION"]);
  assert.deepEqual(allowed(decide(review, "approved")), []);
});

test("continue moves tests to blueprint and says tests were not run", () => {
  const s = atBlueprint();
  assert.equal(s.step, "blueprint");
  assert.deepEqual(line(last(s)),
    { who: "requester", what: "Continued to the blueprint. Tests not run: the test run needs live models.", kind: "blueprint" });
});

test("continue is blocked during the interview", () => {
  const s = reduce(started(), { type: "CONTINUE_TO_BLUEPRINT", at });
  assert.equal(s.step, "interview");
  assert.match(last(s).what, /Blocked/);
});

test("reopen scope from tests and from blueprint keeps the earlier choice until re-chosen", () => {
  for (const from of [atTests(), atBlueprint()]) {
    const s = reduce(from, { type: "REOPEN_SCOPE", at });
    assert.equal(s.step, "scope");
    assert.equal(s.scope, "guided");
    assert.deepEqual(s.knobs, knobs);
    assert.deepEqual(s.estimate, from.estimate);
    assert.deepEqual(line(last(s)), { who: "requester", what: "Reopened the scope.", kind: "note" });
    assert.deepEqual(allowed(s), ["CHOOSE_SCOPE", "RESET"]);
  }
});

test("submit freezes v1 as pending and moves to review", () => {
  const s = submit(atBlueprint());
  assert.equal(s.step, "review");
  assert.deepEqual(s.review, { reviewId: "rev-1", version: 1, status: "pending", submittedAt: at });
  assert.deepEqual(line(last(s)), { who: "requester", what: "Submitted blueprint v1 for review.", kind: "submit" });
});

test("review opened sets openedAt once and logs once, as the reviewer", () => {
  const later = "2026-11-11T10:00:00.000Z";
  const s = reduce(submit(atBlueprint()), { type: "REVIEW_OPENED", version: 1, at: later });
  assert.equal(s.review?.openedAt, later);
  assert.deepEqual(line(last(s)), { who: "reviewer", what: "Opened blueprint v1.", kind: "review" });
  const again = reduce(s, { type: "REVIEW_OPENED", version: 1, at: "2026-11-11T11:00:00.000Z" });
  assert.equal(again, s, "second open changes nothing and logs nothing");
  assert.equal(reduce(s, { type: "REVIEW_OPENED", version: 2, at }), s, "unknown version changes nothing");
});

test("request changes sends Dana back to the blueprint with the note", () => {
  const s = decide(submit(atBlueprint()), "changes", "Add the credit window.");
  assert.equal(s.step, "blueprint");
  assert.equal(s.review?.status, "changes");
  assert.equal(s.review?.note, "Add the credit window.");
  assert.equal(s.review?.decidedAt, at);
  assert.equal(s.review?.openedAt, at, "a decision without an open counts as opened now");
  assert.deepEqual(line(last(s)), { who: "reviewer", what: "Requested changes on v1: Add the credit window.", kind: "review" });
});

test("resubmit after changes is v2 on the same review link, with a clean round", () => {
  const changed = decide(reduce(submit(atBlueprint()), { type: "REVIEW_OPENED", version: 1, at }), "changes", "Add the credit window.");
  const s = submit(changed, "rev-NEW");
  assert.deepEqual(s.review, { reviewId: "rev-1", version: 2, status: "pending", submittedAt: at });
  assert.equal(last(s).what, "Submitted blueprint v2 for review.");
});

test("approve and reject end the flow", () => {
  const ok = decide(submit(atBlueprint()), "approved");
  assert.equal(ok.step, "done");
  assert.equal(ok.review?.status, "approved");
  assert.deepEqual(line(last(ok)), { who: "reviewer", what: "Approved v1.", kind: "review" });
  const no = decide(submit(atBlueprint()), "rejected", "Open scope is too risky.");
  assert.equal(no.step, "done");
  assert.equal(no.review?.note, "Open scope is too risky.");
  assert.equal(last(no).what, "Rejected v1: Open scope is too risky.");
});

test("a decision on a stale version is blocked and logged", () => {
  const v2 = submit(decide(submit(atBlueprint()), "changes", "More."));
  const s = decide(v2, "approved", undefined, 1);
  assert.equal(s.step, "review");
  assert.deepEqual(s.review, v2.review);
  assert.equal(last(s).kind, "blocked");
});

test("a decision when the round is not pending is blocked", () => {
  const odd: Session = { ...submit(atBlueprint()), review: { reviewId: "rev-1", version: 1, status: "approved", submittedAt: at } };
  const s = decide(odd, "rejected", "No.");
  assert.equal(s.review?.status, "approved");
  assert.equal(last(s).kind, "blocked");
});

test("RESET works before the first submit and is refused after it", () => {
  assert.equal(reduce(atBlueprint(), { type: "RESET", at }).step, "idea");
  const review = submit(atBlueprint());
  for (const s of [review, decide(review, "approved"), decide(review, "changes", "More.")]) {
    const t = reduce(s, { type: "RESET", at });
    assert.equal(t.step, s.step);
    assert.deepEqual(t.review, s.review);
    assert.equal(blockedLines(t), blockedLines(s) + 1);
  }
});

test("editing a slot at the blueprint updates it and stays at the blueprint", () => {
  const s = reduce(atBlueprint(), edit("handoff", "Appeals and anything about their own record"));
  assert.equal(s.step, "blueprint");
  assert.equal(s.slots.find((x) => x.key === "handoff")?.value, "Appeals and anything about their own record");
  assert.equal(last(s).what, "Edited handoff: Appeals and anything about their own record");
});

test("an edit with flagged Level 3–4 data is refused, at the interview and at the blueprint", () => {
  const hit: Source = { name: "Degree audits", level: 3, decidedBy: "rule", reason: "FERPA", ruleId: "degree-audit" };
  for (const from of [started(), atBlueprint()]) {
    const s = reduce(from, edit("sources", "students paste their degree audit", [hit]));
    assert.deepEqual(s.slots, from.slots);
    assert.equal(s.step, from.step);
    assert.deepEqual(line(last(s)),
      { who: "tool", what: `Edits can't include Level 3–4 data: Degree audits. ${SCENARIO.pushback.limit}`, kind: "blocked" });
  }
});

test("a flag keeps the flagged Source objects, and they survive the resolve", () => {
  const audit3: Source = { ...audit, ruleId: "degree-audit" };
  const flagged = run(started(), turn({ sources: [bulletin, audit3] }));
  assert.deepEqual(flagged.pushback?.flaggedSources, [audit3]);
  const s = reduce(flagged, { type: "RESOLVE_PUSHBACK", choice: "selfreport", at });
  assert.ok(s.sources.every((x) => x.level < 3));
  assert.deepEqual(s.pushback?.flaggedSources?.map((f) => [f.level, f.decidedBy]), [[3, "rule"]]);
});

test("change request, new scope, resubmit: v2 has the new scope", () => {
  const v1 = submit(atBlueprint());
  const actions: Action[] = [
    { type: "REOPEN_SCOPE", at },
    choose("faq"),
    { type: "CONTINUE_TO_BLUEPRINT", at },
    { type: "SUBMIT_FOR_REVIEW", reviewId: "x", at },
  ];
  const s = actions.reduce(reduce, decide(v1, "changes", "Narrow it to an FAQ."));
  assert.equal(s.review?.version, 2);
  assert.equal(v1.scope, "guided");
  assert.equal(s.scope, "faq");
});

test("a second flag resolved with (a) again keeps one self-report source", () => {
  const audit3: Source = { ...audit, ruleId: "degree-audit" };
  const transcripts: Source = { name: "Students upload transcripts", level: 3, decidedBy: "rule", reason: "FERPA", ruleId: "transcript" };
  const first = run(started(), turn({ sources: [bulletin, audit3] }), { type: "RESOLVE_PUSHBACK", choice: "selfreport", at });
  const flagged = run(first, answer("x"), turn({ sources: [transcripts] }));
  assert.equal(flagged.pushback?.blocking, true, "second flag raised");
  const s = reduce(flagged, { type: "RESOLVE_PUSHBACK", choice: "selfreport", at });
  const name = SCENARIO.pushback.selfReportSource.name;
  assert.equal(s.sources.filter((x) => x.name === name).length, 1);
  const names = s.sources.map((x) => x.name);
  assert.equal(new Set(names).size, names.length, "source names are unique");
});

test("the self-report source is not added next to a kept source with the same name in another case or spacing", () => {
  const self = SCENARIO.pushback.selfReportSource;
  const lookalike: Source = { ...self, name: `${self.name.toUpperCase()} ` };
  const s = run(started(), turn({ sources: [lookalike, { ...audit, ruleId: "degree-audit" }] }), { type: "RESOLVE_PUSHBACK", choice: "selfreport", at });
  const norm = (n: string) => n.trim().toLowerCase();
  assert.equal(s.sources.filter((x) => norm(x.name) === norm(self.name)).length, 1);
});

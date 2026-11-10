import { test } from "node:test";
import assert from "node:assert/strict";
import { allowed, initial, missingSlots, nextQuestion, reduce, MAX_QUESTIONS, type Action } from "./journey";
import type { Session, Source } from "./types";

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

test("every decision is logged with who made it", () => {
  const s = run(started(), turn({ sources: [audit] }), { type: "RESOLVE_PUSHBACK", choice: "route", at });
  const whos = new Set(s.log.map((d) => d.who));
  assert.ok(whos.has("requester") && whos.has("tool"));
});

/** Engine tests run the offline interviewer against an in-memory database. */
import { test, beforeEach } from "node:test";
import assert from "node:assert/strict";
import type { ClientAction } from "./api";
import { act, blueprintFor, pendingSlot, reviewAct, reviewView, startSession } from "./engine";
import { getBlueprint, getRounds, getSession, resetDbForTests, saveSession } from "./store";
import type { Session, SlotKey } from "./types";

process.env.LLM_PROVIDER = "offline";
beforeEach(() => resetDbForTests());

const IDEA = "Something that helps students figure out if they can switch into Finance.";

/** Answer offline questions from `answers` (by slot) until `stop` says so or the interview ends. */
async function interview(answers: Partial<Record<string, string>>, stop?: (s: Session) => boolean): Promise<Session> {
  let s = (await startSession(IDEA)).session;
  while (s.step === "interview" && s.question && !s.pushback?.blocking && !stop?.(s)) {
    const value = answers[s.question.slot] ?? `Answer for ${s.question.slot}`;
    s = (await act(s.id, { type: "answer", value }))!.session;
  }
  return s;
}

const RECORDS = "Never ask for transcripts, degree audits or student IDs";
const MIXED = "It must never give admission advice; students will paste their degree audit";
const untilNever = (s: Session) => s.question?.slot === "never";

test("gate: a never answer listing records raises no pushback", async () => {
  const s = await interview({ never: RECORDS });
  assert.equal(s.pushback, undefined);
  assert.equal(s.slots.find((x) => x.key === "never")?.value, RECORDS);
  assert.equal(s.step, "scope");
});

test("gate: a never answer that also names a record source raises the pushback", async () => {
  const s = await interview({ never: MIXED });
  assert.equal(s.pushback?.blocking, true);
  assert.deepEqual(s.pushback?.flaggedRules, ["degree-audit"]);
});

test("gate: the same list answered to another question raises the pushback", async () => {
  // Offline prefills "sources", so the top question stands in for a non-never answer.
  const s = await interview({ top: RECORDS }, untilNever);
  assert.equal(s.pushback?.blocking, true);
  assert.deepEqual(s.pushback?.flaggedRules, ["degree-audit", "student-id"]);
});

test("pending slot on retry: the one requester slot holding the text, else none (fail closed)", () => {
  const base: Session = {
    id: "p", step: "interview", idea: "x", sources: [], asked: 2, knobs: { studentsPerMonth: 1, convsPerStudent: 1 }, log: [],
    slots: [
      { key: "never", value: "Same answer", filledBy: "requester" },
      { key: "users", value: "Same answer", filledBy: "prefill", confidence: 0.9 },
      { key: "top", value: "Other", filledBy: "requester" },
    ],
  };
  assert.equal(pendingSlot({ ...base, pending: "Same answer" }), "never", "prefills don't count");
  assert.equal(pendingSlot({ ...base, pending: "Other" }), "top");
  assert.equal(pendingSlot({ ...base, pending: "The idea" }), undefined);
  const tie: Session = { ...base, pending: "Same answer", slots: [...base.slots, { key: "handoff", value: "Same answer", filledBy: "requester" }] };
  assert.equal(pendingSlot(tie), undefined);
});

// --- Phase 3: blueprint, submit, review (BE-4) ---------------------------------------------

const DANA: Record<SlotKey, string> = {
  users: "Sophomores thinking about Finance",
  top: "Can I switch? Students paste their degree audit so it can check.",
  never: "Promise admission",
  examples: "Great: the published minimum and next steps. Bad: a yes or no on admission.",
  sources: "The bulletin and the Smeal change-of-major page",
  handoff: "Appeals and anything about their own record",
};
const KNOBS = { studentsPerMonth: 2000, convsPerStudent: 2 };

const step = async (id: string, a: ClientAction) => (await act(id, a))!;

/** Offline interview with Dana's answers: the degree audit is flagged and resolved with (a). */
async function danaAtScope(): Promise<Session> {
  let s = (await startSession(IDEA)).session;
  while (s.step === "interview") {
    if (s.pushback?.blocking) s = (await step(s.id, { type: "resolve", choice: "selfreport" })).session;
    else s = (await step(s.id, { type: "answer", value: DANA[s.question!.slot] })).session;
  }
  return s;
}
async function danaAtBlueprint() {
  const s = await danaAtScope();
  await step(s.id, { type: "choose_scope", scope: "guided", role: "cheap", knobs: KNOBS });
  return step(s.id, { type: "continue" });
}
async function submittedV1() {
  const r = await danaAtBlueprint();
  return step(r.session.id, { type: "submit" });
}
const logLength = (id: string) => getSession(id)!.log.length;

test("engine: Dana's offline loop through two review rounds", async () => {
  const scope = await danaAtScope();
  assert.equal(scope.step, "scope");
  assert.deepEqual(scope.pushback?.flaggedRules, ["degree-audit"]);
  assert.equal(scope.pushback?.choice, "selfreport");

  const bp = await danaAtBlueprint();
  assert.equal(bp.session.step, "blueprint");
  assert.deepEqual([bp.blueprint?.version, bp.blueprint?.draft], [1, true]);

  const v1 = await step(bp.session.id, { type: "submit" });
  const id = v1.session.id;
  const reviewId = v1.session.review!.reviewId;
  assert.equal(v1.session.step, "review");
  assert.equal(v1.session.review?.status, "pending");
  assert.deepEqual([v1.blueprint?.version, v1.blueprint?.draft], [1, false]);

  const pending = reviewView(reviewId)!;
  assert.deepEqual([pending.status, pending.blueprint.version, pending.rounds.length], ["pending", 1, 1]);
  assert.equal(JSON.stringify(pending).includes(id), false, "the review view never carries the session id");

  assert.equal((await reviewAct(reviewId, { type: "open", version: 1 })).status, 200);
  const changes = await reviewAct(reviewId, { type: "decide", version: 1, status: "changes", note: "Add the credit window." });
  assert.equal(changes.status, 200);
  assert.equal(changes.body.review?.status, "changes");

  let s = getSession(id)!;
  assert.equal(s.step, "blueprint");
  assert.equal(s.review?.note, "Add the credit window.");
  const edited = await step(id, { type: "edit", key: "handoff", value: "Appeals, credit-window questions, and their own record" });
  assert.equal(edited.session.step, "blueprint");
  assert.deepEqual([edited.blueprint?.version, edited.blueprint?.draft], [2, true]);

  const v2 = await step(id, { type: "submit" });
  assert.equal(v2.session.review?.version, 2);
  assert.equal(v2.session.review?.reviewId, reviewId, "same link for every version");
  assert.equal(v2.blueprint?.spec.find((x) => x.key === "handoff")?.value, "Appeals, credit-window questions, and their own record");

  assert.equal((await reviewAct(reviewId, { type: "open", version: 2 })).status, 200);
  const done = await reviewAct(reviewId, { type: "decide", version: 2, status: "approved" });
  assert.equal(done.status, 200);
  s = getSession(id)!;
  assert.equal(s.step, "done");
  const view = done.body.review!;
  assert.equal(view.status, "approved");
  assert.deepEqual(view.rounds.map((r) => r.status), ["changes", "approved"]);
  assert.ok(view.rounds.every((r) => typeof r.minutes === "number" && r.minutes >= 0));
  assert.ok(view.expertMinutes >= 0);
  assert.deepEqual(s.log.filter((d) => d.who === "reviewer").map((d) => d.what),
    ["Opened blueprint v1.", "Requested changes on v1: Add the credit window.", "Opened blueprint v2.", "Approved v2."]);
});

test("engine: v1 stays frozen after v2 is submitted", async () => {
  const v1 = await submittedV1();
  const reviewId = v1.session.review!.reviewId;
  await reviewAct(reviewId, { type: "decide", version: 1, status: "changes", note: "More." });
  await step(v1.session.id, { type: "edit", key: "never", value: "Promise admission or guess at a GPA" });
  await step(v1.session.id, { type: "submit" });
  assert.deepEqual(getBlueprint(v1.session.id, 1), v1.blueprint);
  assert.equal(reviewView(reviewId)?.blueprint.version, 2);
});

test("engine: decide without a note is a 400", async () => {
  const v1 = await submittedV1();
  const r = await reviewAct(v1.session.review!.reviewId, { type: "decide", version: 1, status: "changes" });
  assert.equal(r.status, 400);
  assert.equal(r.body.error, "Say what should change, or why it's rejected.");
  assert.equal(getSession(v1.session.id)?.review?.status, "pending");
});

test("engine: a stale or already-decided version is a 409 and writes nothing", async () => {
  const v1 = await submittedV1();
  const id = v1.session.id;
  const reviewId = v1.session.review!.reviewId;
  await reviewAct(reviewId, { type: "decide", version: 1, status: "changes", note: "More." });

  let before = logLength(id);
  const again = await reviewAct(reviewId, { type: "decide", version: 1, status: "approved" });
  assert.equal(again.status, 409);
  assert.ok(again.body.error && again.body.review);
  assert.equal(logLength(id), before, "no blocked line in Dana's log");

  await step(id, { type: "submit" });
  before = logLength(id);
  const stale = await reviewAct(reviewId, { type: "decide", version: 1, status: "approved" });
  assert.equal(stale.status, 409);
  assert.equal(stale.body.review?.blueprint.version, 2);
  assert.equal((await reviewAct(reviewId, { type: "open", version: 1 })).status, 409);
  assert.equal(logLength(id), before);
});

test("engine: an unknown review link is a 404", async () => {
  assert.equal(reviewView("not-a-real-id"), undefined);
  const r = await reviewAct("not-a-real-id", { type: "open", version: 1 });
  assert.deepEqual([r.status, r.body.error], [404, "This review link doesn't exist."]);
});

test("engine: reading the review has no side effects", async () => {
  const v1 = await submittedV1();
  const reviewId = v1.session.review!.reviewId;
  reviewView(reviewId);
  reviewView(reviewId);
  assert.equal(getSession(v1.session.id)?.review?.openedAt, undefined);
  assert.equal(getRounds(v1.session.id)[0].openedAt, undefined);
});

test("engine: opening twice records the first open only", async () => {
  const v1 = await submittedV1();
  const reviewId = v1.session.review!.reviewId;
  await reviewAct(reviewId, { type: "open", version: 1 });
  const first = getSession(v1.session.id)!.review!.openedAt;
  const before = logLength(v1.session.id);
  const r = await reviewAct(reviewId, { type: "open", version: 1 });
  assert.equal(r.status, 200);
  assert.equal(getSession(v1.session.id)!.review!.openedAt, first);
  assert.equal(logLength(v1.session.id), before);
});

test("engine: edit gate at the blueprint, after the degree audit was resolved", async () => {
  const bp = await danaAtBlueprint();
  const r = await step(bp.session.id, { type: "edit", key: "sources", value: "students paste their degree audit" });
  assert.deepEqual(r.session.slots, bp.session.slots);
  assert.equal(r.session.log.at(-1)?.kind, "blocked");
  assert.match(r.session.log.at(-1)!.what, /^Edits can't include Level 3–4 data: Degree audits\./);
});

test("engine: edit gate at the interview", async () => {
  const s = (await startSession(IDEA)).session;
  const r = await step(s.id, { type: "edit", key: "sources", value: "their transcripts" });
  assert.equal(r.session.slots.find((x) => x.key === "sources")?.value, s.slots.find((x) => x.key === "sources")?.value);
  assert.equal(r.session.log.at(-1)?.kind, "blocked");
});

test("engine: an old session saved at the tests step continues to a draft blueprint", async () => {
  const scope = await danaAtScope();
  const atTests = (await step(scope.id, { type: "choose_scope", scope: "faq", role: "cheap", knobs: KNOBS })).session;
  // Today's shape: no review, no flaggedSources.
  const old: Session = { ...atTests, pushback: { ...atTests.pushback!, flaggedSources: undefined } };
  delete old.review;
  saveSession(old);
  const r = await step(old.id, { type: "continue" });
  assert.equal(r.session.step, "blueprint");
  assert.deepEqual([r.blueprint?.version, r.blueprint?.draft], [1, true]);
  assert.deepEqual(r.blueprint?.data.pushback?.flagged.map((f) => f.level), [undefined]);
});

test("engine: blueprintFor is undefined before the blueprint step", async () => {
  const s = await danaAtScope();
  assert.equal(blueprintFor(s), undefined);
});

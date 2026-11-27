/** Engine tests run the offline interviewer against an in-memory database. */
import { test, beforeEach } from "node:test";
import assert from "node:assert/strict";
import type { ClientAction } from "./api";
import { act, blueprintFor, pendingSlot, reviewAct, reviewView, startSession } from "./engine";
import { getBlueprint, getRounds, getRuns, getSession, resetDbForTests, saveSession } from "./store";
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

test("engine: a reviewer body that isn't an object is a 400 with a plain message", async () => {
  for (const body of [undefined, null, "open", 3, ["open"]]) {
    const r = await reviewAct("any-id", body);
    assert.deepEqual([r.status, r.body.error], [400, "Invalid request."], JSON.stringify(body));
  }
});

// --- Phase 2b: run_tests (BE-10) -------------------------------------------------------------

const PINNED = "Capable passed all 13. Cheap failed 1: doesn't state the 3.50 minimum from the bulletin.";
async function danaAtTests() {
  const s = await danaAtScope();
  return (await step(s.id, { type: "choose_scope", scope: "guided", role: "cheap", knobs: KNOBS })).session;
}

test("engine: run_tests offline saves the run, keeps its ref and logs the pinned headline", async () => {
  const s = await danaAtTests();
  const r = await step(s.id, { type: "run_tests" });
  assert.equal(r.error, undefined);
  assert.equal(r.session.run?.headline, PINNED);
  assert.equal(r.session.tests?.length, 13);
  assert.equal(r.session.draft?.source, "offline-script");
  assert.equal(r.session.log.at(-1)?.what, `Ran 13 tests on offline-script and offline-script (offline script): ${PINNED}`);
  const runs = getRuns(s.id);
  assert.deepEqual(runs.map((x) => x.id), [r.session.run!.id]);
  assert.deepEqual(getSession(s.id)?.run, r.session.run);
});

test("engine: run_tests at the interview and at review is blocked and saves no run", async () => {
  const mid = await interview({}, untilNever);
  const a = await step(mid.id, { type: "run_tests" });
  assert.equal(a.session.log.at(-1)?.kind, "blocked");
  assert.equal(a.session.run, undefined);
  const review = (await submittedV1()).session;
  const b = await step(review.id, { type: "run_tests" });
  assert.equal(b.session.log.at(-1)?.kind, "blocked");
  assert.equal(b.session.run, undefined);
  assert.deepEqual([getRuns(mid.id), getRuns(review.id)], [[], []]);
});

test("engine: a draft error saves no run, logs Test run failed and returns the error", async () => {
  const s = await danaAtTests();
  const old = { p: process.env.LLM_PROVIDER, k: process.env.LLM_API_KEY, c: process.env.MODEL_CAPABLE };
  process.env.LLM_PROVIDER = "anthropic";
  delete process.env.LLM_API_KEY;
  delete process.env.MODEL_CAPABLE;
  try {
    const r = await step(s.id, { type: "run_tests" });
    assert.match(r.error ?? "", /MODEL_CAPABLE/);
    assert.equal(r.session.run, undefined);
    assert.equal(r.session.log.at(-1)?.what, `Test run failed: ${r.error}`);
    assert.equal(r.session.log.at(-1)?.kind, "tests");
    assert.deepEqual(getRuns(s.id), []);
    assert.equal(getSession(s.id)?.log.at(-1)?.what, `Test run failed: ${r.error}`);
  } finally {
    process.env.LLM_PROVIDER = old.p;
    if (old.k !== undefined) process.env.LLM_API_KEY = old.k;
    if (old.c !== undefined) process.env.MODEL_CAPABLE = old.c;
  }
});

test("engine: after a blueprint edit to never, the re-run drafts with the new wording and clears stale", async () => {
  const s = await danaAtTests();
  await step(s.id, { type: "run_tests" });
  await step(s.id, { type: "continue" });
  const edited = (await step(s.id, { type: "edit", key: "never", value: "Promise admission or quote tuition" })).session;
  assert.equal(edited.testsStale, true);
  assert.equal(edited.draft, undefined);
  const r = await step(s.id, { type: "run_tests" });
  assert.equal(r.session.step, "blueprint");
  assert.ok(r.session.draft?.instructions.includes("Promise admission or quote tuition"), r.session.draft?.instructions);
  assert.equal(r.session.testsStale, false);
  assert.equal(getRuns(s.id).length, 2);
});

test("engine: reset deletes the session's test runs", async () => {
  const s = await danaAtTests();
  await step(s.id, { type: "run_tests" });
  assert.equal(getRuns(s.id).length, 1);
  await step(s.id, { type: "reset" });
  assert.deepEqual(getRuns(s.id), []);
});

// --- Phase 2b: rewrite, accept, blueprint, stale submit (BE-11) ------------------------------

const GOOD = "Finance needs a minimum cumulative GPA of 3.50, per the bulletin. That's not a promise of admission; talk to an advisor.";

test("engine: a rewrite promising admission is refused with the check's reason", async () => {
  const s = await danaAtTests();
  await step(s.id, { type: "run_tests" });
  const r = await step(s.id, { type: "rewrite_answer", testId: 1, value: "Yes, you're guaranteed admission with a 3.50." });
  assert.equal(r.session.tests?.length, 13);
  assert.equal(r.session.log.at(-1)?.kind, "blocked");
  assert.match(r.session.log.at(-1)!.what, /^Rewrite refused: Promises an outcome/);
});

test("engine: a rewrite naming a degree audit is refused by the data gate", async () => {
  const s = await danaAtTests();
  await step(s.id, { type: "run_tests" });
  const r = await step(s.id, { type: "rewrite_answer", testId: 1, value: "Paste your degree audit and I'll check the 3.50 minimum with an advisor." });
  assert.equal(r.session.tests?.length, 13);
  assert.match(r.session.log.at(-1)!.what, /^Rewrites can't include Level 3–4 data/);
});

test("engine: rewrite then re-run passes offline (cheap 12/13 -> 14/14); a second rewrite replaces the first", async () => {
  const s = await danaAtTests();
  const first = (await step(s.id, { type: "run_tests" })).session;
  assert.deepEqual(first.run?.columns.map((c) => `${c.passed}/${c.total}`), ["12/13", "13/13"]);
  await step(s.id, { type: "rewrite_answer", testId: 1, value: "A first try: 3.50 minimum, see an advisor." });
  const twice = (await step(s.id, { type: "rewrite_answer", testId: 1, value: GOOD })).session;
  assert.equal(twice.tests?.length, 14);
  assert.equal(twice.tests?.at(-1)?.reference, GOOD);
  assert.equal(twice.testsStale, true);
  const rerun = (await step(s.id, { type: "run_tests" })).session;
  assert.deepEqual(rerun.run?.columns.map((c) => `${c.passed}/${c.total}`), ["14/14", "14/14"]);
  assert.ok(rerun.draft?.instructions.includes(GOOD), "the rewrite is a worked example in the new draft");
  assert.equal(rerun.testsStale, false);
});

test("engine: accept with a note shows on the blueprint; the frozen blueprint keeps its run summary", async () => {
  const s = await danaAtTests();
  await step(s.id, { type: "run_tests" });
  await step(s.id, { type: "accept_failure", testId: 1, role: "cheap", note: "Students see the GPA on the next screen." });
  const bpr = await step(s.id, { type: "continue" });
  assert.equal(bpr.session.log.at(-1)?.what, `Continued to the blueprint. Tests: ${PINNED}`);
  const t = bpr.blueprint!.tests;
  assert.ok(t.status === "run");
  if (t.status !== "run") return;
  assert.equal(t.failures[0].accepted, "Students see the GPA on the next screen.");
  assert.equal(t.label, "Offline script, not a model run");
  assert.equal(bpr.blueprint!.instructions.source, "offline-script");
  const sub = await step(s.id, { type: "submit" });
  const frozen = getBlueprint(s.id, 1)!;
  assert.ok(frozen.tests.status === "run" && frozen.tests.headline === PINNED && !frozen.tests.stale);
  assert.deepEqual(sub.blueprint?.tests, frozen.tests);
});

test("engine: a submit with stale tests is allowed, frozen stale, and logged with the stale note", async () => {
  const s = await danaAtTests();
  await step(s.id, { type: "run_tests" });
  await step(s.id, { type: "continue" });
  await step(s.id, { type: "edit", key: "never", value: "Promise admission or quote tuition" });
  const sub = await step(s.id, { type: "submit" });
  assert.equal(sub.session.step, "review");
  assert.equal(sub.session.log.at(-1)?.what, "Submitted blueprint v1 for review. Tests out of date: run before v1.");
  const frozen = getBlueprint(s.id, 1)!;
  assert.ok(frozen.tests.status === "run" && frozen.tests.stale);
});

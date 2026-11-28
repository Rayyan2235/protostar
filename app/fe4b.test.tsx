/**
 * FE-4b wiring (plan-2b FE-4b; plan-4 §4 items 2, 3, 6): StatusStrip results for rewrite/accept,
 * focus after each tests action, staleNote wherever a run is stale, the rule line from choiceRules,
 * and TestsScreen in the studio. Summaries come from the real refOf()/summarize() over the fake.
 */
import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { renderToStaticMarkup } from "react-dom/server";
import type { Blueprint, Session, TestsSummary } from "@/lib/types";
import { fakeTestRun, fakeTests } from "@/lib/testRun.fake";
import { refOf, staleNote, summarize } from "@/lib/testSummary";
import { choiceRules } from "@/lib/pushback";
import { BlueprintView, StaleLine } from "@/components/blueprint";
import { SpecPanel, nextFocus, statusFor, focusAfter } from "./studio";

const src = (f: string) => readFileSync(join(__dirname, "..", f), "utf8");
const text = (html: string) => html.replace(/<[^>]+>/g, " ").replace(/&#x27;/g, "'").replace(/\s+/g, " ").trim();
const count = (html: string, needle: string) => html.split(needle).length - 1;
const at = "2026-11-27T09:00:00.000Z";
const tests = fakeTests();
const run = refOf(fakeTestRun(tests, { fail: [{ testId: 1, role: "cheap" }] }), tests);

const session = (more: Partial<Session> = {}): Session => ({
  id: "s1", step: "tests", idea: "Finance helper", slots: [], sources: [], asked: 5, log: [],
  knobs: { studentsPerMonth: 1200, convsPerStudent: 3 }, tests, ...more,
}) as unknown as Session;

const bp = (t: TestsSummary, draft: boolean) => ({ version: 3, draft, builtAt: at, title: "Finance helper", idea: "Finance helper",
  spec: [], data: { maxLevel: 1, allowed: true, sources: [], summary: "All Level 1." },
  scope: { key: "guided", label: "Guided answers", risk: "Medium", desc: "d", model: "Claude Haiku 4.5", knobs: { studentsPerMonth: 1200, convsPerStudent: 3 } },
  knowledge: [], instructions: { text: "t", draftedBy: "template" }, tests: t,
  log: [], costNote: "Estimate. Not a quote." }) as unknown as Blueprint;
const stale = summarize(session({ run, testsStale: true }));

test("StatusStrip: a saved rewrite and an accepted failure each say their line; a refusal says nothing (it stays as an alert)", () => {
  const ok = session({ run, log: [{ at, who: "requester", kind: "tests", what: "Rewrote the answer to test 1: …" }] as never });
  assert.equal(statusFor({ type: "rewrite_answer", testId: 1, value: "x" }, ok), "Saved your rewrite as a test");
  assert.equal(statusFor({ type: "accept_failure", testId: 1, role: "cheap", note: "n" }, ok), "Accepted with a note");
  const refused = session({ run, log: [{ at, who: "tool", kind: "blocked", what: "That answer mentions student records." }] as never });
  assert.equal(statusFor({ type: "accept_failure", testId: 1, role: "cheap", note: "n" }, refused), undefined);
  assert.equal(statusFor({ type: "run_tests" }, ok), undefined, "the WorkingLine says the run's result");
});

test("focus: tests step goes to Run tests before a run, Continue after; a finished run lands on the headline", () => {
  assert.equal(nextFocus(session()), "#tests-run");
  assert.equal(nextFocus(session({ run })), "#tests-continue");
  assert.equal(focusAfter({ type: "run_tests" }, session({ run })), "#tests-headline");
  assert.equal(focusAfter({ type: "run_tests" }, session()), "#tests-run", "a failed run keeps focus on Run tests");
  assert.equal(focusAfter({ type: "accept_failure", testId: 1, role: "cheap", note: "n" }, session({ run })), "#tests-headline");
});

test("staleNote, never retyped: the draft blueprint shows it once, outside the tab panels", () => {
  const html = renderToStaticMarkup(<BlueprintView blueprint={bp(stale, true)} audience="requester" />);
  assert.equal(count(text(html), staleNote(3)), 1);
  assert.ok(html.indexOf(staleNote(3)) < html.indexOf('role="tabpanel"'), "before the panels");
  assert.match(html, new RegExp(`class="[^"]*text-danger[^"]*">${staleNote(3)}`));
});

test("staleNote on the frozen blueprint's Tests section (FoldedSheet) and the reviewer's page above 'Your decision'", () => {
  const html = renderToStaticMarkup(<BlueprintView blueprint={bp(stale, false)} audience="reviewer" />);
  assert.equal(count(text(html), staleNote(3)), 1);
  const r = src("app/review/[id]/reviewer.tsx");
  assert.match(r, /<StaleLine[^>]*\/>[\s\S]*?Your decision|<StaleLine[\s\S]*?<DecisionForm/);
  assert.equal(renderToStaticMarkup(<StaleLine blueprint={bp(summarize(session({ run })), false)} />), "", "not stale: nothing");
  assert.doesNotMatch(src("components/blueprint.tsx") + src("app/tests.tsx"), /Tests out of date: run before/, "imported, never retyped");
});

test("rule line lists every applied data choice in order (choiceRules, BE-12)", () => {
  const pb = { blocking: false, flagged: [], flaggedRules: [], options: [], choice: "route", choices: ["selfreport", "route"], attempts: 1 };
  const html = renderToStaticMarkup(<SpecPanel session={session({ step: "scope", pushback: pb } as never)} busy={false} onEdit={() => {}} />);
  const rules = choiceRules(pb as never).map((r) => r.rule);
  assert.equal(rules.length, 2);
  const t = text(html);
  for (const r of rules) assert.ok(t.includes(r), r);
  assert.ok(t.indexOf(rules[0]) < t.indexOf(rules[1]), "first-chosen first");
});

test("the studio renders TestsScreen, wired to run_tests / rewrite_answer / accept_failure, timed, with arrived", () => {
  const s = src("app/studio.tsx");
  assert.match(s, /<TestsScreen/);
  assert.doesNotMatch(s, /The test run needs live models/);
  assert.match(s, /type: "run_tests"/);
  assert.match(s, /type: "rewrite_answer"/);
  assert.match(s, /type: "accept_failure"/);
  assert.match(s, /arrived=/);
  assert.match(s, /startedAt/);
});

// TESTER-FE nit on 78537aa: after approval the strip still read "Sent v2 to the reviewer".
test("nit: after the reviewer decides, the requester's strip clears; the decision itself stays in the state Notice", async () => {
  const { stripAfterPoll } = await import("./studio");
  const review = (status: string) => ({ reviewId: "r", version: 2, status, submittedAt: at });
  const before = session({ step: "review", review: review("pending") } as never);
  assert.equal(stripAfterPoll(before, session({ step: "done", review: review("approved") } as never)), "");
  assert.equal(stripAfterPoll(before, session({ step: "blueprint", review: review("changes") } as never)), "");
  assert.equal(stripAfterPoll(before, before), undefined, "still waiting: leave the strip alone");
  assert.match(src("app/studio.tsx"), /const cleared = stripAfterPoll\(/);
});

/**
 * FE-4a (plan-2b): the blueprint's tests section reads the TestsSummary union. Summaries come from
 * the real summarize()/refOf() over fakeTestRun variants (no hand-made summaries; handoff "Work
 * that depends on another branch").
 */
import { test } from "node:test";
import assert from "node:assert/strict";
import { renderToStaticMarkup } from "react-dom/server";
import type { Acceptance, Blueprint, Session, TestsSummary } from "@/lib/types";
import { fakeTestRun, fakeTests } from "@/lib/testRun.fake";
import { OFFLINE_LABEL, refOf, summarize } from "@/lib/testSummary";
import { BlueprintView, testsTabName } from "./blueprint";

const plain = (html: string) => html.replace(/<[^>]+>/g, " ").replace(/&#x27;/g, "'").replace(/\s+/g, " ").trim();
const count = (html: string, needle: string) => html.split(needle).length - 1;
const at = "2026-11-12T09:00:00.000Z";
const tests = fakeTests();

/** A TestsSummary from the real functions. */
function summary(opts: Parameters<typeof fakeTestRun>[1] = {}, more: { accepted?: Acceptance[]; stale?: boolean } = {}): TestsSummary {
  const run = refOf(fakeTestRun(tests, opts), tests);
  return summarize({ run, accepted: more.accepted, testsStale: more.stale } as unknown as Session);
}

const bp = (t: TestsSummary, draft = false) => ({ version: 2, draft, builtAt: at, title: "Finance helper", idea: "Finance helper",
  spec: [], data: { maxLevel: 1, allowed: true, sources: [], summary: "All Level 1." },
  scope: { key: "guided", label: "Guided answers", risk: "Medium", desc: "d", model: "Claude Haiku 4.5", knobs: { studentsPerMonth: 1200, convsPerStudent: 3 } },
  knowledge: [], instructions: { text: "t", draftedBy: "template" }, tests: t,
  log: [], costNote: "Estimate. Not a quote." }) as unknown as Blueprint;

const sheet = (t: TestsSummary) => renderToStaticMarkup(<BlueprintView blueprint={bp(t)} audience="reviewer" />);
const partial = () => summary({ fail: [{ testId: 1, role: "cheap" }, { testId: 6, role: "capable" }] });

test("not run: the Tests fact and the section say so; no source Tag", () => {
  const t = summary();
  assert.equal(t.status, "run", "sanity: a fake run is a run");
  const html = sheet({ status: "not-run", note: "Not run yet." });
  assert.match(plain(html), /Tests Not run yet/);
  assert.doesNotMatch(html, new RegExp(OFFLINE_LABEL));
});

test("run: the Tests fact is the headline; the section leads with it and shows the source Tag", () => {
  const t = partial();
  if (t.status !== "run") throw new Error("run");
  const html = sheet(t);
  assert.ok(count(plain(html), t.headline) >= 2, "SpecSheet fact + section lead");
  assert.match(html, /Offline script, not a model run/);
});

test("run with failures: one hairline row per failure, named T-01 style, with role, source and reason", () => {
  const t = partial();
  if (t.status !== "run") throw new Error("run");
  const html = sheet(t);
  const rows = html.match(/<li[^>]*data-failure[^>]*>/g) ?? [];
  assert.equal(rows.length, 2);
  assert.match(rows[0], /border-hairline/);
  assert.match(plain(html), /T-01 .*Cheap.*Doesn't state the 3\.50 minimum/);
  assert.match(plain(html), /T-06 .*Capable/);
});

test("accepted failures show the requester's note in words", () => {
  const t = summary({ fail: [{ testId: 1, role: "cheap" }] }, { accepted: [{ runId: "fake-run", testId: 1, role: "cheap", note: "Bulletin link covers it.", at }] });
  const html = sheet(t);
  assert.match(plain(html), /Accepted: Bulletin link covers it\./);
});

test("all pass: the headline, no failure rows", () => {
  const html = sheet(summary());
  assert.match(plain(html), /Capable passed all 13\. Cheap passed all 13\./);
  assert.equal(count(html, "data-failure"), 0);
});

test("stale: the section says the results are out of date", () => {
  const html = sheet(summary({}, { stale: true }));
  assert.match(plain(html), /out of date/i);
});

test("Tests tab name carries the run state; stale wins (plan-4 §4 item 3)", () => {
  assert.equal(testsTabName(bp({ status: "not-run", note: "Not run yet." }, true)), "Tests · not run");
  assert.equal(testsTabName(bp(partial(), true)), "Tests · 2 failed");
  assert.equal(testsTabName(bp(summary(), true)), "Tests · all passed");
  assert.equal(testsTabName(bp(summary({ fail: [{ testId: 2, role: "cheap" }] }, { stale: true }), true)), "Tests · out of date");
});

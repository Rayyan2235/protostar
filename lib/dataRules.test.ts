import { test } from "node:test";
import assert from "node:assert/strict";
import { classifySource, editFlags, gate, scanText } from "./dataRules";
import type { Pushback, SlotKey } from "./types";

test("degree audits are Level 3 by rule, whatever the model suggests", () => {
  const s = classifySource({ name: "Students paste their degree audit", suggestedLevel: 1, reason: "looks fine" });
  assert.equal(s.level, 3);
  assert.equal(s.decidedBy, "rule");
  assert.equal(s.ruleId, "degree-audit");
});

test("known public and internal sources are classified by rule", () => {
  assert.equal(classifySource({ name: "Penn State Undergraduate Bulletin" }).level, 1);
  assert.equal(classifySource({ name: "Dana's advising FAQ doc on SharePoint" }).level, 2);
  assert.equal(classifySource({ name: "x", url: "https://smeal.psu.edu/advising" }).level, 1);
  assert.equal(classifySource({ name: "Student SSN on file" }).level, 4);
});

test("unrecognised sources use the model's level and say so", () => {
  const s = classifySource({ name: "Career fair schedule", suggestedLevel: 1, reason: "published event list" });
  assert.equal(s.decidedBy, "model");
  assert.equal(s.level, 1);
});

test("unrecognised with no model opinion defaults to Level 2", () => {
  assert.equal(classifySource({ name: "Mystery spreadsheet thing" }).level, 2);
});

test("free-text scan catches record mentions the model might miss", () => {
  const hits = scanText("Same, plus students paste their degree audit so it can check exactly.");
  assert.deepEqual(hits.map((h) => h.ruleId), ["degree-audit"]);
});

test("free-text scan ignores topics and negated mentions", () => {
  assert.deepEqual(scanText("Appeals, medical or special circumstances go to me."), []);
  assert.deepEqual(scanText("It must never ask for a transcript or their student ID."), []);
  assert.deepEqual(scanText("Don't read degree audits."), []);
});

test("gate collapses the model's source and the text hit for the same rule", () => {
  const out = gate("students paste their degree audit", [{ name: "Pasted degree audits", suggestedLevel: 3 }]);
  assert.equal(out.filter((s) => s.level >= 3).length, 1);
  assert.equal(out[0].name, "Pasted degree audits");
});

test("a resolved rule does not re-flag", () => {
  const pb: Pushback = { blocking: false, flagged: ["Degree audits"], flaggedRules: ["degree-audit"], options: ["selfreport", "route"], choice: "route", attempts: 0 };
  assert.deepEqual(gate("they could paste the degree audit", [], pb), []);
});

test("a still-blocking pushback does not suppress anything", () => {
  const pb: Pushback = { blocking: true, flagged: ["Degree audits"], flaggedRules: ["degree-audit"], options: ["selfreport", "route"], attempts: 1 };
  assert.equal(gate("their degree audit", [], pb).length, 1);
});

// --- Edit gate (contract §6, Planner B B1) ---------------------------------------------

const resolvedAudit: Pushback = {
  blocking: false, flagged: ["Students paste their degree audit"], flaggedRules: ["degree-audit"],
  options: ["selfreport", "route"], choice: "selfreport", attempts: 0,
};

test("editFlags: a sources edit can't re-add a resolved record source", () => {
  const hits = editFlags("sources", "students paste their degree audit", resolvedAudit);
  assert.equal(hits.length, 1);
  assert.equal(hits[0].level, 3);
  assert.equal(hits[0].ruleId, "degree-audit");
  assert.equal(hits[0].decidedBy, "rule");
});

test("editFlags: a hand-off topic about a resolved rule passes", () => {
  assert.deepEqual(editFlags("handoff", "anything about their degree audit", resolvedAudit), []);
});

test("editFlags: the same hand-off text flags when nothing is resolved", () => {
  const hits = editFlags("handoff", "anything about their degree audit");
  assert.deepEqual(hits.map((h) => [h.ruleId, h.level]), [["degree-audit", 3]]);
});

test("editFlags: negated and Level 1–2 mentions pass", () => {
  assert.deepEqual(editFlags("sources", "never read transcripts"), []);
  assert.deepEqual(editFlags("sources", "the bulletin and our SharePoint FAQ"), []);
});

// --- Negation stays in its clause (BE-4 amendment 3) -------------------------------------

const ruleIds = (hits: { ruleId?: string }[]) => hits.map((h) => h.ruleId);

test("a negation in an earlier clause doesn't hide a record source", () => {
  assert.deepEqual(ruleIds(scanText("No problem, students paste their degree audit")), ["degree-audit"]);
  assert.deepEqual(ruleIds(scanText("We do not store it, but advisors read the degree audit")), ["degree-audit"]);
  assert.deepEqual(ruleIds(scanText("Not sure yet: students upload transcripts")), ["transcript"]);
  assert.deepEqual(ruleIds(scanText("No grades, transcripts get pasted in")), ["transcript"]);
  assert.deepEqual(ruleIds(scanText("Not names, degree audits only")), ["degree-audit"]);
});

test("a negation in the same clause still hides the term", () => {
  assert.deepEqual(scanText("never read transcripts"), []);
  assert.deepEqual(scanText("don't use transcripts or degree audits"), []);
});

test("as a sources answer, a comma starts a new clause: fails closed", () => {
  const text = "Never ask for transcripts, degree audits or student IDs";
  assert.deepEqual(ruleIds(scanText(text, "sources")), ["degree-audit", "student-id"]);
  assert.deepEqual(ruleIds(editFlags("sources", text)), ["degree-audit", "student-id"]);
});

test("as a never answer, commas don't split the clause", () => {
  assert.deepEqual(editFlags("never", "Never ask for transcripts, degree audits or student IDs"), []);
  assert.deepEqual(editFlags("never", "It must never ask for, look up, or read transcripts"), []);
  assert.deepEqual(editFlags("never", "Never read transcripts, degree audits"), []);
});

test("as a never answer, ; and : and but still split the clause", () => {
  const text = "It must never give admission advice; students will paste their degree audit";
  assert.deepEqual(ruleIds(scanText(text, "never")), ["degree-audit"]);
  assert.deepEqual(ruleIds(editFlags("never", text)), ["degree-audit"]);
});

test("gate passes the slot to the text scan", () => {
  const text = "Never ask for transcripts, degree audits or student IDs";
  assert.deepEqual(gate(text, [], undefined, "never"), []);
  assert.deepEqual(ruleIds(gate(text, [], undefined, "sources")), ["degree-audit", "student-id"]);
});

// --- More clause boundaries, every slot (BE-4b, TESTER-BE GAP 16:37) ------------------------

test("line breaks, tabs, dashes, brackets and a spaced slash end a clause (12 repros)", () => {
  const cases: [SlotKey, string, string][] = [
    ["sources", "No API\nstudents paste their degree audit", "degree-audit"],
    ["sources", "Not sure\n- transcripts", "transcript"],
    ["sources", "- no grades\n- degree audits", "degree-audit"],
    ["sources", "No grades\r\ntranscripts", "transcript"],
    ["handoff", "No problem\nstudents paste their degree audit", "degree-audit"],
    ["never", "Never promise admission\nStudents paste their degree audit", "degree-audit"],
    ["sources", "No problem — students paste their degree audit", "degree-audit"],
    ["sources", "No API – students paste their degree audit", "degree-audit"],
    ["sources", "No API - students paste their degree audit", "degree-audit"],
    ["sources", "No API (students paste their degree audit)", "degree-audit"],
    ["sources", "No API / students paste their degree audit", "degree-audit"],
    ["sources", "No API\tstudents paste their degree audit", "degree-audit"],
  ];
  for (const [key, text, rule] of cases) assert.deepEqual(ruleIds(editFlags(key, text)), [rule], `${key}: ${JSON.stringify(text)}`);
});

test("pinned fail-closed hits in the never slot (parked false positives)", () => {
  assert.deepEqual(ruleIds(editFlags("never", "Never ask for:\n- transcripts\n- degree audits")), ["degree-audit", "transcript"]);
  assert.deepEqual(ruleIds(editFlags("never", "Never ask for transcripts (or degree audits)")), ["degree-audit"]);
});

test("unspaced hyphens and slashes are not boundaries; real negations still hide the term", () => {
  assert.deepEqual(editFlags("sources", "never read transcripts"), []);
  assert.deepEqual(editFlags("sources", "don't use transcripts or degree audits"), []);
  assert.deepEqual(editFlags("sources", "never read transcripts and/or degree audits"), []);
  assert.deepEqual(editFlags("sources", "students self-report GPA, never transcripts"), []);
  assert.deepEqual(editFlags("never", "Never ask for transcripts, degree audits or student IDs"), []);
  assert.deepEqual(editFlags("never", "It must never ask for, look up, or read transcripts"), []);
});

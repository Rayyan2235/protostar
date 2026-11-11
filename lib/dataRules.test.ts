import { test } from "node:test";
import assert from "node:assert/strict";
import { classifySource, gate, scanText } from "./dataRules";
import type { Pushback } from "./types";

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

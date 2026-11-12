import { test } from "node:test";
import assert from "node:assert/strict";
import { classifySource, editFlags, gate, normalise, RULES, scanText } from "./dataRules";
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
  // BE-4c: "or" ends the negation outside the never slot (pinned fail-closed hit); in never it stays hidden.
  assert.deepEqual(ruleIds(scanText("It must never ask for a transcript or their student ID.")), ["student-id"]);
  assert.deepEqual(editFlags("never", "It must never ask for a transcript or their student ID."), []);
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
  // BE-4c: "or" now ends the negation outside the never slot (pinned fail-closed hit).
  assert.deepEqual(ruleIds(scanText("don't use transcripts or degree audits")), ["degree-audit"]);
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
  // BE-4c: "or" now ends the negation outside the never slot (pinned fail-closed hit).
  assert.deepEqual(ruleIds(editFlags("sources", "don't use transcripts or degree audits")), ["degree-audit"]);
  assert.deepEqual(ruleIds(editFlags("sources", "never read transcripts and/or degree audits")), ["degree-audit"]);
  assert.deepEqual(editFlags("sources", "students self-report GPA, never transcripts"), []);
  assert.deepEqual(editFlags("never", "Never ask for transcripts, degree audits or student IDs"), []);
  assert.deepEqual(editFlags("never", "It must never ask for, look up, or read transcripts"), []);
});

// --- Negation allow list (BE-4c, contract §6) --------------------------------------------

/** TESTER-BE's separator table (be4b-attack.mts): none of these may carry a negation across. */
const SEPARATORS = [
  " -- ", "- ", " -", "… ", " \u2022 ", " | ", " [", " {", " \u2192 ", " -> ", " > ", "\u00a0-\u00a0",
  " \u2012 ", " \u2015 ", " \u2212 ", " \u2010 ", "\u2028", "\u2029", "\v", "\f",
  " and ", " or ", " nor ", " but ", " so ", " then ", " however ", " though ", " instead ", " yet ", " except ",
  " /", " // ", "\u037e ", "\uff1b ", "\uff1a ", "\u3002 ",
];
/** and/or/nor keep a never answer's negation ("never read transcripts and degree audits"). */
const NEVER_KEEPS = new Set([" and ", " or ", " nor "]);

test("a negation reaches a term only across letters, digits, spaces and apostrophes (37 separators x 3 slots)", () => {
  assert.equal(SEPARATORS.length, 37);
  const wrong: string[] = [];
  for (const slot of ["sources", "never", "handoff"] as SlotKey[]) {
    for (const sep of SEPARATORS) {
      const hit = editFlags(slot, `No API${sep}students paste their degree audit`).length > 0;
      const want = !(slot === "never" && NEVER_KEEPS.has(sep));
      if (hit !== want) wrong.push(`${slot} ${JSON.stringify(sep)}: want ${want ? "hit" : "none"}`);
    }
  }
  assert.deepEqual(wrong, []);
});

test("real negations still hide the term, in sources and in never", () => {
  const texts = [
    "never read transcripts",
    "students self-report GPA, never transcripts",
    "Never use degree-audit data",
    "Don't read the student's transcript (official or unofficial)",
    "No transcripts - ever",
    "Never read the student’s transcript",
  ];
  for (const slot of ["sources", "never"] as SlotKey[]) {
    for (const t of texts) assert.deepEqual(editFlags(slot, t), [], `${slot}: ${JSON.stringify(t)}`);
  }
});

test("and, or, nor and commas keep a negation only in the never slot", () => {
  for (const t of [
    "never read transcripts and degree audits",
    "never read transcripts and/or degree audits",
    "Never ask for transcripts, degree audits or student IDs",
  ]) {
    assert.deepEqual(editFlags("never", t), [], JSON.stringify(t));
  }
});

test("pinned fail-closed hits (deliberate)", () => {
  assert.deepEqual(ruleIds(editFlags("sources", "don't use transcripts or degree audits")), ["degree-audit"]);
  assert.deepEqual(ruleIds(scanText("don't use transcripts or degree audits")), ["degree-audit"]);
  for (const slot of ["sources", "never"] as SlotKey[]) {
    assert.deepEqual(ruleIds(editFlags(slot, "Never: transcripts")), ["transcript"], `${slot}: colon`);
    assert.deepEqual(ruleIds(editFlags(slot, "never\ttranscripts")), ["transcript"], `${slot}: tab`);
  }
});

// --- Normalisation (BE-4d, contract §6) ---------------------------------------------------

/** Every multi-word Level 3-4 term and the rule it must trigger. */
const MULTI_WORD_TERMS: [string, string][] = [
  ["degree audit", "degree-audit"], ["what if report", "degree-audit"], ["academic requirements report", "degree-audit"],
  ["advising transcript", "transcript"], ["grade report", "grades"], ["their grades", "grades"],
  ["student id", "student-id"], ["psu id", "student-id"], ["id number", "student-id"], ["access account id", "student-id"],
  ["lionpath records", "records-system"], ["starfish notes", "records-system"], ["advising notes", "records-system"],
  ["student records", "records-system"], ["social security number", "ssn"], ["medical records", "health"],
  ["health history", "health"], ["financial aid account", "finaid"], ["bank account", "finaid"],
];
/** How a requester (or a paste) might write the space inside a term. */
const TERM_VARIANTS: [string, (term: string) => string][] = [
  ["hyphen", (t) => t.replace(/ /g, "-")],
  ["double space", (t) => t.replace(/ /g, "  ")],
  ["line break", (t) => t.replace(/ /g, "\n")],
  ["NBSP", (t) => t.replace(/ /g, "\u00a0")],
  ["U+2011", (t) => t.replace(/ /g, "\u2011")],
  ["U+200B", (t) => t.replace(/ /g, "\u200b")],
  ["en dash", (t) => t.replace(/ /g, "–")],
  ["em dash", (t) => t.replace(/ /g, "—")],
  ["minus sign", (t) => t.replace(/ /g, "\u2212")],
  ["upper case", (t) => t.toUpperCase()],
];

test("every multi-word record term is caught however the space is written", () => {
  const missed: string[] = [];
  for (const [term, rule] of MULTI_WORD_TERMS) {
    for (const [name, variant] of TERM_VARIANTS) {
      const text = `students paste their ${variant(term)}`;
      if (!ruleIds(editFlags("sources", text)).includes(rule)) missed.push(`${name}: ${JSON.stringify(text)}`);
    }
  }
  assert.deepEqual(missed, []);
});

test("obfuscated terms from TESTER-BE's be4c-attack table hit", () => {
  for (const text of [
    "students paste their degree\u200baudit",
    "students paste their degree\u00a0audit",
    "students paste their degree-audit",
    "students paste their degree\u2011audit",
    "students paste their DEGREE AUDIT",
    "students paste their degree  audit",
    "students paste their degree\naudit",
    "No API--students paste their degree audit",
    "No \"API\" students paste their degree audit",
    "Don’t worry, students paste their degree audit",
    "never read transcripts but degree audits are pasted",
  ]) {
    assert.ok(editFlags("sources", text).length > 0, JSON.stringify(text));
  }
  for (const text of ["Never promise admission, so students paste their degree audit", "Never promise admission. Students paste their degree audit"]) {
    assert.ok(editFlags("never", text).length > 0, JSON.stringify(text));
  }
});

test("model-named sources go through the same normalisation", () => {
  assert.equal(classifySource({ name: "Pasted DEGREE\u00a0AUDIT" }).ruleId, "degree-audit");
  assert.equal(classifySource({ name: "student\u2011id lookup" }).ruleId, "student-id");
});

test("no rule pattern contains a literal space", () => {
  assert.deepEqual(RULES.filter((r) => r.pattern.source.includes(" ")).map((r) => r.id), []);
});

test("normalise: compatibility forms, spaces and zero-width characters; line breaks stay", () => {
  assert.equal(normalise("\uff24\uff25\uff27\uff32\uff25\uff25"), "DEGREE");
  assert.equal(normalise("degree\u00a0audit"), "degree audit");
  assert.equal(normalise("degree\u200baudit"), "degreeaudit");
  assert.equal(normalise("a\u200c\u200d\u2060\ufeffb"), "ab");
  assert.equal(normalise("line\nbreak\u2028sep\r\ntab\t"), "line\nbreak\u2028sep\r\ntab\t");
});

test("a negation still hides a normalised term", () => {
  assert.deepEqual(editFlags("sources", "never read degree-audit data"), []);
  assert.deepEqual(editFlags("sources", "never read degree\u00a0audits"), []);
  assert.deepEqual(editFlags("never", "Never ask for degree-audits, transcripts or student\u00a0IDs"), []);
});

test("normalise strips every format character: soft hyphens and bidi controls too", () => {
  assert.equal(normalise("de\u00adgree\u202e audit\u202c"), "degree audit");
  assert.deepEqual(ruleIds(editFlags("sources", "students paste their degree\u00adaudit")), ["degree-audit"]);
  assert.deepEqual(ruleIds(editFlags("sources", "students paste their de\u00adgree audit")), ["degree-audit"]);
});

test("known no-hits, pinned (ADR 0011): a hyphen or slash between letters joins a word", () => {
  // The same rule lets "self-report" and "and/or" through; documented trade-off, no fix planned.
  assert.deepEqual(editFlags("sources", "No API-students paste their degree audit"), []);
  assert.deepEqual(editFlags("sources", "No API/students paste their degree audit"), []);
});

test("normalise runs before the negation check (pinned)", () => {
  // Zero-width space removed: the gap reads like a plain space, the parked run-on case (ADR 0011).
  assert.deepEqual(editFlags("sources", "No API\u200b students paste their degree audit"), []);
  // "never\u200bread" becomes "neverread": no negation word, so it hits (fails closed).
  assert.deepEqual(ruleIds(editFlags("sources", "never\u200bread transcripts")), ["transcript"]);
});

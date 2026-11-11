import { test } from "node:test";
import assert from "node:assert/strict";
import { CHECKS, facts, runChecks, type CheckId } from "./checks";
import { loadKnowledge } from "./knowledge";
import { SCENARIO, type Scenario } from "./scenario";

const knowledge = loadKnowledge().map((p) => p.text).join("\n\n");
const run = (id: CheckId, answer: string, prompt?: string) => CHECKS[id].run(answer, { knowledge, prompt }).pass;

test("facts are read from the real snapshots", () => {
  const f = facts(knowledge);
  assert.deepEqual(f, { gpaMinimum: 3.5, notAccepting: true });
});

/** A second scenario proves the facts come from config, not from Finance-specific code. */
const accounting: Scenario = {
  ...SCENARIO,
  id: "test-accounting",
  checks: {
    program: "Accounting",
    gpaMinimum: { pattern: /Accounting requires a minimum GPA of (\d\.\d{2})/i, source: "the test page" },
    notAccepting: { patterns: [/Accounting \(ACCTG\)/i, /closed to new students/i], source: "The test page" },
    handoff: /\bcounselor\b/i,
  },
};
const accountingPage = "Accounting requires a minimum GPA of 3.20 for entrance into the major.";

test("facts come from the scenario passed in", () => {
  assert.deepEqual(facts(accountingPage, accounting), { gpaMinimum: 3.2, notAccepting: false });
  assert.deepEqual(facts(`${accountingPage} Accounting (ACCTG) is closed to new students.`, accounting), { gpaMinimum: 3.2, notAccepting: true });
  assert.deepEqual(facts(accountingPage), { gpaMinimum: undefined, notAccepting: false }, "default scenario is Finance");
});

test("checks read program, sources and hand-off pattern from the scenario in the context", () => {
  const ctx = { knowledge: `${accountingPage} Accounting (ACCTG) is closed to new students.`, scenario: accounting };
  const said = CHECKS["states-gpa-minimum"].run("You need at least a 3.20.", ctx);
  assert.equal(said.pass, true);
  const missed = CHECKS["states-gpa-minimum"].run("You need a strong GPA.", ctx);
  assert.deepEqual(missed, { pass: false, reason: "Doesn't state the 3.20 minimum from the test page." });
  const wrong = CHECKS["gpa-matches-source"].run("The minimum GPA is 3.50.", ctx);
  assert.deepEqual(wrong, { pass: false, reason: "States minimum GPA 3.5; the test page says 3.20." });
  const closed = CHECKS["says-not-accepting"].run("Here are the requirements.", ctx);
  assert.deepEqual(closed, { pass: false, reason: "The test page says Accounting is NOT accepting new applicants; the answer doesn't say so." });
  assert.equal(CHECKS["hands-off"].run("Talk to a counselor.", ctx).pass, true);
  assert.equal(CHECKS["hands-off"].run("Book an appointment with your advisor.", ctx).pass, false);
});

test("Finance reasons keep their text", () => {
  assert.equal(CHECKS["states-gpa-minimum"].run("You need a strong GPA.", { knowledge }).reason,
    "Doesn't state the 3.50 minimum from the bulletin.");
  assert.equal(CHECKS["says-not-accepting"].run("Here are the Finance requirements.", { knowledge }).reason,
    "The Smeal page says Finance is NOT accepting new applicants; the answer doesn't say so.");
  assert.equal(CHECKS["says-not-accepting"].label, "Says Finance isn't taking new applicants");
});

test("admission promise: fails promises, passes refusals (acceptance check)", () => {
  assert.equal(run("no-admission-promise", "Yes, you qualify!"), false);
  assert.equal(run("no-admission-promise", "With a 3.6 you'll definitely get in."), false);
  assert.equal(run("no-admission-promise", "I guarantee a spot."), false);
  assert.equal(run("no-admission-promise", "I can't guarantee admission. Here is the published minimum."), true);
  assert.equal(run("no-admission-promise", "No one can promise you'll get in; an advisor decides."), true);
  assert.equal(run("no-admission-promise", "You meet the published minimum, but entry is not guaranteed."), true);
});

test("record requests: fails asking, passes telling them not to share", () => {
  assert.equal(run("no-record-request", "Please paste your degree audit and I'll check."), false);
  assert.equal(run("no-record-request", "What's your student ID?"), false);
  assert.equal(run("no-record-request", "Please don't share your student ID or transcript here."), true);
  assert.equal(run("no-record-request", "Tell me your GPA and completed credits."), true, "self-reported numbers are fine");
});

test("numbers must come from the source or the student's own message", () => {
  assert.equal(run("numbers-grounded", "You need a 3.50 GPA and 36.0 to 59.0 graded credits."), true);
  assert.equal(run("numbers-grounded", "You need a 3.5 GPA."), true, "3.5 equals 3.50");
  assert.equal(run("numbers-grounded", "You need a 3.70 GPA."), false);
  assert.equal(run("numbers-grounded", "With your 2.9 you are below the minimum.", "I have a 2.9 GPA and 40 credits"), true);
  assert.equal(run("numbers-grounded", "You need 45 credits."), false);
});

test("GPA minimum must match the bulletin (acceptance check)", () => {
  assert.equal(run("gpa-matches-source", "The minimum GPA for Finance is 3.50."), true);
  assert.equal(run("gpa-matches-source", "The minimum GPA for Finance is 3.30."), false);
  assert.equal(run("gpa-matches-source", "You said your GPA is 3.2, below the 3.50 minimum.", "my GPA is 3.2"), true);
});

test("must-include checks", () => {
  assert.equal(run("states-gpa-minimum", "You need at least a 3.50."), true);
  assert.equal(run("states-gpa-minimum", "You need a strong GPA."), false);
  assert.equal(run("says-not-accepting", "Note: Finance is not accepting new applicants right now."), true);
  assert.equal(run("says-not-accepting", "Here are the Finance requirements."), false);
  assert.equal(run("hands-off", "Please book an appointment with your advisor."), true);
  assert.equal(run("hands-off", "Good luck!"), false);
});

test("runChecks passes only when every check passes, with a reason each", () => {
  const ok = runChecks(["no-admission-promise", "states-gpa-minimum", "says-not-accepting"],
    "The bulletin minimum is 3.50, but Finance is not accepting new applicants right now. I can't promise anything; talk to your advisor.", { knowledge });
  assert.equal(ok.pass, true);
  const bad = runChecks(["no-admission-promise", "states-gpa-minimum"], "Yes, you qualify!", { knowledge });
  assert.equal(bad.pass, false);
  assert.ok(bad.results.every((r) => r.reason.length > 0));
});

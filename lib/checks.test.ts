import { test } from "node:test";
import assert from "node:assert/strict";
import { CHECKS, facts, runChecks, type CheckId } from "./checks";
import { loadKnowledge } from "./knowledge";

const knowledge = loadKnowledge().map((p) => p.text).join("\n\n");
const run = (id: CheckId, answer: string, prompt?: string) => CHECKS[id].run(answer, { knowledge, prompt }).pass;

test("facts are read from the real snapshots", () => {
  const f = facts(knowledge);
  assert.equal(f.financeGpa, 3.5);
  assert.equal(f.financeClosed, true);
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
  assert.equal(run("gpa-matches-snapshot", "The minimum GPA for Finance is 3.50."), true);
  assert.equal(run("gpa-matches-snapshot", "The minimum GPA for Finance is 3.30."), false);
  assert.equal(run("gpa-matches-snapshot", "You said your GPA is 3.2, below the 3.50 minimum.", "my GPA is 3.2"), true);
});

test("must-include checks", () => {
  assert.equal(run("states-finance-gpa", "You need at least a 3.50."), true);
  assert.equal(run("states-finance-gpa", "You need a strong GPA."), false);
  assert.equal(run("says-finance-closed", "Note: Finance is not accepting new applicants right now."), true);
  assert.equal(run("says-finance-closed", "Here are the Finance requirements."), false);
  assert.equal(run("hands-off-to-advisor", "Please book an appointment with your advisor."), true);
  assert.equal(run("hands-off-to-advisor", "Good luck!"), false);
});

test("runChecks passes only when every check passes, with a reason each", () => {
  const ok = runChecks(["no-admission-promise", "states-finance-gpa", "says-finance-closed"],
    "The bulletin minimum is 3.50, but Finance is not accepting new applicants right now. I can't promise anything; talk to your advisor.", { knowledge });
  assert.equal(ok.pass, true);
  const bad = runChecks(["no-admission-promise", "states-finance-gpa"], "Yes, you qualify!", { knowledge });
  assert.equal(bad.pass, false);
  assert.ok(bad.results.every((r) => r.reason.length > 0));
});

/** Engine tests run the offline interviewer against an in-memory database. */
import { test, beforeEach } from "node:test";
import assert from "node:assert/strict";
import { act, startSession } from "./engine";
import { resetDbForTests } from "./store";
import type { Session } from "./types";

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

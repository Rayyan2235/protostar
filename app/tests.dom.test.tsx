/**
 * FE-6 test 4b (focus): opening a failure's "Accept with a note" moves focus into its field;
 * closing it with Esc puts focus back on its trigger. Red on a scratch revert of MorphNote's
 * focus return.
 */
import { act, render, screen, fireEvent } from "@/components/test/dom";
import { test } from "node:test";
import assert from "node:assert/strict";
import type { Session } from "@/lib/types";
import { fakeTestRun, fakeTests } from "@/lib/testRun.fake";
import { refOf } from "@/lib/testSummary";
import { TestsScreen } from "./tests";

const tests = fakeTests();
const session = {
  id: "s1", step: "tests", idea: "x", slots: [], sources: [], asked: 5, log: [], tests,
  knobs: { studentsPerMonth: 1200, convsPerStudent: 3 },
  run: refOf(fakeTestRun(tests, { fail: [{ testId: 1, role: "cheap" }] }), tests),
} as unknown as Session;
const noop = () => {};

test("Accept with a note: opening focuses the field; Esc closes it and focus returns to the trigger", async () => {
  render(<TestsScreen session={session} busy={false} onRun={noop} onRewrite={noop} onAccept={noop} onChangeModel={noop} onContinue={noop} />);
  const trigger = screen.getByRole("button", { name: "Accept with a note" });
  await act(async () => { trigger.click(); });
  const field = document.getElementById("accept-1-cheap");
  assert.ok(field, "the note opened");
  assert.equal(document.activeElement, field, "focus moved into the field");

  await act(async () => { fireEvent.keyDown(field, { key: "Escape" }); });
  assert.equal(document.getElementById("accept-1-cheap"), null, "the note closed");
  assert.equal(document.activeElement?.id, "accept-1-cheap-btn", "focus is back on the trigger");
});

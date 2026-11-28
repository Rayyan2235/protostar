/**
 * FE-6 on the requester page, with fetch stubbed:
 * - test 4a (focus): after run_tests resolves, focus is on the tests headline. Red on a scratch
 *   revert of focusAfter's run_tests branch.
 * - test 6 (candidate, TESTER-FE 20:11, not reproduced 0 of 2): an initial session GET that resolves
 *   after a later edit must not put the older session back on screen. A second initial GET is
 *   made here the way React StrictMode does it (the load effect runs twice).
 */
import { act, render, screen, waitFor, fireEvent } from "@/components/test/dom";
import { test, afterEach } from "node:test";
import assert from "node:assert/strict";
import { StrictMode } from "react";
import type { Session } from "@/lib/types";
import { fakeTestRun, fakeTests } from "@/lib/testRun.fake";
import { refOf } from "@/lib/testSummary";
import Studio from "./studio";

const tests = fakeTests();
const base = { id: "s1", idea: "Finance helper", sources: [], asked: 5, log: [], knobs: { studentsPerMonth: 1200, convsPerStudent: 3 } };
const session = (more: Partial<Session>): Session => ({ ...base, slots: [], ...more }) as unknown as Session;

type Reply = { session?: Session; mode?: string; error?: string };
type Call = { url: string; body?: { type: string }; resolve: (r: Reply) => void };
const realFetch = globalThis.fetch;
/** Every fetch waits until the test resolves it. */
function holdFetch() {
  const calls: Call[] = [];
  globalThis.fetch = ((url: string, init?: { body?: string }) => new Promise((done) => {
    calls.push({
      url, body: init?.body ? JSON.parse(init.body) : undefined,
      resolve: (r) => done({ ok: true, status: 200, json: async () => r } as Response),
    });
  })) as typeof fetch;
  return calls;
}
afterEach(() => { globalThis.fetch = realFetch; });

test("focus: after run_tests resolves, focus lands on the tests headline", async () => {
  const calls = holdFetch();
  render(<Studio initialId="s1" />);
  await waitFor(() => assert.equal(calls.length, 1));
  await act(async () => calls[0].resolve({ mode: "offline", session: session({ step: "tests", tests }) }));
  const run = await screen.findByRole("button", { name: "Run tests" });
  await act(async () => { run.click(); });
  const post = calls.find((c) => c.body?.type === "run_tests");
  assert.ok(post, "run_tests was sent");
  await act(async () => post.resolve({ mode: "offline", session: session({ step: "tests", tests, run: refOf(fakeTestRun(tests), tests) }) }));
  await waitFor(() => assert.equal(document.activeElement?.id, "tests-headline"));
});

test("candidate race: a late initial GET doesn't overwrite a newer edit on screen", async () => {
  const calls = holdFetch();
  const before = session({ step: "blueprint", slots: [{ key: "users", value: "Sophomores", filledBy: "requester" }] } as never);
  const after = session({ step: "blueprint", slots: [{ key: "users", value: "Juniors", filledBy: "requester" }] } as never);
  render(<StrictMode><Studio initialId="s1" /></StrictMode>);
  await waitFor(() => assert.ok(calls.filter((c) => !c.body).length >= 2, "two initial GETs (StrictMode)"));
  const [first, late] = calls.filter((c) => !c.body);
  await act(async () => first.resolve({ mode: "offline", session: before }));

  await waitFor(() => assert.ok(document.getElementById("edit-users-btn"), "the users slot's Edit button"));
  await act(async () => { document.getElementById("edit-users-btn")!.click(); });
  const field = document.getElementById("edit-users") as HTMLTextAreaElement;
  assert.ok(field, "the edit field opened");
  await act(async () => { fireEvent.change(field, { target: { value: "Juniors" } }); });
  await act(async () => { screen.getByRole("button", { name: "Save" }).click(); });
  const post = calls.find((c) => c.body?.type === "edit");
  assert.ok(post, "the edit was sent");
  await act(async () => post.resolve({ mode: "offline", session: after }));
  await waitFor(() => assert.ok(screen.queryAllByText("Juniors").length > 0));

  await act(async () => late.resolve({ mode: "offline", session: before }));
  assert.ok(screen.queryAllByText("Juniors").length > 0, "the edit survives the late GET");
  assert.equal(screen.queryAllByText("Sophomores").length, 0, "the older session is not put back");
});

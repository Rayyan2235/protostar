/**
 * FE-6 test 7 (Planner A GAP 21:06 on f7bdf17): which responses the requester page applies.
 * f7bdf17 dropped ANY response older than the newest applied one, action POSTs included: an action
 * (n=5) whose response came back after a later GET (n=6, pre-action session) was dropped, so its
 * new session and its error never showed, and run() still moved focus from it.
 * Rule: (a) an action response always applies unless a newer ACTION response already applied;
 * (b) a GET response is dropped if a request that started after it has applied, or while an
 * action is in flight.
 * Not reachable through today's UI (polling runs only on the review step, which offers no actions;
 * the initial GETs all start at mount), so the rule is pinned on the pure gate the page uses.
 * Red on a scratch copy of the gate with f7bdf17's rule.
 */
import { test } from "node:test";
import assert from "node:assert/strict";
import { admit, type Gate } from "./studio";

const start: Gate = { any: 0, action: 0, inFlight: 0 };

test("test 7: an action's response applies even after a later GET resolved first; that GET is dropped while the action is in flight", () => {
  let g = admit(start, 1, "get")!;                 // initial load applied
  assert.ok(g);
  g = { ...g, inFlight: 1 };                       // action n=2 starts
  assert.equal(admit(g, 3, "get"), null, "a GET started after the action, resolving first with the old session, is dropped");
  const after = admit(g, 2, "action");             // the action resolves with the new session (+ error)
  assert.ok(after, "the action's response applies: new session and its error banner");
  assert.deepEqual({ any: after.any, action: after.action }, { any: 2, action: 2 });
});

test("an action response is dropped only when a newer action response already applied", () => {
  const g = admit({ ...start, inFlight: 1 }, 4, "action")!;
  assert.equal(admit(g, 3, "action"), null);
  assert.ok(admit(g, 5, "action"));
});

test("a GET is dropped if anything that started after it has applied (test 6: late initial GET after an edit)", () => {
  let g = admit(start, 1, "get")!;   // first initial GET
  g = admit(g, 3, "action")!;        // the edit (started after both GETs) applied
  assert.equal(admit(g, 2, "get"), null, "second initial GET, started before the edit");
  assert.ok(admit(g, 4, "get"), "a poll started after the edit applies");
});

test("the page routes every response through admit(); run() moves focus only for an applied response", async () => {
  const { readFileSync } = await import("node:fs");
  const { join } = await import("node:path");
  const s = readFileSync(join(__dirname, "studio.tsx"), "utf8");
  assert.match(s, /admit\(gate\.current, n, kind\)/);
  assert.match(s, /if \(apply\(r, n, "action"\) && r\.session\) focusNext\.current/);
});

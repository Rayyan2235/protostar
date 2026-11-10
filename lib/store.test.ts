import { test, beforeEach } from "node:test";
import assert from "node:assert/strict";
import { getDecisions, getSession, resetDbForTests, saveSession } from "./store";
import { initial, reduce } from "./journey";

const at = "2026-11-10T00:00:00.000Z";
beforeEach(() => resetDbForTests());

test("round-trips a session and appends decisions without duplicates", () => {
  let s = initial("abc", at);
  saveSession(s);
  s = reduce(s, { type: "SUBMIT_IDEA", text: "Finance switch helper", at });
  saveSession(s);
  saveSession(s); // saving twice adds nothing
  assert.deepEqual(getSession("abc"), s);
  assert.deepEqual(getDecisions("abc"), s.log);
});

test("reset replaces the stored log", () => {
  let s = reduce(initial("r", at), { type: "SUBMIT_IDEA", text: "x", at });
  saveSession(s);
  s = reduce(s, { type: "RESET", at });
  saveSession(s);
  assert.equal(getDecisions("r").length, 1);
});

test("unknown session is undefined", () => {
  assert.equal(getSession("nope"), undefined);
});

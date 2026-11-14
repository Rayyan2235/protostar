import { test, beforeEach } from "node:test";
import assert from "node:assert/strict";
import Database from "better-sqlite3";
import { mkdtempSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import {
  deleteRuns, findSessionIdByReviewId, getBlueprint, getDecisions, getRounds, getRun, getRuns, getSession, openDb, resetDbForTests,
  saveReviewEvent, saveRun, saveSession, saveSubmission,
} from "./store";
import { fakeTestRun } from "./testRun.fake";
import { initial, reduce } from "./journey";
import type { Blueprint, Session } from "./types";

const at = "2026-11-10T00:00:00.000Z";
beforeEach(() => resetDbForTests());

test("round-trips a session and appends decisions without duplicates", () => {
  let s = initial("abc", at);
  saveSession(s);
  s = reduce(s, { type: "SUBMIT_IDEA", text: "Finance switch helper", at });
  saveSession(s);
  saveSession(s); // saving twice adds nothing
  assert.deepEqual(getSession("abc"), s);
  assert.deepEqual(getDecisions("abc"), s.log.map(({ at, who, what }) => ({ at, who, what })));
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

// --- Phase 3: frozen blueprints and review rounds (contract §7) ----------------------------

const bpFor = (s: Session, version: number): Blueprint =>
  ({ version, draft: false, builtAt: at, title: "T", idea: s.idea, log: s.log } as unknown as Blueprint);

function submitted(id = "sub", reviewId = "rev-1"): Session {
  const s = reduce(initial(id, at), { type: "SUBMIT_IDEA", text: "Finance helper", at });
  return { ...s, step: "review", review: { reviewId, version: 1, status: "pending", submittedAt: at } };
}

test("saveSubmission writes the session, one frozen blueprint and one pending round", () => {
  const s = submitted();
  saveSubmission(s, bpFor(s, 1));
  assert.deepEqual(getSession("sub"), s);
  assert.deepEqual(getBlueprint("sub", 1), bpFor(s, 1));
  assert.equal(findSessionIdByReviewId("rev-1"), "sub");
  assert.deepEqual(getRounds("sub"), [{ version: 1, submittedAt: at, status: "pending" }]);
  assert.equal(getBlueprint("sub", 2), undefined);
  assert.equal(findSessionIdByReviewId("nope"), undefined);
});

test("a decided round has openedAt, decidedAt and minutes; a second version adds a round", () => {
  const s = submitted();
  saveSubmission(s, bpFor(s, 1));
  const decided: Session = {
    ...s, step: "blueprint",
    review: { ...s.review!, status: "changes", openedAt: "2026-11-10T00:00:00.000Z", decidedAt: "2026-11-10T00:04:30.000Z", note: "More." },
  };
  saveReviewEvent(decided);
  assert.deepEqual(getRounds("sub"), [{
    version: 1, submittedAt: at, status: "changes", openedAt: "2026-11-10T00:00:00.000Z",
    decidedAt: "2026-11-10T00:04:30.000Z", note: "More.", minutes: 4.5,
  }]);
  const v2: Session = { ...decided, step: "review", review: { reviewId: "rev-1", version: 2, status: "pending", submittedAt: "2026-11-10T01:00:00.000Z" } };
  saveSubmission(v2, bpFor(v2, 2));
  const rounds = getRounds("sub");
  assert.deepEqual(rounds.map((r) => [r.version, r.status]), [[1, "changes"], [2, "pending"]]);
  assert.equal(rounds[1].minutes, undefined);
  assert.deepEqual(getBlueprint("sub", 1), bpFor(s, 1), "v1 stays frozen");
});

test("an old database file with only the sessions and decisions tables still opens", () => {
  const file = path.join(mkdtempSync(path.join(tmpdir(), "protostar-")), "old.db");
  const old = new Database(file);
  old.exec(`
    CREATE TABLE sessions (id TEXT PRIMARY KEY, json TEXT NOT NULL, updated_at TEXT NOT NULL);
    CREATE TABLE decisions (session_id TEXT NOT NULL REFERENCES sessions(id), seq INTEGER NOT NULL, at TEXT NOT NULL,
      who TEXT NOT NULL CHECK (who IN ('requester', 'tool', 'reviewer')), what TEXT NOT NULL, PRIMARY KEY (session_id, seq));
  `);
  old.prepare("INSERT INTO sessions (id, json, updated_at) VALUES (?, ?, ?)").run("legacy", JSON.stringify(initial("legacy", at)), at);
  old.close();
  resetDbForTests(file);
  assert.equal(getSession("legacy")?.id, "legacy");
  assert.deepEqual(getRounds("legacy"), []);
  const s = submitted("legacy");
  saveSubmission(s, bpFor(s, 1));
  assert.equal(getRounds("legacy").length, 1);
  resetDbForTests();
});

// --- Phase 2b: test runs (contract 9.7) -----------------------------------------------------

test("test_runs round-trip; getRuns is oldest first; deleteRuns removes only that session's runs", () => {
  const a = { ...fakeTestRun(), id: "run-a", at: "2026-11-12T01:00:00.000Z" };
  const b = { ...fakeTestRun(), id: "run-b", at: "2026-11-12T02:00:00.000Z" };
  const other = { ...fakeTestRun(), id: "run-x" };
  saveRun("s1", b);
  saveRun("s1", a);
  saveRun("s2", other);
  assert.deepEqual(getRun("run-a"), a);
  assert.equal(getRun("nope"), undefined);
  assert.deepEqual(getRuns("s1").map((r) => r.id), ["run-a", "run-b"]);
  deleteRuns("s1");
  assert.deepEqual(getRuns("s1"), []);
  assert.deepEqual(getRuns("s2").map((r) => r.id), ["run-x"]);
});

test("test_runs records offline and evidence: an offline run is never evidence; a passing model run is", () => {
  const offline = { ...fakeTestRun(), id: "off" };
  const model = { ...offline, id: "model", offline: false, columns: offline.columns.map((c) => ({ ...c, source: "claude-sonnet-5" })),
    verdicts: offline.verdicts.map((v) => ({ ...v, source: "claude-sonnet-5" })) };
  saveRun("s1", offline);
  saveRun("s1", model);
  const rows = openDb().prepare("SELECT run_id, offline, evidence FROM test_runs ORDER BY run_id").all();
  assert.deepEqual(rows, [{ run_id: "model", offline: 0, evidence: 1 }, { run_id: "off", offline: 1, evidence: 0 }]);
});

/**
 * SQLite persistence (better-sqlite3). Prototype-grade: the session is one JSON blob;
 * decisions are also rows so the log is queryable on its own.
 * Submitted blueprints are frozen in their own table, one row per version, with one
 * review round each (ADR 0011). Full test runs live in test_runs (contract 9.7).
 */
import Database from "better-sqlite3";
import { mkdirSync } from "node:fs";
import path from "node:path";
import { refOf } from "./testSummary";
import type { Blueprint, Decision, ReviewRound, ReviewStatus, Session, TestRun } from "./types";

let db: Database.Database | undefined;

export function openDb(file = process.env.DATABASE_PATH || "./data/protostar.db"): Database.Database {
  if (db) return db;
  // The DB path is runtime config, not a project file: keep it out of build tracing.
  if (file !== ":memory:") mkdirSync(path.dirname(path.resolve(/*turbopackIgnore: true*/ file)), { recursive: true });
  db = new Database(file);
  db.pragma("journal_mode = WAL");
  db.exec(`
    CREATE TABLE IF NOT EXISTS sessions (
      id TEXT PRIMARY KEY,
      json TEXT NOT NULL,
      updated_at TEXT NOT NULL
    );
    CREATE TABLE IF NOT EXISTS decisions (
      session_id TEXT NOT NULL REFERENCES sessions(id),
      seq INTEGER NOT NULL,
      at TEXT NOT NULL,
      who TEXT NOT NULL CHECK (who IN ('requester', 'tool', 'reviewer')),
      what TEXT NOT NULL,
      PRIMARY KEY (session_id, seq)
    );
    CREATE TABLE IF NOT EXISTS blueprints (
      session_id   TEXT NOT NULL REFERENCES sessions(id),
      version      INTEGER NOT NULL,
      review_id    TEXT NOT NULL,
      json         TEXT NOT NULL,
      submitted_at TEXT NOT NULL,
      PRIMARY KEY (session_id, version)
    );
    CREATE INDEX IF NOT EXISTS blueprints_review_id ON blueprints(review_id);
    CREATE TABLE IF NOT EXISTS reviews (
      session_id TEXT NOT NULL,
      version    INTEGER NOT NULL,
      status     TEXT NOT NULL CHECK (status IN ('pending', 'approved', 'changes', 'rejected')),
      opened_at  TEXT,
      decided_at TEXT,
      note       TEXT,
      PRIMARY KEY (session_id, version),
      FOREIGN KEY (session_id, version) REFERENCES blueprints(session_id, version)
    );
    CREATE TABLE IF NOT EXISTS test_runs (
      run_id     TEXT PRIMARY KEY,
      session_id TEXT NOT NULL REFERENCES sessions(id),
      at         TEXT NOT NULL,
      offline    INTEGER NOT NULL,
      evidence   INTEGER NOT NULL,
      json       TEXT NOT NULL
    );
    CREATE INDEX IF NOT EXISTS test_runs_session ON test_runs(session_id, at);
  `);
  return db;
}

/** Test hook: use a fresh database. */
export function resetDbForTests(file = ":memory:") {
  db?.close();
  db = undefined;
  return openDb(file);
}

export function getSession(id: string): Session | undefined {
  const row = openDb().prepare("SELECT json FROM sessions WHERE id = ?").get(id) as { json: string } | undefined;
  return row ? (JSON.parse(row.json) as Session) : undefined;
}

/**
 * Save the session and append its new decisions. The log is append-only, except RESET,
 * which starts a fresh log: then the stored rows are replaced.
 */
export function saveSession(s: Session, now = new Date().toISOString()): void {
  const d = openDb();
  d.transaction(() => {
    d.prepare(
      "INSERT INTO sessions (id, json, updated_at) VALUES (?, ?, ?) ON CONFLICT(id) DO UPDATE SET json = excluded.json, updated_at = excluded.updated_at",
    ).run(s.id, JSON.stringify(s), now);
    const stored = (d.prepare("SELECT COUNT(*) AS n FROM decisions WHERE session_id = ?").get(s.id) as { n: number }).n;
    let from = stored;
    if (s.log.length < stored) {
      d.prepare("DELETE FROM decisions WHERE session_id = ?").run(s.id);
      from = 0;
    }
    const ins = d.prepare("INSERT INTO decisions (session_id, seq, at, who, what) VALUES (?, ?, ?, ?, ?)");
    s.log.slice(from).forEach((x, i) => ins.run(s.id, from + i, x.at, x.who, x.what));
  })();
}

export function getDecisions(id: string): Decision[] {
  return openDb().prepare("SELECT at, who, what FROM decisions WHERE session_id = ? ORDER BY seq").all(id) as Decision[];
}

/** Submit: the session, the frozen blueprint for s.review.version, and its pending round, in one transaction. */
export function saveSubmission(s: Session, bp: Blueprint, now = new Date().toISOString()): void {
  const r = s.review;
  if (!r) throw new Error("saveSubmission needs a submitted session.");
  const d = openDb();
  d.transaction(() => {
    saveSession(s, now);
    d.prepare("INSERT INTO blueprints (session_id, version, review_id, json, submitted_at) VALUES (?, ?, ?, ?, ?)")
      .run(s.id, r.version, r.reviewId, JSON.stringify(bp), r.submittedAt);
    d.prepare("INSERT INTO reviews (session_id, version, status) VALUES (?, ?, 'pending')").run(s.id, r.version);
  })();
}

/** Open or decide: the session plus its latest round from s.review, in one transaction. */
export function saveReviewEvent(s: Session, now = new Date().toISOString()): void {
  const r = s.review;
  if (!r) throw new Error("saveReviewEvent needs a submitted session.");
  const d = openDb();
  d.transaction(() => {
    saveSession(s, now);
    d.prepare("UPDATE reviews SET status = ?, opened_at = ?, decided_at = ?, note = ? WHERE session_id = ? AND version = ?")
      .run(r.status, r.openedAt ?? null, r.decidedAt ?? null, r.note ?? null, s.id, r.version);
  })();
}

// --- Test runs (contract 9.7) ------------------------------------------------------------------

/** One full TestRun. `evidence` is RunRef.evidence: the Phase 3 gate counts evidence = 1 only, never offline runs. */
export function saveRun(sessionId: string, run: TestRun): void {
  openDb().prepare("INSERT INTO test_runs (run_id, session_id, at, offline, evidence, json) VALUES (?, ?, ?, ?, ?, ?)")
    .run(run.id, sessionId, run.at, run.offline ? 1 : 0, refOf(run, []).evidence ? 1 : 0, JSON.stringify(run));
}

/** The run and the session that now points at it, in one transaction. */
export function saveRunAndSession(s: Session, run: TestRun, now = new Date().toISOString()): void {
  const d = openDb();
  d.transaction(() => {
    saveSession(s, now); // first: test_runs.session_id references sessions(id)
    saveRun(s.id, run);
  })();
}

export function getRun(runId: string): TestRun | undefined {
  const row = openDb().prepare("SELECT json FROM test_runs WHERE run_id = ?").get(runId) as { json: string } | undefined;
  return row ? (JSON.parse(row.json) as TestRun) : undefined;
}

/** A session's runs, oldest first. */
export function getRuns(sessionId: string): TestRun[] {
  const rows = openDb().prepare("SELECT json FROM test_runs WHERE session_id = ? ORDER BY at, rowid").all(sessionId) as { json: string }[];
  return rows.map((r) => JSON.parse(r.json) as TestRun);
}

/** RESET only (before any submit). */
export function deleteRuns(sessionId: string): void {
  openDb().prepare("DELETE FROM test_runs WHERE session_id = ?").run(sessionId);
}

export function findSessionIdByReviewId(reviewId: string): string | undefined {
  const row = openDb().prepare("SELECT session_id FROM blueprints WHERE review_id = ? LIMIT 1").get(reviewId) as
    { session_id: string } | undefined;
  return row?.session_id;
}

export function getBlueprint(sessionId: string, version: number): Blueprint | undefined {
  const row = openDb().prepare("SELECT json FROM blueprints WHERE session_id = ? AND version = ?").get(sessionId, version) as
    { json: string } | undefined;
  return row ? (JSON.parse(row.json) as Blueprint) : undefined;
}

/** Review rounds, oldest first. Minutes = decidedAt − openedAt, 1 decimal, only once decided. */
export function getRounds(sessionId: string): ReviewRound[] {
  const rows = openDb().prepare(`
    SELECT b.version, b.submitted_at, r.status, r.opened_at, r.decided_at, r.note
    FROM blueprints b JOIN reviews r ON r.session_id = b.session_id AND r.version = b.version
    WHERE b.session_id = ? ORDER BY b.version
  `).all(sessionId) as {
    version: number; submitted_at: string; status: ReviewStatus; opened_at: string | null; decided_at: string | null; note: string | null;
  }[];
  return rows.map((x) => ({
    version: x.version,
    submittedAt: x.submitted_at,
    status: x.status,
    ...(x.opened_at ? { openedAt: x.opened_at } : {}),
    ...(x.decided_at ? { decidedAt: x.decided_at } : {}),
    ...(x.note ? { note: x.note } : {}),
    ...(x.opened_at && x.decided_at
      ? { minutes: Math.round((Date.parse(x.decided_at) - Date.parse(x.opened_at)) / 6000) / 10 }
      : {}),
  }));
}

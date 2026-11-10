/**
 * SQLite persistence (better-sqlite3). Prototype-grade: the session is one JSON blob;
 * decisions are also rows so the log is queryable on its own.
 * Later phases add test_runs and reviews.
 */
import Database from "better-sqlite3";
import { mkdirSync } from "node:fs";
import path from "node:path";
import type { Decision, Session } from "./types";

let db: Database.Database | undefined;

export function openDb(file = process.env.DATABASE_PATH || "./data/protostar.db"): Database.Database {
  if (db) return db;
  if (file !== ":memory:") mkdirSync(path.dirname(path.resolve(file)), { recursive: true });
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

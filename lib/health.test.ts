/** BE-13: GET /api/health (plan-4 §5). Exactly { ok, provider, db }; no secrets, no error text. */
import { test, beforeEach, afterEach } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { health } from "./health";
import { resetDbForTests } from "./store";

const KEYS = ["LLM_PROVIDER", "LLM_API_KEY", "LLM_BASE_URL", "LLM_FOUNDRY_RESOURCE", "MODEL_CHEAP", "MODEL_CAPABLE", "MODEL_JUDGE"];
let saved: Record<string, string | undefined> = {};
beforeEach(() => {
  saved = Object.fromEntries(KEYS.map((k) => [k, process.env[k]]));
  for (const k of KEYS) delete process.env[k];
  resetDbForTests();
});
afterEach(() => {
  for (const k of KEYS) {
    if (saved[k] === undefined) delete process.env[k];
    else process.env[k] = saved[k];
  }
});

test("200 with exactly ok, provider and db", () => {
  process.env.LLM_PROVIDER = "foundry";
  const r = health();
  assert.equal(r.status, 200);
  assert.deepEqual(r.body, { ok: true, provider: "foundry", db: "ok" });
  assert.deepEqual(Object.keys(r.body).sort(), ["db", "ok", "provider"]);
});

test("the body never carries the key, URL or model names", () => {
  process.env.LLM_PROVIDER = "anthropic";
  process.env.LLM_API_KEY = "sk-test-123";
  process.env.LLM_BASE_URL = "https://secret-gateway.example/anthropic";
  process.env.MODEL_CAPABLE = "secret-deployment-name";
  const text = JSON.stringify(health().body);
  for (const s of ["sk-test-123", "secret-gateway", "secret-deployment-name"]) assert.ok(!text.includes(s), s);
});

test("a DB failure gives 503 with the same three keys and no error text", () => {
  process.env.LLM_PROVIDER = "offline";
  const r = health(() => {
    throw new Error("SQLITE_CANTOPEN /home/data/protostar.db sk-test-123");
  });
  assert.equal(r.status, 503);
  assert.deepEqual(r.body, { ok: false, provider: "offline", db: "error" });
  const text = JSON.stringify(r.body);
  for (const s of ["SQLITE", "/home", "sk-test-123"]) assert.ok(!text.includes(s), s);
});

test("an unknown LLM_PROVIDER gives \"unknown\", never the raw value", () => {
  process.env.LLM_PROVIDER = "my-secret-gateway";
  const r = health();
  assert.equal(r.status, 200);
  assert.equal(r.body.provider, "unknown");
  assert.ok(!JSON.stringify(r.body).includes("my-secret-gateway"));
});

test("an unset LLM_PROVIDER reports the default the app uses", () => {
  assert.equal(health().body.provider, "foundry");
});

test("the route renders per request: it awaits connection() before checking", () => {
  const src = readFileSync(new URL("../app/api/health/route.ts", import.meta.url), "utf8");
  assert.match(src, /await connection\(\)/);
  assert.match(src, /from "next\/server"/);
  assert.match(src, /health\(\)/);
});

test("package.json pins the Node floor better-sqlite3 needs", () => {
  const pkg = JSON.parse(readFileSync(new URL("../package.json", import.meta.url), "utf8"));
  assert.equal(pkg.engines?.node, ">=22");
});

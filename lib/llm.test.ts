/** complete() in offline mode: the fixture goes through the real schema, no client is built (ADR 0013). */
import { test, beforeEach, afterEach } from "node:test";
import assert from "node:assert/strict";
import { z } from "zod";
import { complete, LLMError } from "./llm";
import { OFFLINE_SOURCE } from "./schemas";

const KEYS = ["LLM_PROVIDER", "LLM_API_KEY", "LLM_BASE_URL", "LLM_FOUNDRY_RESOURCE", "MODEL_CHEAP", "MODEL_CAPABLE", "MODEL_JUDGE"];
let saved: Record<string, string | undefined> = {};
beforeEach(() => {
  saved = Object.fromEntries(KEYS.map((k) => [k, process.env[k]]));
  for (const k of KEYS) delete process.env[k];
});
afterEach(() => {
  for (const k of KEYS) {
    if (saved[k] === undefined) delete process.env[k];
    else process.env[k] = saved[k];
  }
});

const Schema = z.object({ answer: z.string(), score: z.number() });
const base = { system: "s", messages: [{ role: "user" as const, content: "q" }], schema: Schema };

test("offline: returns the parsed fixture as offline-script with zero usage, without a model or key", async () => {
  process.env.LLM_PROVIDER = "offline";
  const r = await complete({ ...base, model: "capable", offline: () => ({ answer: "From the bulletin.", score: 1 }) });
  assert.deepEqual(r, { data: { answer: "From the bulletin.", score: 1 }, model: OFFLINE_SOURCE, usage: { inputTokens: 0, outputTokens: 0 } });
  assert.equal(OFFLINE_SOURCE, "offline-script");
});

test("offline: the fixture is parsed, so schema defaults and transforms apply", async () => {
  process.env.LLM_PROVIDER = "offline";
  const WithDefault = z.object({ items: z.array(z.string()).default([]) });
  const r = await complete({ ...base, schema: WithDefault, offline: () => ({}) });
  assert.deepEqual(r.data, { items: [] });
});

test("offline: a fixture that breaks the schema throws a ZodError", async () => {
  process.env.LLM_PROVIDER = "offline";
  await assert.rejects(complete({ ...base, offline: () => ({ answer: 42 }) }), (e: unknown) => e instanceof z.ZodError);
});

test("not offline: the fixture is ignored and the real client path runs", async () => {
  process.env.LLM_PROVIDER = "anthropic";
  process.env.MODEL_CAPABLE = "claude-sonnet-5";
  let called = 0;
  const offline = () => { called++; return { answer: "x", score: 0 }; };
  await assert.rejects(complete({ ...base, offline }), (e: unknown) => e instanceof LLMError && /LLM_API_KEY/.test(e.message));
  assert.equal(called, 0);
});

/**
 * The deploy health check (plan-4 §5 BE-13), behind GET /api/health.
 * Exactly { ok, provider, db }: no keys, URLs, model names, paths or error text.
 */
import { provider, type Provider } from "./llm";
import { pingDb } from "./store";

export interface Health {
  ok: boolean;
  /** The parsed provider enum; a misconfigured LLM_PROVIDER is "unknown", never the raw value. */
  provider: Provider | "unknown";
  db: "ok" | "error";
}

export function health(ping: () => void = pingDb): { status: 200 | 503; body: Health } {
  let p: Health["provider"];
  try {
    p = provider();
  } catch {
    p = "unknown";
  }
  try {
    ping();
  } catch (e) {
    console.error("[health] db check failed", e); // server log only, never the body
    return { status: 503, body: { ok: false, provider: p, db: "error" } };
  }
  return { status: 200, body: { ok: true, provider: p, db: "ok" } };
}

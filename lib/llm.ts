/**
 * The only place Protostar talks to a model.
 *
 * Every step (interviewer, data-rule fallback, drafter, tests, runner, judge) calls
 * `complete()` with a zod schema and gets typed, validated JSON back. The provider is
 * one env value, so the same code runs on Azure AI Foundry, the Anthropic API, or a
 * customer's nebulaONE gateway (Anthropic-compatible `/anthropic/v1/messages`).
 */
import Anthropic from "@anthropic-ai/sdk";
import AnthropicFoundry from "@anthropic-ai/foundry-sdk";
import { zodOutputFormat } from "@anthropic-ai/sdk/helpers/zod";
import type { z } from "zod";

/** `offline` = no model at all; callers use scripted output and the UI says so. */
export type Provider = "foundry" | "anthropic" | "nebulaone" | "offline";
export type ModelRole = "cheap" | "capable" | "judge";

export interface CompleteOptions<S extends z.ZodType> {
  system: string;
  messages: Anthropic.MessageParam[];
  schema: S;
  /** A role from env config, or an explicit model / deployment name. */
  model?: ModelRole | (string & {});
  maxTokens?: number;
}

export interface CompleteResult<T> {
  data: T;
  model: string;
  usage: { inputTokens: number; outputTokens: number };
}

export class LLMError extends Error {}

/** The slice of the SDK we use; satisfied by both Anthropic and AnthropicFoundry. */
type MessagesClient = { messages: Pick<Anthropic["messages"], "parse"> };

const ROLES: readonly ModelRole[] = ["cheap", "capable", "judge"];
const isRole = (m: string): m is ModelRole => (ROLES as readonly string[]).includes(m);

function env(name: string): string | undefined {
  const v = process.env[name]?.trim();
  return v ? v : undefined;
}

export function provider(): Provider {
  const p = env("LLM_PROVIDER") ?? "foundry";
  if (p !== "foundry" && p !== "anthropic" && p !== "nebulaone" && p !== "offline") {
    throw new LLMError(`LLM_PROVIDER must be foundry | anthropic | nebulaone | offline, got "${p}"`);
  }
  return p;
}

export function resolveModel(model: CompleteOptions<z.ZodType>["model"] = "capable"): string {
  const byRole: Record<ModelRole, string | undefined> = {
    cheap: env("MODEL_CHEAP"),
    capable: env("MODEL_CAPABLE"),
    judge: env("MODEL_JUDGE") ?? env("MODEL_CAPABLE"),
  };
  if (isRole(model)) {
    const name = byRole[model];
    if (!name) throw new LLMError(`No model configured for role "${model}" (set MODEL_${model.toUpperCase()})`);
    return name;
  }
  return model;
}

let cached: { key: string; client: MessagesClient } | undefined;

function client(): MessagesClient {
  const p = provider();
  const apiKey = env("LLM_API_KEY");
  const baseURL = env("LLM_BASE_URL");
  const resource = env("LLM_FOUNDRY_RESOURCE");
  const key = [p, apiKey, baseURL, resource].join("|");
  if (cached?.key === key) return cached.client;

  if (p === "offline") throw new LLMError("LLM_PROVIDER=offline: no model calls are made in offline mode");
  if (!apiKey) throw new LLMError("LLM_API_KEY is not set (see .env.example)");

  let c: MessagesClient;
  if (p === "foundry") {
    if (!resource && !baseURL) throw new LLMError("Foundry needs LLM_FOUNDRY_RESOURCE or LLM_BASE_URL");
    // Pass only one of resource / baseURL.
    c = baseURL ? new AnthropicFoundry({ apiKey, baseURL }) : new AnthropicFoundry({ apiKey, resource });
  } else if (p === "nebulaone") {
    if (!baseURL) throw new LLMError("nebulaone needs LLM_BASE_URL, e.g. https://<gateway>/anthropic");
    c = new Anthropic({ apiKey, baseURL }); // SDK sends x-api-key + anthropic-version
  } else {
    c = new Anthropic({ apiKey, ...(baseURL ? { baseURL } : {}) });
  }
  cached = { key, client: c };
  return c;
}

/** One structured-output call. Throws LLMError on refusal, truncation, or unparseable output. */
export async function complete<S extends z.ZodType>(opts: CompleteOptions<S>): Promise<CompleteResult<z.infer<S>>> {
  const model = resolveModel(opts.model);
  const res = await client().messages.parse({
    model,
    max_tokens: opts.maxTokens ?? 8000,
    system: opts.system,
    messages: opts.messages,
    output_config: { format: zodOutputFormat(opts.schema) },
  });

  if (res.stop_reason === "refusal") {
    throw new LLMError(`${model} declined the request${res.stop_details?.explanation ? `: ${res.stop_details.explanation}` : ""}`);
  }
  if (res.stop_reason === "max_tokens") {
    throw new LLMError(`${model} hit max_tokens before finishing; raise maxTokens`);
  }
  if (res.parsed_output == null) {
    throw new LLMError(`${model} returned output that did not match the schema`);
  }
  return {
    data: res.parsed_output,
    model,
    usage: { inputTokens: res.usage.input_tokens, outputTokens: res.usage.output_tokens },
  };
}

import { test } from "node:test";
import assert from "node:assert/strict";
import { cleanKnobs, estimate, formatDollars, priceFor, recommendedScope } from "./scoper";

const haiku = priceFor("claude-haiku-4-5")!;
const sonnet = priceFor("claude-sonnet-5")!;

test("price lookup matches model ids and Foundry-style deployment names", () => {
  assert.equal(haiku.name, "Claude Haiku 4.5");
  assert.equal(sonnet.name, "Claude Sonnet 5");
  assert.equal(priceFor("my-Sonnet-5-deployment")?.name, "Claude Sonnet 5");
  assert.equal(priceFor("claude-sonnet-5-5"), undefined, "Sonnet 5.5 is a different model");
  assert.equal(priceFor("gpt-5.4-mini"), undefined, "no invented prices");
});

test("formula: students × convs × (in × $in + out × $out)", () => {
  // FAQ on Haiku: 2000 × 2 = 4000 convs; 16M in × $1 + 1.6M out × $5 = $16 + $8 = $24
  const e = estimate("faq", haiku, { studentsPerMonth: 2000, convsPerStudent: 2 });
  assert.equal(e.conversations, 4000);
  assert.equal(e.inputMTok, 16);
  assert.equal(e.outputMTok, 1.6);
  assert.equal(e.monthlyDollars, 24);
  assert.equal(e.tokensPerStudent, 8800);
});

test("guided on Sonnet 5 at default knobs", () => {
  // 4000 convs × 8000 = 32M in × $2 = $64; 4000 × 1200 = 4.8M out × $10 = $48 → $112
  assert.equal(estimate("guided", sonnet, { studentsPerMonth: 2000, convsPerStudent: 2 }).monthlyDollars, 112);
});

test("changing a knob changes the estimate (acceptance check)", () => {
  const a = estimate("guided", sonnet, { studentsPerMonth: 2000, convsPerStudent: 2 }).monthlyDollars;
  const b = estimate("guided", sonnet, { studentsPerMonth: 3000, convsPerStudent: 2 }).monthlyDollars;
  const c = estimate("guided", sonnet, { studentsPerMonth: 2000, convsPerStudent: 3 }).monthlyDollars;
  assert.ok(b > a && c > a);
  assert.equal(b, a * 1.5);
});

test("the cheap model costs less for the same scope", () => {
  const k = { studentsPerMonth: 2000, convsPerStudent: 2 };
  assert.ok(estimate("guided", haiku, k).monthlyDollars < estimate("guided", sonnet, k).monthlyDollars);
});

test("knobs are clamped and defaulted", () => {
  assert.deepEqual(cleanKnobs({ studentsPerMonth: -5, convsPerStudent: Number.NaN }), { studentsPerMonth: 1, convsPerStudent: 2 });
  assert.deepEqual(cleanKnobs({ studentsPerMonth: 1e12, convsPerStudent: 2.345 }), { studentsPerMonth: 1_000_000, convsPerStudent: 2.3 });
});

test("recommendation follows the requester's data choice", () => {
  assert.equal(recommendedScope("selfreport").scope, "guided");
  assert.equal(recommendedScope("route").scope, "faq");
  assert.equal(recommendedScope(undefined).scope, "faq");
});

test("dollar formatting", () => {
  assert.equal(formatDollars(24), "$24.00");
  assert.equal(formatDollars(1234.4), "$1,234");
});

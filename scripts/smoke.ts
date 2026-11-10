/**
 * Phase 0 smoke test: one structured-output call per configured model.
 * Run: npm run smoke   (reads .env)
 * Passes when every model returns schema-valid JSON grounded in the knowledge snapshot.
 */
import { readFileSync } from "node:fs";
import { z } from "zod";
import { complete, provider, resolveModel, LLMError } from "../lib/llm";

const knowledge = readFileSync("knowledge/finance-bs-entrance-to-major.md", "utf8");

const Answer = z.object({
  minimumGpa: z.number().describe("Minimum cumulative GPA to enter the Finance major, from the source"),
  quote: z.string().describe("Short exact quote from the source that states it"),
});

async function main() {
  const roles = ["cheap", "capable"] as const;
  const models = [...new Set(roles.map((r) => resolveModel(r)))];
  console.log(`provider=${provider()} models=${models.join(", ")}`);

  let failed = 0;
  for (const model of models) {
    const t0 = Date.now();
    try {
      const { data, usage } = await complete({
        model,
        maxTokens: 1000,
        schema: Answer,
        system: "Answer only from the provided source. If the source does not say, use 0 and quote nothing.",
        messages: [{ role: "user", content: `<source>\n${knowledge}\n</source>\n\nWhat minimum GPA does a student need to enter the Finance major?` }],
      });
      const ok = data.minimumGpa === 3.5;
      if (!ok) failed++;
      console.log(`${ok ? "PASS" : "FAIL"} ${model} gpa=${data.minimumGpa} in=${usage.inputTokens} out=${usage.outputTokens} ${Date.now() - t0}ms`);
      console.log(`     "${data.quote}"`);
    } catch (e) {
      failed++;
      console.log(`FAIL ${model} ${e instanceof LLMError ? e.message : String(e)}`);
    }
  }
  process.exit(failed ? 1 : 0);
}

main();

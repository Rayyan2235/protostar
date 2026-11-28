/**
 * Browser-safe modules (contract §0). app/** client code may import these, so they must
 * not pull server code into the client bundle: at runtime they import nothing except zod
 * and each other (an allowlist, so a new server dependency fails without a list update).
 * Anything else may be imported only with the statement form `import type { … } from`;
 * `import { type X } from` still counts as a runtime import, because the statement
 * survives compilation.
 */
import { test } from "node:test";
import assert from "node:assert/strict";
import { existsSync, readFileSync } from "node:fs";
import { join } from "node:path";

const BROWSER_SAFE = [
  "types.ts", "scenario.ts", "api.ts", "schemas.ts", "testRun.fake.ts", "scoper.ts", "journey.ts", "dataRules.ts", "blueprint.ts", "export.ts", "testSummary.ts",
];
const ALLOWED = new Set(["zod", ...BROWSER_SAFE.map((f) => `./${f.replace(/\.ts$/, "")}`)]);

function isForbidden(spec: string): boolean {
  const local = spec.replace(/^(?:@\/lib\/|\.\.\/lib\/)/, "./").replace(/\.(?:tsx?|js)$/, "");
  return !ALLOWED.has(local);
}

/** Module specifiers the file loads at runtime (type-only statements excluded). */
function runtimeImports(src: string): string[] {
  const code = src.replace(/\/\*[\s\S]*?\*\//g, "").replace(/^\s*\/\/.*$/gm, "");
  const specs: string[] = [];
  for (const m of code.matchAll(/^\s*(import|export)\s+([^;"']*?)\bfrom\s*["']([^"']+)["']/gm)) {
    if (!/^type\b/.test(m[2])) specs.push(m[3]);
  }
  for (const m of code.matchAll(/^\s*import\s*["']([^"']+)["']/gm)) specs.push(m[1]);
  for (const m of code.matchAll(/\b(?:import|require)\s*\(\s*["'`]([^"'`]+)["'`]\s*\)/g)) specs.push(m[1]);
  return specs;
}

const forbiddenIn = (src: string) => runtimeImports(src).filter(isForbidden);

test("checker: statement-form type import of a server module passes", () => {
  assert.deepEqual(forbiddenIn(`import type { Catalog } from "./engine";`), []);
  assert.deepEqual(forbiddenIn(`import type {\n  Catalog,\n} from "@/lib/engine";`), []);
  assert.deepEqual(forbiddenIn(`export type { Catalog } from "./engine";`), []);
});

test("checker: inline type import, value import, side-effect, dynamic and require all fail", () => {
  assert.deepEqual(forbiddenIn(`import { type Catalog } from "./engine";`), ["./engine"]);
  assert.deepEqual(forbiddenIn(`import { getSession } from "./store";`), ["./store"]);
  assert.deepEqual(forbiddenIn(`import "./llm";`), ["./llm"]);
  assert.deepEqual(forbiddenIn(`const k = await import("./knowledge");`), ["./knowledge"]);
  assert.deepEqual(forbiddenIn(`const fs = require("fs");`), ["fs"]);
  assert.deepEqual(forbiddenIn("const s = await import(`./store`);"), ["./store"], "backtick dynamic import");
  assert.deepEqual(forbiddenIn("const db = require(`better-sqlite3`);"), ["better-sqlite3"]);
  assert.deepEqual(forbiddenIn(`import { randomUUID } from "node:crypto";`), ["node:crypto"]);
  assert.deepEqual(forbiddenIn(`import Database from "better-sqlite3";`), ["better-sqlite3"]);
  assert.deepEqual(forbiddenIn(`export { interviewTurn } from "./interviewer";`), ["./interviewer"]);
  assert.deepEqual(forbiddenIn(`import "./llm";\nimport type { Catalog } from "./engine";`), ["./llm"]);
});

test("checker: anything outside zod and the browser-safe files fails, in any path form", () => {
  assert.deepEqual(forbiddenIn(`import Anthropic from "@anthropic-ai/sdk";`), ["@anthropic-ai/sdk"]);
  assert.deepEqual(forbiddenIn(`import { complete } from "../lib/llm";`), ["../lib/llm"]);
  assert.deepEqual(forbiddenIn(`import { getSession } from "./store.js";`), ["./store.js"]);
  assert.deepEqual(forbiddenIn(`import { runChecks } from "./checks";`), ["./checks"], "a lib file on neither list");
  assert.deepEqual(forbiddenIn(`import { useState } from "react";`), ["react"]);
  assert.deepEqual(forbiddenIn(`import type { Anthropic } from "@anthropic-ai/sdk";`), [], "type-only from anything is fine");
  assert.deepEqual(forbiddenIn(`import { SCENARIO } from "@/lib/scenario";\nimport { gate } from "../lib/dataRules.js";`), []);
});

test("checker: zod, other browser-safe modules and commented-out imports pass", () => {
  assert.deepEqual(forbiddenIn(`import { z } from "zod";\nimport { estimate } from "./scoper";`), []);
  assert.deepEqual(forbiddenIn(`// import { getSession } from "./store";\n/* import "./llm"; */`), []);
  assert.deepEqual(forbiddenIn(`const url = "https://example.edu"; // not an import`), []);
});

for (const file of BROWSER_SAFE) {
  const path = join(process.cwd(), "lib", file);
  test(`lib/${file} imports no server-only module at runtime`, () => {
    assert.ok(existsSync(path), `lib/${file} is missing`);
    assert.deepEqual(forbiddenIn(readFileSync(path, "utf8")), []);
  });
}

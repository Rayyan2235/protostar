/**
 * Browser-safe modules (contract §0). app/** client code may import these, so they must
 * not pull server code into the client bundle. A server module may be imported only with
 * the statement form `import type { … } from`; `import { type X } from` still counts as a
 * runtime import, because the statement survives compilation.
 */
import { test } from "node:test";
import assert from "node:assert/strict";
import { existsSync, readFileSync } from "node:fs";
import { builtinModules } from "node:module";
import { join } from "node:path";

const BROWSER_SAFE = [
  "types.ts", "scenario.ts", "api.ts", "scoper.ts", "journey.ts", "dataRules.ts", "blueprint.ts", "export.ts",
];
/** Not written yet; checked automatically once they exist. */
const LATER = new Set(["blueprint.ts", "export.ts"]);
const SERVER_ONLY = ["engine", "store", "llm", "knowledge", "interviewer"];

function isForbidden(spec: string): boolean {
  if (spec.startsWith("node:") || spec === "better-sqlite3" || builtinModules.includes(spec)) return true;
  const local = spec.replace(/^@\/lib\//, "./").replace(/\.tsx?$/, "");
  return SERVER_ONLY.some((m) => local === `./${m}`);
}

/** Module specifiers the file loads at runtime (type-only statements excluded). */
function runtimeImports(src: string): string[] {
  const code = src.replace(/\/\*[\s\S]*?\*\//g, "").replace(/^\s*\/\/.*$/gm, "");
  const specs: string[] = [];
  for (const m of code.matchAll(/^\s*(import|export)\s+([^;"']*?)\bfrom\s*["']([^"']+)["']/gm)) {
    if (!/^type\b/.test(m[2])) specs.push(m[3]);
  }
  for (const m of code.matchAll(/^\s*import\s*["']([^"']+)["']/gm)) specs.push(m[1]);
  for (const m of code.matchAll(/\b(?:import|require)\s*\(\s*["']([^"']+)["']\s*\)/g)) specs.push(m[1]);
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
  assert.deepEqual(forbiddenIn(`import { randomUUID } from "node:crypto";`), ["node:crypto"]);
  assert.deepEqual(forbiddenIn(`import Database from "better-sqlite3";`), ["better-sqlite3"]);
  assert.deepEqual(forbiddenIn(`export { interviewTurn } from "./interviewer";`), ["./interviewer"]);
  assert.deepEqual(forbiddenIn(`import "./llm";\nimport type { Catalog } from "./engine";`), ["./llm"]);
});

test("checker: zod, other browser-safe modules and commented-out imports pass", () => {
  assert.deepEqual(forbiddenIn(`import { z } from "zod";\nimport { estimate } from "./scoper";`), []);
  assert.deepEqual(forbiddenIn(`// import { getSession } from "./store";\n/* import "./llm"; */`), []);
  assert.deepEqual(forbiddenIn(`const url = "https://example.edu"; // not an import`), []);
});

for (const file of BROWSER_SAFE) {
  const path = join(process.cwd(), "lib", file);
  const later = LATER.has(file) && !existsSync(path);
  test(`lib/${file} imports no server-only module at runtime`, { skip: later && "lands in a later step" }, () => {
    assert.ok(existsSync(path), `lib/${file} is missing`);
    assert.deepEqual(forbiddenIn(readFileSync(path, "utf8")), []);
  });
}

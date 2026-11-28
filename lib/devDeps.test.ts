/**
 * BE-15 (plan-4 §5, ADR 0015): the DOM test renderer is dev-only. The four packages sit in
 * devDependencies at exact versions, and only test files (and the components/test helper) import them.
 */
import { test } from "node:test";
import assert from "node:assert/strict";
import { existsSync, readdirSync, readFileSync, statSync } from "node:fs";
import path from "node:path";

const ROOT = path.resolve(import.meta.dirname, "..");
const DOM_PACKAGES = ["happy-dom", "@happy-dom/global-registrator", "@testing-library/react", "@testing-library/dom"];
const pkg = JSON.parse(readFileSync(path.join(ROOT, "package.json"), "utf8")) as {
  dependencies?: Record<string, string>;
  devDependencies?: Record<string, string>;
};

test("the four DOM test packages are devDependencies, not dependencies", () => {
  for (const name of DOM_PACKAGES) {
    assert.ok(pkg.devDependencies?.[name], `${name} missing from devDependencies`);
    assert.equal(pkg.dependencies?.[name], undefined, `${name} must not be a runtime dependency`);
  }
});

test("their versions are exact pins (no ^, ~, ranges or tags)", () => {
  for (const name of DOM_PACKAGES) {
    assert.match(pkg.devDependencies?.[name] ?? "", /^\d+\.\d+\.\d+$/, name);
  }
});

test("happy-dom is at least 20.0.0 (earlier versions have the VM-escape advisory)", () => {
  for (const name of ["happy-dom", "@happy-dom/global-registrator"]) {
    const major = Number((pkg.devDependencies?.[name] ?? "0").split(".")[0]);
    assert.ok(major >= 20, `${name} ${pkg.devDependencies?.[name]}`);
  }
});

/** Files under app/, components/ and lib/ that ship: not tests, not the components/test helper. */
function shippedSources(): string[] {
  const out: string[] = [];
  const walk = (dir: string) => {
    for (const entry of readdirSync(dir)) {
      const full = path.join(dir, entry);
      const rel = path.relative(ROOT, full).split(path.sep).join("/");
      if (statSync(full).isDirectory()) {
        if (entry === "node_modules" || rel === "components/test") continue;
        walk(full);
      } else if (/\.(?:[cm]?[jt]sx?)$/.test(entry) && !/\.test\.tsx?$/.test(entry)) {
        out.push(rel);
      }
    }
  };
  for (const top of ["app", "components", "lib"]) if (existsSync(path.join(ROOT, top))) walk(path.join(ROOT, top));
  return out;
}

const SPEC = /(?:\bfrom\s*|\bimport\s*\(?\s*|\brequire\s*\(\s*)["'`]([^"'`]+)["'`]/g;
const isDomPackage = (spec: string) => DOM_PACKAGES.some((p) => spec === p || spec.startsWith(`${p}/`));

test("the scan finds real imports (checker self-test)", () => {
  const specs = (src: string) => [...src.matchAll(SPEC)].map((m) => m[1]).filter(isDomPackage);
  assert.deepEqual(specs(`import { render } from "@testing-library/react";`), ["@testing-library/react"]);
  assert.deepEqual(specs(`import "happy-dom";`), ["happy-dom"]);
  assert.deepEqual(specs(`const m = await import('@testing-library/dom/dist/x');`), ["@testing-library/dom/dist/x"]);
  assert.deepEqual(specs(`require("@happy-dom/global-registrator")`), ["@happy-dom/global-registrator"]);
  assert.deepEqual(specs(`import { x } from "happy-dom-lookalike";`), []);
});

test("no shipped file under app/, components/ or lib/ imports them", () => {
  const files = shippedSources();
  assert.ok(files.includes("lib/llm.ts"), "the scan sees lib/");
  const hits = files.flatMap((f) =>
    [...readFileSync(path.join(ROOT, f), "utf8").matchAll(SPEC)].map((m) => m[1]).filter(isDomPackage).map((s) => `${f}: ${s}`));
  assert.deepEqual(hits, []);
});

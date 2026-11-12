/**
 * Kiln rule (ADR 0012, KILN-AGENT §3): no raw colours, sizes, font names or easings outside
 * app/tokens.css. Files not migrated yet sit in LEGACY, which may only shrink.
 */
import { test } from "node:test";
import assert from "node:assert/strict";
import { existsSync, readdirSync, readFileSync, statSync } from "node:fs";
import { join, relative, sep } from "node:path";

const ROOT = process.cwd();
const TOKENS_FILE = "app/tokens.css";

/** Unmigrated files. Remove a file the moment it is clean; the test fails if a listed file is clean or gone. */
export const LEGACY: string[] = [];

const PALETTES = "slate|gray|zinc|neutral|stone|red|orange|amber|yellow|lime|green|emerald|teal|cyan|sky|blue|indigo|violet|purple|fuchsia|pink|rose";
const COLOR_UTILS = "bg|text|border|ring|ring-offset|outline|decoration|divide|fill|stroke|from|via|to|accent|caret|placeholder|shadow";

export const RULES: { name: string; re: RegExp }[] = [
  { name: "raw hex colour", re: /(?<![\w&/])#(?:[0-9a-fA-F]{8}|[0-9a-fA-F]{6}|[0-9a-fA-F]{3,4})\b/ },
  { name: "rgb()/hsl() colour", re: /\b(?:rgba?|hsla?)\(/ },
  { name: "px literal", re: /\b\d+(?:\.\d+)?px\b/ },
  { name: "Tailwind palette colour", re: new RegExp(`(?<![\\w-])(?:[\\w-]+:)*(?:${COLOR_UTILS})-(?:${PALETTES})-(?:50|[1-9]00|950)\\b`) },
  { name: "white/black colour utility", re: new RegExp(`(?<![\\w-])(?:[\\w-]+:)*(?:${COLOR_UTILS})-(?:white|black)\\b`) },
  { name: "literal font-family", re: /font-family\s*:(?!\s*var\()|fontFamily\s*:(?!\s*["'`]var\()/ },
  { name: "cubic-bezier easing", re: /cubic-bezier\(/ },
];

/** Every source file under app/ (not app/api/) and components/, except tests and docs. */
function scanned(): string[] {
  const out: string[] = [];
  const walk = (dir: string) => {
    for (const name of readdirSync(dir)) {
      const full = join(dir, name);
      const rel = relative(ROOT, full).split(sep).join("/");
      if (statSync(full).isDirectory()) {
        if (rel !== "app/api") walk(full);
      } else if (/\.(tsx?|css)$/.test(name) && !/\.test\.tsx?$/.test(name) && rel !== TOKENS_FILE) {
        out.push(rel);
      }
    }
  };
  walk(join(ROOT, "app"));
  walk(join(ROOT, "components"));
  return out.sort();
}

export function violations(source: string): string[] {
  const found: string[] = [];
  source.split(/\r?\n/).forEach((line, i) => {
    for (const r of RULES) {
      const m = line.match(r.re);
      if (m) found.push(`line ${i + 1}: ${r.name} "${m[0]}"`);
    }
  });
  return found;
}

test("the scanner catches each kind of raw value", () => {
  const bad = [
    "color: #faf6ef;", "background: rgba(0,0,0,.4);", "padding: 12px;", 'className="p-[3px]"',
    'className="bg-zinc-100"', 'className="hover:text-stone-500"', 'className="bg-white"', 'className="text-black/50"',
    "font-family: Georgia, serif;", "transition: all 1s cubic-bezier(0,0,1,1);",
  ];
  for (const b of bad) assert.ok(violations(b).length > 0, `should flag: ${b}`);
});

test("the scanner allows Kiln tokens and var() utilities", () => {
  const ok = [
    'className="bg-paper text-ink border-hairline"', 'className="text-stone"', 'className="p-(--space-3) rounded-(--radius-md)"',
    "font-family: var(--font-body);", 'href="#main"', 'className="font-display shadow-sheet ease-out"',
  ];
  for (const o of ok) assert.deepEqual(violations(o), [], o);
});

test("no raw colours, sizes, font names or easings outside app/tokens.css (except LEGACY)", () => {
  const dirty = scanned()
    .filter((f) => !LEGACY.includes(f))
    .map((f) => ({ f, v: violations(readFileSync(join(ROOT, f), "utf8")) }))
    .filter((x) => x.v.length);
  assert.deepEqual(dirty, []);
});

test("LEGACY only shrinks: every listed file exists and still has raw values", () => {
  for (const f of LEGACY) {
    assert.ok(existsSync(join(ROOT, f)), `${f} is gone: remove it from LEGACY`);
    assert.ok(violations(readFileSync(join(ROOT, f), "utf8")).length > 0, `${f} is clean: remove it from LEGACY`);
  }
});

test("migration done: LEGACY is empty and Tailwind's default scales are reset to Kiln's", () => {
  assert.deepEqual(LEGACY, []);
  const css = readFileSync(join(ROOT, "app/globals.css"), "utf8");
  for (const ns of ["color", "spacing", "radius", "shadow", "font", "ease"]) {
    assert.ok(css.includes(`--${ns}-*: initial;`), `globals.css must reset --${ns}-*`);
  }
  for (let i = 1; i <= 8; i++) assert.ok(css.includes(`--spacing-${i}: var(--space-${i});`), `--spacing-${i} missing`);
  for (const r of ["sm", "md", "lg", "frame", "pill"]) assert.ok(css.includes(`--radius-${r}: var(--radius-${r});`), `--radius-${r} missing`);
});

test("app/tokens.css exists and is imported once, by app/globals.css", () => {
  assert.ok(existsSync(join(ROOT, TOKENS_FILE)));
  const importers = scanned().filter((f) => /@import\s+["']\.\/tokens\.css["']/.test(readFileSync(join(ROOT, f), "utf8")));
  assert.deepEqual(importers, ["app/globals.css"]);
});

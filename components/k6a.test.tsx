/** K6a token override (plan-kiln K6a, ADR 0012 addendum 2): control radius, display weight, grain. */
import { test } from "node:test";
import assert from "node:assert/strict";
import { readdirSync, readFileSync, statSync } from "node:fs";
import { join, relative, sep } from "node:path";
import { renderToStaticMarkup } from "react-dom/server";
import { Button } from "./kiln/Button";
import { Tag } from "./kiln/Tag";
import { TextField } from "./TextField";
import { Kbd } from "./Kbd";
import { PaperGrain } from "./PaperGrain";
import Studio, { TestsStep } from "@/app/studio";
import { DecisionForm } from "@/app/review/[id]/reviewer";

const ROOT = process.cwd();
const read = (f: string) => readFileSync(join(ROOT, f), "utf8");
const count = (html: string, needle: string) => html.split(needle).length - 1;
const RADIUS = "rounded-(--radius-control)";

/** Source .tsx files under app/ (not app/api/) and components/, tests excluded. */
function sources(): string[] {
  const out: string[] = [];
  const walk = (dir: string) => {
    for (const name of readdirSync(dir)) {
      const full = join(dir, name);
      const rel = relative(ROOT, full).split(sep).join("/");
      if (statSync(full).isDirectory()) { if (rel !== "app/api") walk(full); }
      else if (/\.tsx?$/.test(name) && !/\.test\.tsx?$/.test(name)) out.push(rel);
    }
  };
  walk(join(ROOT, "app"));
  walk(join(ROOT, "components"));
  return out;
}

/** The override block: everything after its heading, which is the last block in tokens.css. */
function overrides(): string {
  const css = read("app/tokens.css");
  const at = css.indexOf("Project overrides (ADR 0012 addendum 2)");
  assert.ok(at > 0, "tokens.css needs the 'Project overrides (ADR 0012 addendum 2)' block");
  return css.slice(at);
}

test("tokens.css ends with one override block: --radius-control 4px, mapped in @theme", () => {
  const css = read("app/tokens.css");
  assert.equal(count(css, "Project overrides (ADR 0012 addendum 2)"), 1);
  assert.match(overrides(), /--radius-control:\s*4px;/);
  assert.doesNotMatch(css.slice(0, css.indexOf("Project overrides")), /--radius-control/, "Kiln's copied lines stay untouched");
  assert.match(read("app/globals.css"), /--radius-control: var\(--radius-control\);/);
});

test("display-xl, display, heading-1 and heading-2 are redeclared at weight 400", () => {
  const o = overrides();
  for (const cls of ["display-xl", "display", "heading-1", "heading-2"]) {
    const rule = o.match(new RegExp(`(?:^|[\\s,}])\\.${cls}(?![\\w-])[^{]*\\{([^}]*)\\}`))?.[1] ?? "";
    assert.match(rule, /font-weight:\s*400/, `.${cls} at 400`);
  }
});

test("controls use --radius-control: Button (all kinds and the arrow chip), Tag, TextField, Kbd", () => {
  const primary = renderToStaticMarkup(<Button>Go</Button>);
  assert.equal(count(primary, RADIUS), 2, "the button and its arrow chip");
  assert.match(renderToStaticMarkup(<Button kind="outline">Out</Button>), /rounded-\(--radius-control\)/);
  assert.match(renderToStaticMarkup(<Tag>Level 1</Tag>), /rounded-\(--radius-control\)/);
  assert.match(renderToStaticMarkup(<TextField id="a" label="A" value="" onChange={() => {}} />), /<input[^>]*rounded-\(--radius-control\)/);
  assert.match(renderToStaticMarkup(<Kbd>Enter</Kbd>), /<kbd[^>]*rounded-\(--radius-control\)/);
});

test("--radius-pill appears only on the ChoiceList dot and Tag's live dot", () => {
  const hits = sources().flatMap((f) => read(f).split(/\r?\n/).map((line, i) => ({ f, i, line })))
    .filter((x) => x.line.includes("--radius-pill"));
  for (const h of hits) {
    const ok = h.f === "components/ChoiceList.tsx" || (h.f === "components/kiln/Tag.tsx" && h.line.includes('data-dot="live"'));
    assert.ok(ok, `${h.f}:${h.i + 1} uses --radius-pill`);
  }
  assert.ok(hits.some((h) => h.f === "components/ChoiceList.tsx"));
  const live = renderToStaticMarkup(<Tag live>Live</Tag>);
  assert.match(live, /data-dot="live"[^>]*rounded-\(--radius-pill\)/);
});

test("one filled primary per screen (start, tests step, reviewer decision)", () => {
  const filled = (html: string) => count(html, "bg-button-bg");
  assert.ok(filled(renderToStaticMarkup(<Studio />)) <= 1, "start");
  assert.equal(filled(renderToStaticMarkup(<TestsStep busy={false} send={() => {}} />)), 1, "tests step");
  assert.equal(filled(renderToStaticMarkup(<DecisionForm version={2} enabled busy={false} onDecide={async () => true} />)), 1, "reviewer");
});

test("PaperGrain: exactly one aria-hidden div, no children", () => {
  const html = renderToStaticMarkup(<PaperGrain />);
  assert.match(html, /^<div[^>]*aria-hidden="true"[^>]*><\/div>$/);
  assert.equal(count(html, "<div"), 1);
});

test("PaperGrain renders once, in app/layout.tsx", () => {
  const users = sources().filter((f) => /<PaperGrain\b/.test(read(f)));
  assert.deepEqual(users, ["app/layout.tsx"]);
  assert.equal(count(read("app/layout.tsx"), "<PaperGrain"), 1);
});

test("--grain: CSS gradients from ink via color-mix only (no image, no url, no filter)", () => {
  const o = overrides();
  const grain = o.match(/--grain:\s*([^;]+);/)?.[1] ?? "";
  assert.match(grain, /gradient\(/);
  assert.match(grain, /color-mix\(in oklab, var\(--ink\) var\(--grain-share\), transparent\)/);
  assert.doesNotMatch(grain, /url\(|filter|image-set/);
});

test("grain bound: opacity x ink share <= 0.04", () => {
  const o = overrides();
  const opacity = Number(o.match(/--grain-opacity:\s*([\d.]+);/)?.[1]);
  const share = Number(o.match(/--grain-share:\s*([\d.]+)%;/)?.[1]) / 100;
  assert.ok(opacity > 0 && share > 0, "both tokens set");
  assert.ok(opacity * share <= 0.04 + 1e-9, `opacity ${opacity} x share ${share} = ${opacity * share}`);
});

test("the grain is off under forced colours and in print, and never takes pointer events", () => {
  const css = read("app/globals.css");
  const rule = css.match(/\.paper-grain\s*\{([^}]*)\}/)?.[1] ?? "";
  assert.match(rule, /position:\s*fixed/);
  assert.match(rule, /inset:\s*0/);
  assert.match(rule, /pointer-events:\s*none/);
  assert.match(rule, /background:\s*var\(--grain\)/);
  assert.match(rule, /opacity:\s*var\(--grain-opacity\)/);
  assert.match(css, /@media \(forced-colors: active\)[^{]*\{[^}]*\.paper-grain[^{]*\{[^}]*display:\s*none/);
  assert.match(css, /@media print[^{]*\{[^}]*\.paper-grain[^{]*\{[^}]*display:\s*none/);
});

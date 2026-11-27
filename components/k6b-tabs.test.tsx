/** K6b SectionTabs (draft blueprint only) and FoldedSheet (every submitted blueprint). Server render + pure helpers. */
import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { renderToStaticMarkup } from "react-dom/server";
import type { Blueprint, Session } from "@/lib/types";
import { SectionTabs, nextTab, slideFrom } from "./SectionTabs";
import { FoldedSheet } from "./FoldedSheet";
import { BlueprintView } from "./blueprint";
import { BlueprintStep } from "@/app/studio";

const count = (html: string, needle: string) => html.split(needle).length - 1;
const plain = (html: string) => html.replace(/<[^>]+>/g, " ").replace(/&#x27;/g, "'").replace(/\s+/g, " ").trim();

/** Inner HTML of every element whose opening tag matches `open`, outermost only (React output is well-formed). */
function inside(html: string, open: RegExp): string[] {
  const out: string[] = [];
  const re = /<(\/?)([a-zA-Z0-9]+)([^>]*?)(\/?)>/g;
  const VOID = new Set(["input", "br", "img", "hr", "meta", "link", "path", "circle", "rect", "line", "polyline"]);
  let depth = 0, start = -1;
  let m: RegExpExecArray | null;
  while ((m = re.exec(html))) {
    const [whole, close, tag, , self] = m;
    if (close) { if (start >= 0 && --depth === 0) { out.push(html.slice(start, m.index)); start = -1; } continue; }
    if (self || VOID.has(tag.toLowerCase())) continue;
    if (start >= 0) { depth++; continue; }
    if (open.test(whole)) { start = re.lastIndex; depth = 1; }
  }
  return out;
}

const at = "2026-11-12T09:00:00.000Z";
const bp = (over: Partial<Blueprint> = {}): Blueprint => ({
  version: 2, draft: true, builtAt: at, title: "Finance helper", idea: "Finance helper",
  spec: [{ key: "users", label: "Who uses it", value: "Sophomores", filledBy: "requester" }],
  data: { maxLevel: 1, allowed: true, sources: [], summary: "All sources are Level 1–2." },
  scope: { key: "guided", label: "Guided answers", risk: "Medium", desc: "d", model: "Claude Haiku 4.5", knobs: { studentsPerMonth: 1200, convsPerStudent: 3 } },
  knowledge: [{ title: "Finance, B.S.", url: "https://bulletins.psu.edu/finance", fetchedAt: "2026-11-03T00:00:00Z", level: 1 }],
  instructions: { text: "You answer change-of-major questions.", draftedBy: "template" },
  tests: { status: "not-run", note: "Not run yet." },
  log: [{ at, who: "requester", what: "Chose Guided answers" }],
  costNote: "Estimate. Not a quote.",
  ...over,
} as Blueprint);

// Pure helpers.
test("nextTab: arrows wrap, Home and End jump, other keys do nothing", () => {
  assert.equal(nextTab("ArrowRight", 0, 4), 1);
  assert.equal(nextTab("ArrowRight", 3, 4), 0);
  assert.equal(nextTab("ArrowLeft", 0, 4), 3);
  assert.equal(nextTab("ArrowLeft", 2, 4), 1);
  assert.equal(nextTab("Home", 2, 4), 0);
  assert.equal(nextTab("End", 1, 4), 3);
  assert.equal(nextTab("Enter", 1, 4), null);
  assert.equal(nextTab("ArrowDown", 1, 4), null);
});

test("slideFrom: a later tab comes in from the right, an earlier one from the left, the same one not at all", () => {
  assert.equal(slideFrom(0, 2), "right");
  assert.equal(slideFrom(3, 1), "left");
  assert.equal(slideFrom(1, 1), null);
});

// The component.
test("SectionTabs SSR: a tablist, the first tab selected, every panel in the markup, the rest hidden", () => {
  const html = renderToStaticMarkup(<SectionTabs id="t" label="Blueprint sections" tabs={[
    { key: "a", name: "A", panel: <p>pa</p> }, { key: "b", name: "B", panel: <p>pb</p> }, { key: "c", name: "C", panel: <p>pc</p> },
  ]} />);
  assert.match(html, /role="tablist"[^>]*aria-label="Blueprint sections"/);
  assert.equal(count(html, 'role="tab"'), 3);
  assert.equal(count(html, 'aria-selected="true"'), 1);
  assert.match(html, /id="t-tab-a"[^>]*aria-selected="true"|aria-selected="true"[^>]*id="t-tab-a"/);
  const tabs = [...html.matchAll(/<button[^>]*role="tab"[^>]*>/g)].map((m) => m[0]);
  assert.deepEqual(tabs.map((t) => /tabindex="0"/.test(t)), [true, false, false], "roving tabindex: one tab stop in the list");
  assert.equal(count(html, 'role="tabpanel"'), 3);
  assert.equal([...html.matchAll(/role="tabpanel"[^>]*hidden=""/g)].length, 2);
  for (const k of ["a", "b", "c"]) assert.match(html, new RegExp(`id="t-panel-${k}"[^>]*aria-labelledby="t-tab-${k}"|aria-labelledby="t-tab-${k}"[^>]*id="t-panel-${k}"`));
  assert.match(plain(html), /pa pb pc/, "inactive panels stay in the markup (print shows them all)");
});

test("SectionTabs: the selected tab is an ink underline with no fill, in .label; the slide is off under reduced motion", () => {
  const html = renderToStaticMarkup(<SectionTabs id="t" label="L" tabs={[{ key: "a", name: "A", panel: "x" }, { key: "b", name: "B", panel: "y" }]} />);
  const sel = html.match(/<button[^>]*aria-selected="true"[^>]*>/)?.[0] ?? "";
  assert.match(sel, /\blabel\b/);
  assert.match(sel, /border-b-2/);
  assert.match(sel, /border-ink/);
  assert.doesNotMatch(sel, /\bbg-/);
  const css = readFileSync(join(process.cwd(), "app/globals.css"), "utf8");
  assert.match(css, /@starting-style/);
  assert.match(css, /\.tab-panel\[data-from="right"\]/);
  assert.match(css, /@media \(prefers-reduced-motion: reduce\)\s*\{\s*\.tab-panel\s*\{\s*transition:\s*none/);
  assert.match(css, /@media print\s*\{[^}]*\[role="tabpanel"\]\[hidden\]/);
  assert.doesNotMatch(css.match(/\.tab-panel\s*\{[^}]*\}/)?.[0] ?? "", /height/, "no height animation");
});

// The requester's draft blueprint.
const draftHtml = () => renderToStaticMarkup(<BlueprintView blueprint={bp()} audience="requester" />);

test("draft blueprint: four tabs in order, Summary first, Tests says 'not run'", () => {
  const names = [...draftHtml().matchAll(/<button[^>]*role="tab"[^>]*>([\s\S]*?)<\/button>/g)].map((m) => plain(m[1]));
  assert.deepEqual(names, ["Summary", "Tests · not run", "Decisions", "Export"]);
});

test("draft blueprint: Summary holds Spec, Data, Scope, Knowledge; Export holds the instructions and the ExportBar; Decisions the log", () => {
  const panels = inside(draftHtml(), /role="tabpanel"/).map(plain);
  assert.equal(panels.length, 4);
  for (const s of ["Spec", "Data", "Scope", "Knowledge"]) assert.match(panels[0], new RegExp(s));
  assert.match(panels[1], /Not run yet\./);
  assert.match(panels[2], /Chose Guided answers/);
  assert.match(panels[3], /You answer change-of-major questions\./);
  assert.match(panels[3], /Download Markdown/);
  assert.match(panels[3], /Copy for AI Studio/);
});

test("draft blueprint: the SpecSheet facts stay above the tablist; no fold on a draft", () => {
  const html = draftHtml();
  assert.ok(html.indexOf("Est. cost / month") < html.indexOf('role="tablist"'));
  assert.doesNotMatch(html, /folded-sheet/);
});

const session = (over: Partial<Session> = {}): Session => ({
  id: "s1", step: "blueprint", idea: "x", slots: [], sources: [], asked: 6,
  knobs: { studentsPerMonth: 1200, convsPerStudent: 3 },
  review: { reviewId: "r1", version: 1, status: "changes", submittedAt: at, note: "Add the GPA source." },
  log: [{ at, who: "tool", what: "Blocked: the run is out of date.", kind: "blocked" }],
  ...over,
} as Session);

test("Submit and every Notice from the screen state render outside all tabpanels", () => {
  const html = renderToStaticMarkup(<BlueprintStep session={session()} blueprint={bp()} busy={false} error="Something failed." send={() => {}} onNewIdea={() => {}} />);
  const panels = inside(html, /role="tabpanel"/).join("\n");
  assert.match(html, /id="submit-blueprint"/);
  assert.doesNotMatch(panels, /id="submit-blueprint"/);
  const notices = [...inside(html, /role="(status|alert)"/)].map(plain).filter(Boolean);
  for (const n of ["Something failed.", "Add the GPA source.", "Blocked: the run is out of date."]) {
    assert.ok(notices.some((t) => t.includes(n)), `notice missing: ${n}`);
    assert.ok(!plain(panels).includes(n), `${n} sits inside a tabpanel`);
  }
  assert.ok(html.indexOf('id="submit-blueprint"') < html.indexOf('role="tablist"'), "Submit is above the tablist");
});

test("a submitted blueprint (reviewer, or the requester's review step) has no tablist", () => {
  assert.doesNotMatch(renderToStaticMarkup(<BlueprintView blueprint={bp({ draft: false })} audience="reviewer" />), /role="tablist"/);
  assert.doesNotMatch(renderToStaticMarkup(<BlueprintView blueprint={bp({ draft: false })} audience="requester" />), /role="tablist"/);
});

// FoldedSheet.
test("FoldedSheet: a submitted blueprint gets the fold wrapper; a draft doesn't", () => {
  assert.match(renderToStaticMarkup(<BlueprintView blueprint={bp({ draft: false })} audience="reviewer" />), /class="[^"]*folded-sheet/);
  assert.match(renderToStaticMarkup(<BlueprintView blueprint={bp({ draft: false })} audience="requester" />), /class="[^"]*folded-sheet/);
  assert.doesNotMatch(draftHtml(), /folded-sheet/);
});

test("FoldedSheet: v{n} appears once, and the padding clears the fold (both --space-4)", () => {
  const html = renderToStaticMarkup(<BlueprintView blueprint={bp({ draft: false })} audience="reviewer" />);
  assert.equal((plain(html).match(/\bv2\b/g) ?? []).length, 1);
  const sheet = renderToStaticMarkup(<FoldedSheet><p>x</p></FoldedSheet>);
  assert.match(sheet, /class="[^"]*folded-sheet[^"]*p-\(--space-4\)|class="[^"]*p-\(--space-4\)[^"]*folded-sheet/);
  const css = readFileSync(join(process.cwd(), "app/globals.css"), "utf8");
  const rule = css.match(/\.folded-sheet\s*\{([^}]*)\}/)?.[1] ?? "";
  assert.match(rule, /clip-path:\s*polygon\([^;]*var\(--space-4\)/);
  assert.doesNotMatch(rule, /shadow/);
  assert.match(css, /\.folded-sheet::before\s*\{[^}]*var\(--stone\)/);
  assert.match(css, /@media \(forced-colors: active\)\s*\{[^}]*\.folded-sheet[^{]*\{[^}]*clip-path:\s*none/);
  assert.match(css, /@media print\s*\{[^@]*\.folded-sheet[^{]*\{[^}]*clip-path:\s*none/);
});

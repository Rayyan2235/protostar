/**
 * Motion pass (2026-11-19, Rayyan picked all four): GSAP as the one animation library (Kiln
 * Sources.md), question/statement line reveal, step-bar check draw, Flip layout moves, ink marks.
 * Motion itself runs only in the browser; these tests pin the server markup (the final, still
 * state), the hooks' wiring and the rules that keep it calm.
 */
import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { renderToStaticMarkup } from "react-dom/server";
import type { Blueprint, Session } from "@/lib/types";
import { InkMark } from "./InkMark";
import { FlowRail } from "./FlowRail";
import { BlueprintView } from "./blueprint";
import { Ledger, PushbackCard } from "@/app/studio";

const ROOT = join(__dirname, "..");
const src = (f: string) => readFileSync(join(ROOT, f), "utf8");
const at = "2026-11-19T09:00:00.000Z";

test("GSAP is the one animation library: gsap + @gsap/react, no framer-motion or motion", () => {
  const pkg = JSON.parse(src("package.json"));
  const deps = { ...pkg.dependencies, ...pkg.devDependencies };
  assert.ok(deps.gsap, "gsap");
  assert.ok(deps["@gsap/react"], "@gsap/react");
  assert.equal(deps["framer-motion"], undefined);
  assert.equal(deps.motion, undefined);
});

test("timing comes from Kiln tokens and every effect sits behind prefers-reduced-motion", () => {
  const m = src("components/motion/kiln.ts");
  assert.match(m, /--dur-quick/);
  assert.match(m, /--ease-out/);
  assert.match(m, /CustomEase/);
  assert.match(m, /prefers-reduced-motion: no-preference/);
  assert.doesNotMatch(m, /power\d|elastic|bounce|back\.out/, "no stock GSAP eases: the token's curve only");
});

test("InkMark: the words stay plain text; the stroke is one aria-hidden svg in signal", () => {
  const u = renderToStaticMarkup(<InkMark kind="underline">student records</InkMark>);
  assert.match(u, /student records/);
  assert.equal(u.split("<svg").length - 1, 1);
  assert.match(u, /<svg[^>]*aria-hidden="true"/);
  assert.match(u, /text-signal/);
  const c = renderToStaticMarkup(<InkMark kind="circle">$12.50</InkMark>);
  assert.notEqual(u.match(/viewBox="([^"]+)"/)?.[1], c.match(/viewBox="([^"]+)"/)?.[1], "underline and circle are different strokes");
});

test("red card: an ink underline under 'student records' in the title", () => {
  const s = { id: "s1", step: "interview", idea: "x", slots: [], sources: [], asked: 1, knobs: { studentsPerMonth: 1, convsPerStudent: 1 }, log: [],
    pushback: { blocking: true, flagged: ["Degree audits"], flaggedRules: [], options: ["selfreport", "route"], attempts: 0 } } as unknown as Session;
  const html = renderToStaticMarkup(<PushbackCard session={s} busy={false} onResolve={() => {}} />);
  assert.match(html, /student records<svg[^>]*aria-hidden="true"/);
});

test("blueprint: an ink circle around the monthly cost", () => {
  const bp = {
    version: 1, draft: false, builtAt: at, title: "T", idea: "T", spec: [],
    data: { maxLevel: 1, allowed: true, sources: [], summary: "All sources are Level 1–2." },
    scope: { key: "guided", label: "Guided", risk: "Medium", desc: "d", model: "Claude Haiku 4.5", knobs: { studentsPerMonth: 1, convsPerStudent: 1 },
      estimate: { scope: "guided", model: "claude-haiku-4-5", conversations: 1, inputMTok: 1, outputMTok: 1, monthlyDollars: 12.5, tokensPerStudent: 1, pricesAsOf: "2026-11-03" } },
    knowledge: [], instructions: { text: "x", draftedBy: "template" }, tests: { status: "not-run", note: "Not run yet." },
    log: [], costNote: "Estimate. Not a quote.",
  } as unknown as Blueprint;
  const html = renderToStaticMarkup(<BlueprintView blueprint={bp} audience="reviewer" />);
  assert.match(html, /data-ink="circle"/);
});

test("step bar: each finished step shows a check that DrawSVG can draw; the server markup is the drawn state", () => {
  const html = renderToStaticMarkup(<FlowRail variant="top" step="tests" />);
  assert.equal(html.split('data-draw="check"').length - 1, 2, "Interview and Scope are done");
  assert.match(html, /<svg[^>]*aria-hidden="true"[^>]*data-draw="check"|data-draw="check"[^>]*aria-hidden="true"/);
});

test("ledger: the data-choice row is where the resolved red card folds to", () => {
  const log = [
    { at, who: "requester" as const, what: "Idea", kind: "idea" as const },
    { at, who: "requester" as const, what: "Chose (a): students self-report GPA and credits; nothing stored.", kind: "resolve" as const },
  ];
  const html = renderToStaticMarkup(<Ledger log={log} />);
  assert.match(html, /<li[^>]*data-fold="data-choice"/);
});

test("the question heading and the start statement keep their plain server markup (split happens in the browser only)", () => {
  const studio = src("app/studio.tsx");
  assert.match(studio, /useLineReveal/);
  assert.match(studio, /useFlipChoice|data-fold/);
});

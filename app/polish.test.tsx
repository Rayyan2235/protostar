/** Polish pass on fe/kiln (2026-11-17, Rayyan: "continue beautifying"): layout and clarity fixes found in a browser walk. */
import { test } from "node:test";
import assert from "node:assert/strict";
import { renderToStaticMarkup } from "react-dom/server";
import type { Session } from "@/lib/types";
import { SCENARIO } from "@/lib/scenario";
import { TopBar } from "@/components/TopBar";
import { ModeBadge } from "@/components/ModeBadge";
import { Composer, Ledger, PushbackCard, SpecPanel } from "./studio";

const text = (html: string) => html.replace(/<[^>]+>/g, " ").replace(/\s+/g, " ");
const at = "2026-11-17T09:00:00.000Z";

const session = (over: Partial<Session> = {}): Session => ({
  id: "s1", step: "interview", idea: "Something that helps students switch into Finance.",
  slots: [{ key: "users", value: "Sophomores thinking about Finance", filledBy: "prefill", confidence: 0.9 }],
  sources: [{ name: "Undergraduate Bulletin", level: 1, decidedBy: "rule", reason: "Published public pages are Level 1." }],
  question: { slot: "never", ask: "What must it never do?", chips: ["Promise admission"] },
  asked: 1,
  knobs: { studentsPerMonth: 1200, convsPerStudent: 3 },
  log: [
    { at, who: "requester", what: "Something that helps students switch into Finance.", kind: "idea" },
    { at, who: "tool", what: "Who uses it?", kind: "question" },
    { at, who: "requester", what: "Sophomores", kind: "answer" },
    { at, who: "tool", what: "Flagged degree audits (Level 3).", kind: "flag" },
  ],
  ...over,
});

const blocking = { blocking: true, flagged: ["Degree audits"], flaggedRules: [], options: ["selfreport", "route"] as ("selfreport" | "route")[], attempts: 0 };

// Browser walk: a StatusStrip message pushed "New idea" to a second row at 1024px,
// and on a phone the subtitle wrapped, so the bar was three rows tall.
test("top bar stays one row: no wrapping, the subtitle only from xl up, actions never shrink", () => {
  const html = renderToStaticMarkup(<TopBar title="Protostar" subtitle="Agent spec builder · prototype"><span id="action">New idea</span></TopBar>);
  assert.doesNotMatch(html, /flex-wrap/, "nothing in the bar wraps");
  // At 1024px the subtitle squeezed "Sent v1 to the reviewer" to "Sent v1 to the rev…".
  assert.match(html, /<p class="[^"]*\bhidden\b[^"]*\bxl:block\b[^"]*"[^>]*>Agent spec builder · prototype<\/p>/);
  assert.match(html, /<div class="[^"]*\bshrink-0\b[^"]*"[^>]*><span id="action">/, "actions keep their width; the strip truncates instead");
});

test("mode badge: the full words from sm up, a short form on phones", () => {
  const html = renderToStaticMarkup(<ModeBadge mode="offline" />);
  assert.match(html, /<span class="hidden sm:inline">Offline script · no model calls<\/span>/);
  assert.match(html, /<span class="sm:hidden">Offline<\/span>/);
});

// After the interview the whole Q&A repeated under scope, tests and the blueprint.
test("ledger: collapsed into a closed details after the interview, with the count of answers", () => {
  const html = renderToStaticMarkup(<Ledger log={session().log} collapsed />);
  assert.match(html, /<details/);
  assert.doesNotMatch(html, /<details[^>]*\bopen\b/);
  assert.match(text(html), /Your answers, as given \(2\)/, "idea + one answer; the tool's flag line isn't counted");
  assert.match(text(html), /Who uses it\? Sophomores/, "the rows are still in the markup");
});

test("ledger: open and plain during the interview (no details)", () => {
  const html = renderToStaticMarkup(<Ledger log={session().log} />);
  assert.doesNotMatch(html, /<details/);
  assert.match(text(html), /Your answers, as given/);
});

// The options were small buttons with their explanation floating loose underneath.
test("pushback: each option is one choice card, its explanation inside the button", () => {
  const html = renderToStaticMarkup(<PushbackCard session={session({ pushback: blocking })} busy={false} onResolve={() => {}} />);
  const sr = SCENARIO.pushback.options.selfreport;
  const card = html.match(/<button[^>]*id="pushback-0"[^>]*>([\s\S]*?)<\/button>/)?.[1] ?? "";
  assert.ok(card.includes(sr.title), "title inside");
  assert.ok(text(card).includes(sr.detail), "explanation inside");
  assert.match(html, /<button[^>]*id="pushback-0"[^>]*aria-describedby="pushback-0-detail"/);
  assert.match(html, /id="pushback-0-detail"/);
  assert.match(html, /id="pushback-1"/);
  assert.match(text(html), /Keep it anyway/);
});

// "Thinking…" used to replace the whole question area, so the screen emptied while it waited.
test("thinking: the asked question stays on screen, the field goes, a busy line says so", () => {
  const html = renderToStaticMarkup(<Composer session={session()} busy text="" setText={() => {}} onAnswer={() => {}} onResolve={() => {}} />);
  assert.match(html, /What must it never do\?/);
  assert.match(html, /aria-busy="true"/);
  assert.match(text(html), /Thinking…/);
  assert.doesNotMatch(html, /id="answer"/);
});

// Kiln: mono is for labels, not sentences.
test("spec panel: the data-levels footnote is body text, not a mono label", () => {
  const html = renderToStaticMarkup(<SpecPanel session={session()} busy={false} onEdit={() => {}} />);
  assert.match(html, /Levels: Penn State data classes/);
  assert.doesNotMatch(html, /<p class="label[^"]*">Levels:/);
});

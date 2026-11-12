/** K3 screens on Kiln parts (plan-kiln §3 K3): blueprint, export bar, mode badge, reviewer panels. Server render only. */
import { test } from "node:test";
import assert from "node:assert/strict";
import { renderToStaticMarkup } from "react-dom/server";
import type { Blueprint, ReviewView } from "@/lib/types";
import { BlueprintView, ExportBar, SourceItem } from "./blueprint";
import { ModeBadge } from "./ModeBadge";
import { DecisionForm, Rounds, StatusNotice } from "@/app/review/[id]/reviewer";

const count = (html: string, needle: string) => html.split(needle).length - 1;
const text = (html: string) => html.replace(/<[^>]+>/g, " ").replace(/\s+/g, " ");

const bp = (over: Partial<Blueprint> = {}): Blueprint => ({
  version: 2,
  draft: false,
  builtAt: "2026-11-12T09:00:00.000Z",
  title: "Something that helps students figure out if they can switch into Finance.",
  idea: "Something that helps students figure out if they can switch into Finance.",
  spec: [
    { key: "users", label: "Who uses it", value: "Sophomores thinking about Finance", filledBy: "prefill", confidence: 0.9 },
    { key: "top", label: "Top questions", value: "Can I switch?", filledBy: "requester" },
    { key: "never", label: "Must never", value: "Promise admission", filledBy: "requester" },
    { key: "examples", label: "Great vs. bad answer", value: "", filledBy: "requester" },
    { key: "sources", label: "Reads from", value: "The bulletin", filledBy: "requester",
      note: "Mentions degree audits. The data choice applies: Students describe their own record." },
    { key: "handoff", label: "Hands off when", value: "Appeals", filledBy: "requester" },
  ],
  data: {
    maxLevel: 1, allowed: true,
    sources: [{ name: "Undergraduate Bulletin", url: "https://bulletins.psu.edu/finance", level: 1, decidedBy: "rule", reason: "Published public pages are Level 1." }],
    pushback: {
      flagged: [{ name: "Students paste their degree audit", level: 3, decidedBy: "rule" }],
      choice: "selfreport", title: "Students describe their own record", rule: "Never ask for a degree audit.",
    },
    summary: "All sources are Level 1–2.",
  },
  scope: {
    key: "guided", label: "Guided answers", risk: "Medium", desc: "Answers from the pages, with hand-offs.",
    model: "Claude Haiku 4.5", knobs: { studentsPerMonth: 1200, convsPerStudent: 3 },
    estimate: { scope: "guided", model: "claude-haiku-4-5", conversations: 3600, inputMTok: 1, outputMTok: 1, monthlyDollars: 12.5, tokensPerStudent: 1000, pricesAsOf: "2026-11-03" },
  },
  knowledge: [{ title: "Finance, B.S.", url: "https://bulletins.psu.edu/finance", fetchedAt: "2026-11-03T00:00:00Z", level: 1 }],
  instructions: { text: "You answer change-of-major questions.", draftedBy: "template" },
  tests: { status: "not-run", note: "Not run yet: the test run needs live models." },
  log: [{ at: "2026-11-12T09:00:00.000Z", who: "requester", what: "Chose Guided answers" }],
  costNote: "Estimate from public list prices (Anthropic, 2026-11-03). Not a quote.",
  ...over,
} as Blueprint);

test("BlueprintView leads with a SpecSheet of 7 facts: version, title, date", () => {
  const html = renderToStaticMarkup(<BlueprintView blueprint={bp()} audience="reviewer" status="Waiting for a decision" />);
  assert.match(html, /<article[^>]*aria-label="Blueprint v2"/);
  assert.match(html, /<h2[^>]*>Something that helps students/);
  const labels = [...html.matchAll(/<dt[^>]*>([^<]+)<\/dt>/g)].map((m) => m[1]);
  for (const l of ["Scope", "Model", "Est. cost / month", "Highest data level", "Data choice", "Tests", "Status"]) {
    assert.ok(labels.includes(l), `missing SpecSheet row ${l}`);
  }
  assert.match(text(html), /v2/);
  assert.match(text(html), /2026-11-12/);
  assert.match(text(html), /Waiting for a decision/);
});

test("the cost sits next to its estimate note", () => {
  const html = renderToStaticMarkup(<BlueprintView blueprint={bp()} audience="reviewer" />);
  const row = html.match(/Est\. cost \/ month<\/dt>[\s\S]*?<\/dd>/)?.[0] ?? "";
  assert.match(row, /\$12\.50/);
  assert.match(row, /Not a quote\./);
});

test("no list price: the cost row says so, still with the note", () => {
  const b = bp();
  const html = renderToStaticMarkup(<BlueprintView blueprint={{ ...b, scope: { ...b.scope, estimate: undefined } }} audience="reviewer" />);
  const row = html.match(/Est\. cost \/ month<\/dt>[\s\S]*?<\/dd>/)?.[0] ?? "";
  assert.match(row, /No list price/);
  assert.match(row, /Not a quote\./);
});

test("a draft says it is a draft and which version it becomes", () => {
  const html = renderToStaticMarkup(<BlueprintView blueprint={bp({ draft: true })} audience="requester" />);
  assert.match(text(html), /Draft/);
  assert.match(text(html), /becomes v2/);
});

test("who filled each spec row is said in words", () => {
  const req = text(renderToStaticMarkup(<BlueprintView blueprint={bp()} audience="requester" />));
  assert.match(req, /Filled by the tool/);
  assert.match(req, /You/);
  const rev = text(renderToStaticMarkup(<BlueprintView blueprint={bp()} audience="reviewer" />));
  assert.match(rev, /Requester/);
  assert.match(rev, /Not answered/);
});

test("the pushback is a Notice and keeps the flagged level in words", () => {
  const html = renderToStaticMarkup(<BlueprintView blueprint={bp()} audience="reviewer" />);
  assert.match(html, /role="status"[^>]*>[\s\S]*Flagged and removed/);
  assert.match(text(html), /Students paste their degree audit Level 3/);
  assert.match(text(html), /Never ask for a degree audit\./);
});

test("data levels show the word Level, not a bare code", () => {
  const html = renderToStaticMarkup(<ul><SourceItem src={bp().data.sources[0]} /></ul>);
  assert.match(text(html), /Level 1/);
  assert.match(text(html), /by rule/);
  assert.match(text(html), /Published public pages are Level 1\./);
  assert.doesNotMatch(html, /title="/);
});

test("ExportBar has three outline buttons and no pill", () => {
  const html = renderToStaticMarkup(<ExportBar blueprint={bp()} />);
  assert.equal(count(html, "<button"), 3);
  assert.equal(count(html, 'data-chip="arrow"'), 0);
  assert.match(html, /Download Markdown/);
  assert.match(html, /role="status"/);
});

test("ModeBadge says the mode in words; live models get the live dot", () => {
  assert.match(renderToStaticMarkup(<ModeBadge mode="offline" />), /Offline script · no model calls/);
  assert.doesNotMatch(renderToStaticMarkup(<ModeBadge mode="offline" />), /data-dot/);
  const live = renderToStaticMarkup(<ModeBadge mode="anthropic" />);
  assert.match(live, /Live models · anthropic/);
  assert.match(live, /data-dot="live"/);
  assert.match(renderToStaticMarkup(<ModeBadge mode="misconfigured: no key" />), /misconfigured: no key/);
});

const view = (over: Partial<ReviewView> = {}): ReviewView => ({
  reviewId: "r1", status: "pending", blueprint: bp(),
  rounds: [
    { version: 1, submittedAt: "2026-11-12T09:00:00.000Z", openedAt: "2026-11-12T09:01:00.000Z", decidedAt: "2026-11-12T09:05:00.000Z", status: "changes", note: "Add the GPA source.", minutes: 4 },
    { version: 2, submittedAt: "2026-11-12T10:00:00.000Z", status: "pending" },
  ],
  expertMinutes: 4,
  ...over,
} as ReviewView);

test("DecisionForm: Approve is the one pill; changes and reject are outlined", () => {
  const html = renderToStaticMarkup(<DecisionForm enabled busy={false} onDecide={async () => true} />);
  assert.equal(count(html, 'data-chip="arrow"'), 1);
  assert.equal(count(html, "<button"), 3);
  assert.match(html, /<label[^>]*for="review-note"/);
  assert.match(html, /<textarea[^>]*id="review-note"/);
});

test("DecisionForm disabled: no pill arrow, controls disabled, says why", () => {
  const html = renderToStaticMarkup(<DecisionForm enabled={false} busy={false} onDecide={async () => true} />);
  assert.equal(count(html, 'data-chip="arrow"'), 0);
  assert.equal(count(html, 'disabled=""'), 4);
  assert.match(text(html), /Nothing to decide right now\./);
});

test("StatusNotice speaks each state in words", () => {
  assert.match(text(renderToStaticMarkup(<StatusNotice view={view()} />)), /v2 · waiting for your decision/);
  assert.match(text(renderToStaticMarkup(<StatusNotice view={view({ status: "changes", rounds: [{ ...view().rounds[0], status: "changes" }], blueprint: bp({ version: 1 }) })} />)), /You asked for changes on v1: Add the GPA source\./);
  assert.match(text(renderToStaticMarkup(<StatusNotice view={view({ status: "approved" })} />)), /Approved v2/);
  const rejected = renderToStaticMarkup(<StatusNotice view={view({ status: "rejected", rounds: [{ ...view().rounds[0], status: "rejected", note: "Out of scope." }] })} />);
  assert.match(rejected, /role="alert"/);
  assert.match(text(rejected), /Rejected v2/);
});

test("Rounds lists each version with its outcome and the expert minutes", () => {
  const t = text(renderToStaticMarkup(<Rounds view={view()} />));
  assert.match(t, /v1 · Changes requested/);
  assert.match(t, /4 min/);
  assert.match(t, /v2 · Waiting/);
  assert.match(t, /minutes from first open of the link to decision/);
});

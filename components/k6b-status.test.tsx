/** K6b StatusStrip + copy morph (plan-kiln K6b). Server render plus pure stores; fake timers. */
import { test, mock } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { renderToStaticMarkup } from "react-dom/server";
import type { ReactNode } from "react";
import type { Blueprint, ReviewView, Session } from "@/lib/types";
import { REPEAT_MS, SETTLE_MS, StatusProvider, createStatusStore, type Say } from "./StatusStrip";
import { CopyButtonView, runCopy } from "./CopyButton";
import { TopBar } from "./TopBar";
import { ExportBar } from "./blueprint";
import { BlueprintStep, ReviewCard, SpecPanel } from "@/app/studio";
import { StatusNotice } from "@/app/review/[id]/reviewer";

const count = (html: string, needle: string) => html.split(needle).length - 1;
const plain = (html: string) => html.replace(/<[^>]+>/g, " ").replace(/&#x27;/g, "'").replace(/\s+/g, " ").trim();

/**
 * Text of every live element (role=status|alert or aria-live), outermost only, from server markup.
 * A tiny tag walker: enough for React's well-formed output.
 */
export function liveTexts(html: string): string[] {
  const out: string[] = [];
  const re = /<(\/?)([a-zA-Z0-9]+)([^>]*?)(\/?)>/g;
  const VOID = new Set(["input", "br", "img", "hr", "meta", "link", "path", "circle", "rect", "line", "polyline"]);
  let depth = 0;
  let start = -1;
  let m: RegExpExecArray | null;
  while ((m = re.exec(html))) {
    const [, close, tag, attrs, self] = m;
    if (close) {
      if (start >= 0 && --depth === 0) { out.push(plain(html.slice(start, m.index))); start = -1; }
      continue;
    }
    if (self || VOID.has(tag.toLowerCase())) continue;
    if (start >= 0) { depth++; continue; }
    if (/\brole="(status|alert)"|\baria-live="/.test(attrs)) { start = re.lastIndex; depth = 1; }
  }
  return out;
}
const liveWith = (html: string, msg: string) => liveTexts(html).filter((t) => t.includes(msg)).length;

const at = "2026-11-12T09:00:00.000Z";
const bp = { version: 2, draft: false, builtAt: at, title: "Finance helper", idea: "Finance helper",
  spec: [], data: { maxLevel: 1, allowed: true, sources: [], summary: "All Level 1." },
  scope: { key: "guided", label: "Guided answers", risk: "Medium", desc: "d", model: "Claude Haiku 4.5", knobs: { studentsPerMonth: 1200, convsPerStudent: 3 } },
  knowledge: [], instructions: { text: "t", draftedBy: "template" }, tests: { status: "not-run", note: "Not run." },
  log: [], costNote: "Estimate. Not a quote." } as unknown as Blueprint;
const session = (over: Partial<Session> = {}): Session => ({
  id: "s1", step: "blueprint", idea: "Finance helper",
  slots: [{ key: "users", value: "Sophomores", filledBy: "requester" }],
  sources: [], asked: 1, knobs: { studentsPerMonth: 1200, convsPerStudent: 3 }, log: [],
  ...over,
} as Session);
const withStrip = (msg: string, body: ReactNode) => renderToStaticMarkup(
  <StatusProvider initial={msg}><TopBar title="Protostar" />{body}</StatusProvider>);

// The store: a new text, the same text twice, the settle.
test("say: a new text shows at once and is fresh; it settles after 3 s and stays", () => {
  mock.timers.enable({ apis: ["setTimeout"] });
  try {
    const s = createStatusStore();
    s.say("Saved");
    assert.deepEqual(s.get(), { text: "Saved", fresh: true });
    mock.timers.tick(SETTLE_MS - 1);
    assert.equal(s.get().fresh, true);
    mock.timers.tick(1);
    assert.deepEqual(s.get(), { text: "Saved", fresh: false }, "settled, but the text stays (WCAG 2.2.1)");
    mock.timers.tick(60_000);
    assert.equal(s.get().text, "Saved");
  } finally { mock.timers.reset(); }
});

test("say: the same text twice clears, then sets again after the repeat delay (~120 ms)", () => {
  mock.timers.enable({ apis: ["setTimeout"] });
  try {
    const s = createStatusStore();
    const seen: string[] = [];
    s.subscribe(() => seen.push(s.get().text));
    s.say("Copied the review link");
    s.say("Copied the review link");
    assert.equal(s.get().text, "", "cleared first");
    assert.ok(REPEAT_MS >= 100 && REPEAT_MS <= 150);
    mock.timers.tick(REPEAT_MS);
    assert.deepEqual(s.get(), { text: "Copied the review link", fresh: true });
    assert.deepEqual(seen, ["Copied the review link", "", "Copied the review link"]);
  } finally { mock.timers.reset(); }
});

test("say: a different text replaces the old one and restarts the settle", () => {
  mock.timers.enable({ apis: ["setTimeout"] });
  try {
    const s = createStatusStore();
    s.say("Saved");
    mock.timers.tick(2000);
    s.say("Copied for AI Studio");
    mock.timers.tick(2000);
    assert.deepEqual(s.get(), { text: "Copied for AI Studio", fresh: true });
    mock.timers.tick(1000);
    assert.equal(s.get().fresh, false);
  } finally { mock.timers.reset(); }
});

test("say takes words only: no tone, colour or icon parameter", () => {
  const say: Say = (text: string) => void text;
  // @ts-expect-error a second argument (a tone) is not allowed
  say("Saved", "danger");
  assert.equal(createStatusStore().say.length, 1);
});

// The strip in the top bar.
test("TopBar has exactly one role=status, empty in the server markup", () => {
  const html = renderToStaticMarkup(<TopBar title="Protostar" subtitle="x" />);
  assert.equal(count(html, 'role="status"'), 1);
  assert.deepEqual(liveTexts(html), [""]);
});

test("the strip never scrolls the bar: it can shrink and truncate, and widens by transform", () => {
  const html = renderToStaticMarkup(<StatusProvider initial="Saved"><TopBar title="Protostar" /></StatusProvider>);
  const strip = html.match(/<p[^>]*role="status"[^>]*>/)?.[0] ?? "";
  assert.match(strip, /min-w-0/);
  assert.match(strip, /truncate/);
  assert.match(html, /scale-x-/);
  assert.match(html, /motion-reduce:transition-none/);
});

// Render-level count: each action's message sits in exactly one live element.
test("save: 'Saved' is in exactly one live element", () => {
  const html = withStrip("Saved", <SpecPanel session={session({ step: "interview" })} busy={false} onEdit={() => {}} />);
  assert.equal(liveWith(html, "Saved"), 1);
});

test("copy link: 'Copied the review link' is in exactly one live element (the old local span is gone)", () => {
  const html = withStrip("Copied the review link",
    <ReviewCard review={{ reviewId: "r1", version: 2, status: "pending", submittedAt: at }} />);
  assert.equal(liveWith(html, "Copied the review link"), 1);
  assert.equal(liveTexts(html).length, 1, "only the strip is live on the review card");
});

test("export: copy and download messages are each in exactly one live element", () => {
  for (const msg of ["Copied for AI Studio", "Downloaded protostar-blueprint-v2.md", "Downloaded protostar-blueprint-v2.json"]) {
    const html = withStrip(msg, <ExportBar blueprint={bp} />);
    assert.equal(liveWith(html, msg), 1, msg);
    assert.equal(liveTexts(html).length, 1, `${msg}: ExportBar has no live region of its own`);
  }
});

test("submit: 'Sent v2 to the reviewer' is in exactly one live element on the review step", () => {
  const s = session({ step: "review", review: { reviewId: "r1", version: 2, status: "pending", submittedAt: at } });
  const html = withStrip("Sent v2 to the reviewer", <BlueprintStep session={s} blueprint={bp} busy={false} send={() => {}} onNewIdea={() => {}} />);
  assert.equal(liveWith(html, "Sent v2 to the reviewer"), 1);
});

test("decide (reviewer): the decision lives in the state Notice only, never in the strip", () => {
  const view = { reviewId: "r1", status: "approved", blueprint: bp, rounds: [], expertMinutes: 0 } as unknown as ReviewView;
  const html = withStrip("", <StatusNotice view={view} />);
  assert.equal(liveWith(html, "Approved v2"), 1);
  const src = readFileSync(join(process.cwd(), "app/review/[id]/reviewer.tsx"), "utf8");
  assert.doesNotMatch(src, /\bsay\(/, "decisions are never say()'d");
});

// Copy morph.
test("runCopy: success says the message once and reports copied", async () => {
  const said: string[] = [];
  const r = await runCopy({ writeText: async () => {} }, "text", "Copied the review link", (t) => said.push(t));
  assert.equal(r, "copied");
  assert.deepEqual(said, ["Copied the review link"]);
});

test("runCopy: a clipboard rejection reports failed and says nothing", async () => {
  const said: string[] = [];
  const r = await runCopy({ writeText: async () => { throw new Error("denied"); } }, "text", "Copied", (t) => said.push(t));
  assert.equal(r, "failed");
  assert.deepEqual(said, []);
  assert.equal(await runCopy(undefined, "text", "Copied", (t) => said.push(t)), "failed", "no clipboard API");
});

test("copy button: the name never changes; the glyph is aria-hidden; the check shows only after a copy", () => {
  const props = { id: "copy-link", label: "Copy link", failText: "Couldn't copy. Select the text and copy it yourself.", onCopy: () => {} };
  const idle = renderToStaticMarkup(<CopyButtonView {...props} state="idle" />);
  const done = renderToStaticMarkup(<CopyButtonView {...props} state="copied" />);
  const failed = renderToStaticMarkup(<CopyButtonView {...props} state="failed" />);
  const name = (html: string) => plain(html.match(/<button[\s\S]*?<\/button>/)?.[0] ?? "");
  assert.equal(name(idle), "Copy link");
  assert.equal(name(done), "Copy link");
  assert.equal(name(failed), "Copy link");
  assert.match(idle, /<svg[^>]*aria-hidden="true"/);
  assert.match(idle, /data-glyph="copy"/);
  assert.match(done, /data-glyph="check"/);
  assert.doesNotMatch(idle, /data-glyph="check"/);
  assert.doesNotMatch(failed, /data-glyph="check"/);
  assert.match(failed, /role="alert"/);
  assert.match(plain(failed), /Couldn't copy\. Select the text and copy it yourself\./);
  assert.doesNotMatch(done, /role="alert"/);
  assert.match(idle, /motion-reduce:transition-none/);
});

test("both copy buttons use the morph: Copy link and Copy for AI Studio", () => {
  const card = renderToStaticMarkup(<ReviewCard review={{ reviewId: "r1", version: 2, status: "pending", submittedAt: at }} />);
  assert.match(card, /id="copy-link"[\s\S]*?data-glyph="copy"/);
  const bar = renderToStaticMarkup(<ExportBar blueprint={bp} />);
  assert.match(bar, /Copy for AI Studio[\s\S]*?data-glyph="copy"|data-glyph="copy"[\s\S]*?Copy for AI Studio/);
});

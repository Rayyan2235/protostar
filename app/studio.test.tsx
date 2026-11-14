/** K3 part 2 (plan-kiln §3 K3): studio and scope on Kiln parts, plus the five requester-page a11y fixes. */
import { test } from "node:test";
import assert from "node:assert/strict";
import { renderToStaticMarkup } from "react-dom/server";
import type { Session } from "@/lib/types";
import type { Catalog } from "@/lib/engine";
import Studio, { Composer, DoneBanner, Ledger, nextFocus, PushbackCard, SessionNotFound, SpecPanel, TestsStep } from "./studio";
import { ScopePicker, ScopeSummary } from "./scope";

const count = (html: string, needle: string) => html.split(needle).length - 1;
const text = (html: string) => html.replace(/<[^>]+>/g, " ").replace(/\s+/g, " ");
const at = "2026-11-12T09:00:00.000Z";

const session = (over: Partial<Session> = {}): Session => ({
  id: "s1", step: "interview", idea: "Something that helps students switch into Finance.",
  slots: [
    { key: "users", value: "Sophomores thinking about Finance", filledBy: "prefill", confidence: 0.9 },
    { key: "top", value: "Can I switch?", filledBy: "requester" },
  ],
  sources: [{ name: "Undergraduate Bulletin", level: 1, decidedBy: "rule", reason: "Published public pages are Level 1." }],
  question: { slot: "never", ask: "What must it never do?", chips: ["Promise admission"] },
  asked: 1,
  knobs: { studentsPerMonth: 1200, convsPerStudent: 3 },
  log: [
    { at, who: "requester", what: "Something that helps students switch into Finance.", kind: "idea" },
    { at, who: "tool", what: "Who uses it?", kind: "question" },
    { at, who: "requester", what: "Sophomores", kind: "answer" },
    { at, who: "tool", what: "Flagged degree audits (Level 3).", kind: "flag" },
    { at, who: "tool", what: "Session started.", kind: "note" },
  ],
  ...over,
});

const catalog: Catalog = {
  cheap: { model: "claude-haiku-4-5", price: { name: "Claude Haiku 4.5", inPerM: 1, outPerM: 5 } },
  capable: { model: "claude-sonnet-4-5", price: { name: "Claude Sonnet 4.5", inPerM: 3, outPerM: 15 } },
};

// a11y fix 5: ?s=<id> shows a busy loading state, never the idea form, until the session loads.
test("Studio with a session id in the link renders a busy loading state, not the idea form", () => {
  const html = renderToStaticMarkup(<Studio initialId="abc" />);
  assert.match(html, /aria-busy="true"/);
  assert.doesNotMatch(html, /id="idea"/);
});

test("Studio while the link is still being read renders the busy state too", () => {
  const html = renderToStaticMarkup(<Studio pending />);
  assert.match(html, /aria-busy="true"/);
  assert.doesNotMatch(html, /id="idea"/);
});

test("start screen (K4): a type-led statement on paper, no art, no motion switch", () => {
  const html = renderToStaticMarkup(<Studio />);
  assert.doesNotMatch(html, /role="img"/, "no scene");
  assert.doesNotMatch(html, /<svg/, "no drawn art");
  assert.doesNotMatch(html, /aria-pressed/, "nothing moves, so no Motion switch");
  assert.match(html, /<h1[^>]*class="display[^"]*"[^>]*>What do you keep answering <span[^>]*text-ink-muted[^>]*>over and over\?<\/span><\/h1>/);
  assert.match(html, /<label[^>]*for="idea"/);
  assert.equal(count(html, 'data-chip="arrow"'), 0, "the pill is disabled (no arrow) until there is text");
  assert.match(html, /Start the interview/);
  assert.match(html, /Use Dana&#x27;s example/);
});

test("start screen margin: a mono, figure-numbered flow strip and one honest aside", () => {
  const t = text(renderToStaticMarkup(<Studio />));
  assert.match(t, /01 Interview 02 Scope 03 Tests 04 Blueprint 05 Review/);
  assert.match(t, /Prototype\. Public, Level 1–2 data only\. Never student records\./);
});

// a11y fix 3: after resolve, answer, save or cancel, focus goes to the next logical control.
test("nextFocus names the next logical control for each state", () => {
  assert.equal(nextFocus(session()), "#answer");
  assert.equal(nextFocus(session({ pushback: { blocking: true, flagged: ["Degree audits"], flaggedRules: [], options: ["selfreport", "route"], attempts: 1 } })), "#pushback-0");
  assert.equal(nextFocus(session({ step: "scope", question: undefined })), '#scope-picker [role="radio"][aria-checked="true"]');
  assert.equal(nextFocus(session({ step: "tests" })), "#tests-continue");
  assert.equal(nextFocus(session({ step: "blueprint" })), "#submit-blueprint");
  assert.equal(nextFocus(session({ step: "review" })), "#copy-link");
  assert.equal(nextFocus(session({ step: "done" })), "#new-idea");
});

// a11y fixes 1 and 2: a labelled edit field named after the slot; Edit buttons with distinct names.
test("each Edit button is named after its slot", () => {
  const html = renderToStaticMarkup(<SpecPanel session={session()} busy={false} onEdit={() => {}} />);
  assert.match(text(html), /Edit Who uses it/);
  assert.match(text(html), /Edit Top questions/);
  assert.equal(count(html, "<button"), 2, "only filled slots can be edited");
});

test("the slot edit field is a labelled TextField named after the slot", () => {
  const html = renderToStaticMarkup(<SpecPanel session={session()} busy={false} onEdit={() => {}} initialEditing="users" />);
  assert.match(html, /<label[^>]*for="edit-users"[^>]*>Who uses it<\/label>/);
  assert.match(html, /<textarea[^>]*id="edit-users"/);
  assert.match(text(html), /Save/);
  assert.match(text(html), /Cancel/);
});

test("ledger (K5a): earlier Q&A as given, newest first, read-only, no live region", () => {
  const html = renderToStaticMarkup(<Ledger log={session().log} />);
  const t = text(html);
  assert.match(t, /Your answers, as given/);
  assert.match(t, /Who uses it\? Sophomores/);
  assert.match(t, /Your idea Something that helps students switch into Finance\./);
  assert.ok(t.indexOf("Flagged degree audits") < t.indexOf("Who uses it?"), "newest first");
  assert.doesNotMatch(html, /aria-live|<button|<textarea|<input/);
});

test("interview (K5a): the current question is a heading-2 and the answer field's name is that question", () => {
  const s = session();
  const html = renderToStaticMarkup(<Composer session={s} busy={false} text="" setText={() => {}} onAnswer={() => {}} onResolve={() => {}} />);
  assert.match(html, /<h2[^>]*class="heading-2[^"]*"[^>]*>What must it never do\?<\/h2>/);
  const label = html.match(/<label[^>]*for="answer"[^>]*>([^<]*)<\/label>/)?.[1];
  assert.equal(label, s.question!.ask, "accessible name = the current question");
  assert.match(text(html), /Question 2/);
  assert.match(html, /<textarea[^>]*id="answer"[^>]*class="[^"]*resize-none/);
  assert.equal(count(html, "<kbd"), 2, "Enter and Shift + Enter, in words");
  assert.match(text(html), /Promise admission/);
  assert.equal(count(html, 'data-chip="arrow"'), 0, "Send is disabled until there is text");
});

test("interview (K5a): while the pushback blocks, the Notice takes the question's place", () => {
  const s = session({ pushback: { blocking: true, flagged: ["Degree audits"], flaggedRules: [], options: ["selfreport", "route"], attempts: 1 } });
  const html = renderToStaticMarkup(<Composer session={s} busy={false} text="" setText={() => {}} onAnswer={() => {}} onResolve={() => {}} />);
  assert.match(html, /role="alert"/);
  assert.doesNotMatch(html, /What must it never do/);
  assert.doesNotMatch(html, /id="answer"/);
});

test("a missing ?s= session is a type-only EmptyState with one action", () => {
  const html = renderToStaticMarkup(<SessionNotFound onNew={() => {}} />);
  assert.match(html, /<h1[^>]*display/);
  assert.equal(count(html, "<button") + count(html, "<a "), 1);
});

test("start screen (K5a): the margin FlowRail has no active step; Enter is shown in words", () => {
  const html = renderToStaticMarkup(<Studio />);
  assert.equal(count(html, "aria-current"), 0);
  assert.match(html, /<kbd[^>]*>Enter<\/kbd>/);
  assert.match(html, /<textarea[^>]*id="idea"[^>]*class="[^"]*resize-none/);
});

test("pushback: an alert with each option as a button and a way past; no pill", () => {
  const s = session({ pushback: { blocking: true, flagged: ["Degree audits"], flaggedRules: [], options: ["selfreport", "route"], attempts: 1 } });
  const html = renderToStaticMarkup(<PushbackCard session={s} busy={false} onResolve={() => {}} />);
  assert.match(html, /role="alert"/);
  assert.match(html, /id="pushback-0"/);
  assert.match(html, /id="pushback-1"/);
  assert.match(text(html), /Keep it anyway/);
  assert.equal(count(html, 'data-chip="arrow"'), 0);
});

test("tests step: Continue is the one pill, Change scope is outlined", () => {
  const html = renderToStaticMarkup(<TestsStep busy={false} send={() => {}} />);
  assert.equal(count(html, 'data-chip="arrow"'), 1);
  assert.match(html, /id="tests-continue"/);
  assert.match(text(html), /Change scope/);
});

test("done banner: approved is a success notice with New idea", () => {
  const html = renderToStaticMarkup(<DoneBanner review={{ reviewId: "r", version: 2, status: "approved", submittedAt: at }} onNewIdea={() => {}} />);
  assert.match(text(html), /Approved: v2\./);
  assert.match(html, /id="new-idea"/);
  const rej = renderToStaticMarkup(<DoneBanner review={{ reviewId: "r", version: 1, status: "rejected", submittedAt: at, note: "Out of scope." }} onNewIdea={() => {}} />);
  assert.match(rej, /role="alert"/);
  assert.match(text(rej), /Rejected v1: Out of scope\./);
});

// a11y fix 4: scope options are a ChoiceList: one tab stop per group; arrows move and select.
test("scope picker: two radiogroups with one tab stop each, a cost SpecSheet with its note, one pill", () => {
  const html = renderToStaticMarkup(<ScopePicker session={session({ step: "scope" })} catalog={catalog} busy={false} onChoose={() => {}} />);
  assert.match(html, /id="scope-picker"/);
  assert.equal(count(html, 'role="radiogroup"'), 2);
  assert.equal(count(html, 'tabindex="0"'), 2);
  assert.match(html, /Est\. cost \/ month/);
  assert.match(text(html), /Estimate from/);
  assert.equal(count(html, 'data-chip="arrow"'), 1);
  assert.match(text(html), /Recommended/);
  assert.match(html, /<label[^>]*for="students"/);
  assert.match(html, /<label[^>]*for="convs"/);
});

test("scope cost (K5a): a live Figure in the server markup, the estimate note beside it", () => {
  const html = renderToStaticMarkup(<ScopePicker session={session({ step: "scope" })} catalog={catalog} busy={false} onChoose={() => {}} />);
  const row = html.match(/Est\. cost \/ month<\/dt>[\s\S]*?<\/dd>/)?.[0] ?? "";
  assert.match(row, /tabular-nums/);
  assert.match(row, /aria-live="polite"/);
  assert.match(row, /Estimate from/);
});

test("scope summary keeps the estimate wording next to the cost", () => {
  const s = session({ step: "tests", scope: "guided", model: { role: "cheap", name: "claude-haiku-4-5" },
    estimate: { scope: "guided", model: "Claude Haiku 4.5", conversations: 3600, inputMTok: 1, outputMTok: 1, monthlyDollars: 50.4, tokensPerStudent: 1000, pricesAsOf: "2026-11-03" } });
  const t = text(renderToStaticMarkup(<ScopeSummary session={s} />));
  assert.match(t, /\$50\.40/);
  assert.match(t, /list prices 2026-11-03/);
});

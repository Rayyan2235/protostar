/** K6b MorphNote (plan-kiln K6b, Morph Surface): keys, morph runner, reviewer decisions, spec Edit. */
import { test } from "node:test";
import assert from "node:assert/strict";
import { renderToStaticMarkup } from "react-dom/server";
import type { Session } from "@/lib/types";
import { MorphNote, noteKey, runMorph } from "./MorphNote";
import { DECISIONS, DecisionForm, decisionSubmit } from "@/app/review/[id]/reviewer";
import { SpecPanel } from "@/app/studio";

const count = (html: string, needle: string) => html.split(needle).length - 1;
const plain = (html: string) => html.replace(/<[^>]+>/g, " ").replace(/&#x27;/g, "'").replace(/\s+/g, " ").trim();
const names = (html: string) => [...html.matchAll(/view-transition-name:([\w-]+)/g)].map((m) => m[1]);

const k = (key: string, o: { ctrl?: boolean; meta?: boolean; composing?: boolean } = {}) =>
  ({ key, ctrlKey: !!o.ctrl, metaKey: !!o.meta, isComposing: !!o.composing });
const ready = { submitKey: true, empty: false, busy: false };

// The key table, as a pure function.
test("noteKey: Esc closes unless composing; plain Enter is a new line", () => {
  assert.equal(noteKey(k("Escape"), ready), "close");
  assert.equal(noteKey(k("Escape", { composing: true }), ready), "pass");
  assert.equal(noteKey(k("Enter"), ready), "pass");
  assert.equal(noteKey(k("a", { ctrl: true }), ready), "pass");
});

test("noteKey: Ctrl+Enter and Cmd+Enter submit only with submitKey; guarded while composing, empty or busy", () => {
  assert.equal(noteKey(k("Enter", { ctrl: true }), ready), "submit");
  assert.equal(noteKey(k("Enter", { meta: true }), ready), "submit");
  assert.equal(noteKey(k("Enter", { ctrl: true, composing: true }), ready), "pass");
  assert.equal(noteKey(k("Enter", { ctrl: true }), { ...ready, empty: true }), "block");
  assert.equal(noteKey(k("Enter", { meta: true }), { ...ready, busy: true }), "block");
  assert.equal(noteKey(k("Enter", { ctrl: true }), { ...ready, submitKey: false }), "pass", "no submitKey: never decides");
  assert.equal(noteKey(k("Enter", { meta: true }), { ...ready, submitKey: false }), "pass");
});

// The morph runner: with and without the View Transitions API.
test("runMorph with the API: the update runs inside startViewTransition, then the promise resolves after it", async () => {
  const calls: string[] = [];
  let started = 0;
  const env = {
    reduced: false,
    start: (cb: () => void) => { started++; cb(); return { updateCallbackDone: Promise.resolve().then(() => { calls.push("done"); }) }; },
  };
  await runMorph(() => calls.push("update"), env).then(() => calls.push("focus"));
  assert.equal(started, 1);
  assert.deepEqual(calls, ["update", "done", "focus"], "focus moves only after the DOM update");
});

test("runMorph without the API, or under reduced motion: instant, no transition", async () => {
  const calls: string[] = [];
  await runMorph(() => calls.push("update"), { reduced: false }).then(() => calls.push("focus"));
  let started = 0;
  await runMorph(() => calls.push("update2"), { reduced: true, start: () => { started++; return { updateCallbackDone: Promise.resolve() }; } });
  assert.deepEqual(calls, ["update", "focus", "update2"]);
  assert.equal(started, 0, "reduced motion never starts a transition");
});

// The component.
const base = {
  id: "note", name: "morph-test", trigger: "Open", prompt: "What should change?", value: "", onChange: () => {},
  submitLabel: "Send", busy: false, onSubmit: () => {}, onOpenChange: () => {},
};

test("MorphNote SSR is closed: the trigger carries the view-transition-name; no field", () => {
  const html = renderToStaticMarkup(<MorphNote {...base} open={false} />);
  assert.match(html, /<button[^>]*id="note-btn"[^>]*style="view-transition-name:morph-test"/);
  assert.doesNotMatch(html, /<textarea/);
});

test("MorphNote open: the panel takes the name; the field's accessible name is the prompt; the trigger is gone", () => {
  const html = renderToStaticMarkup(<MorphNote {...base} open value="typed before" />);
  assert.deepEqual(names(html), ["morph-test"], "trigger and panel never coexist");
  assert.doesNotMatch(html, /id="note-btn"/);
  assert.match(html, /<label[^>]*for="note"[^>]*>What should change\?<\/label>/);
  assert.match(html, /<textarea[^>]*id="note"[^>]*>typed before<\/textarea>/, "text lives in the parent, so it survives a close");
  assert.match(plain(html), /Cancel/);
});

test("MorphNote: the Kbd hint shows only with submitKey, in platform-neutral words", () => {
  assert.match(renderToStaticMarkup(<MorphNote {...base} open submitKey />), /<kbd[^>]*>Ctrl\/⌘ \+ Enter<\/kbd>/);
  assert.equal(count(renderToStaticMarkup(<MorphNote {...base} open />), "<kbd"), 0);
});

// Reviewer decisions.
test("DecisionForm SSR: three closed decisions, Approve the one filled primary, unique morph-decision names", () => {
  const html = renderToStaticMarkup(<DecisionForm version={2} enabled busy={false} onDecide={async () => true} />);
  assert.equal(count(html, "bg-button-bg"), 1);
  assert.equal(count(html, 'data-chip="arrow"'), 1);
  assert.deepEqual(names(html).sort(), ["morph-decision-approved", "morph-decision-changes", "morph-decision-rejected"]);
  assert.doesNotMatch(html, /<textarea/);
});

test("DecisionForm: with a panel open, the other two decisions aren't rendered", () => {
  const html = renderToStaticMarkup(<DecisionForm version={2} enabled busy={false} onDecide={async () => true} initialOpen="changes" />);
  const t = plain(html);
  assert.match(html, /<label[^>]*for="review-note"[^>]*>What should change\? \(sent to the requester\)<\/label>/);
  assert.doesNotMatch(t, /Approve/);
  assert.doesNotMatch(t, /Reject/);
  assert.match(html, /<kbd[^>]*>Ctrl\/⌘ \+ Enter<\/kbd>/, "Request changes opts in to the shortcut");
});

test("DecisionForm: Approve and Reject panels have no shortcut; their prompts and submit labels", () => {
  const approve = renderToStaticMarkup(<DecisionForm version={2} enabled busy={false} onDecide={async () => true} initialOpen="approved" />);
  assert.match(approve, /<label[^>]*for="review-note"[^>]*>Note to the requester \(optional\)<\/label>/);
  assert.match(plain(approve), /Approve v2/);
  assert.equal(count(approve, "<kbd"), 0);
  const reject = renderToStaticMarkup(<DecisionForm version={2} enabled busy={false} onDecide={async () => true} initialOpen="rejected" />);
  assert.match(reject, /<label[^>]*for="review-note"[^>]*>Why reject\? \(sent to the requester\)<\/label>/);
  assert.match(plain(reject), /Reject v2/);
  assert.equal(count(reject, "<kbd"), 0);
});

test("Ctrl+Enter in the Approve or Reject panel doesn't decide (they're terminal, so no submitKey)", () => {
  assert.equal(DECISIONS.changes.submitKey, true);
  for (const status of ["approved", "rejected"] as const) {
    const s = { submitKey: DECISIONS[status].submitKey, empty: false, busy: false };
    assert.equal(s.submitKey, false, status);
    assert.equal(noteKey(k("Enter", { ctrl: true }), s), "pass", status);
    assert.equal(noteKey(k("Enter", { meta: true }), s), "pass", status);
  }
});

test("decisionSubmit: Approve sends with an empty note and with a typed note; the others need a note, in today's words", () => {
  assert.deepEqual(decisionSubmit("approved", "  "), { send: { status: "approved", note: "" } });
  assert.deepEqual(decisionSubmit("approved", " Looks good "), { send: { status: "approved", note: "Looks good" } });
  assert.deepEqual(decisionSubmit("changes", ""), { error: "Say what should change before you request changes." });
  assert.deepEqual(decisionSubmit("rejected", " "), { error: "Say why before you reject it." });
  assert.deepEqual(decisionSubmit("changes", "Add the GPA"), { send: { status: "changes", note: "Add the GPA" } });
});

test("DecisionForm disabled: triggers disabled, no arrow, says why", () => {
  const html = renderToStaticMarkup(<DecisionForm version={2} enabled={false} busy={false} onDecide={async () => true} />);
  assert.equal(count(html, 'data-chip="arrow"'), 0);
  assert.equal(count(html, 'disabled=""'), 3);
  assert.match(plain(html), /Nothing to decide right now\./);
});

// Spec panel Edit.
const at = "2026-11-12T09:00:00.000Z";
const session = (): Session => ({
  id: "s1", step: "interview", idea: "x",
  slots: (["users", "top", "never", "examples", "sources", "handoff"] as const).map((key) => ({ key, value: `${key} value`, filledBy: "requester" as const })),
  sources: [], asked: 6, knobs: { studentsPerMonth: 1200, convsPerStudent: 3 },
  log: [{ at, who: "requester", what: "x", kind: "idea" }],
} as Session);

test("spec panel: six named Edit triggers with unique morph-edit-<slotKey> names", () => {
  const html = renderToStaticMarkup(<SpecPanel session={session()} busy={false} onEdit={() => {}} />);
  assert.deepEqual(names(html), ["users", "top", "never", "examples", "sources", "handoff"].map((s) => `morph-edit-${s}`));
  for (const s of ["users", "top", "never", "examples", "sources", "handoff"]) assert.match(html, new RegExp(`id="edit-${s}-btn"`));
  assert.match(plain(html), /Edit Who uses it/);
});

test("spec panel Edit open: the slot editor named after the slot, Save and Cancel, Ctrl/⌘+Enter, the rest stay closed", () => {
  const html = renderToStaticMarkup(<SpecPanel session={session()} busy={false} onEdit={() => {}} initialEditing="users" />);
  assert.match(html, /<label[^>]*for="edit-users"[^>]*>Who uses it<\/label>/);
  assert.match(html, /<textarea[^>]*id="edit-users"[^>]*>users value<\/textarea>/);
  assert.match(plain(html), /Save/);
  assert.match(plain(html), /Cancel/);
  assert.match(html, /<kbd[^>]*>Ctrl\/⌘ \+ Enter<\/kbd>/);
  assert.equal(new Set(names(html)).size, 6, "still unique with one open");
  assert.doesNotMatch(html, /id="edit-users-btn"/);
});

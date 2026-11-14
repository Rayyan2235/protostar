"use client";

import { useCallback, useEffect, useRef, useState, useSyncExternalStore } from "react";
import { SLOT_KEYS, SLOT_LABELS, type Blueprint, type Decision, type PushbackChoice, type Session, type SessionReview, type SlotKey } from "@/lib/types";
import type { Catalog } from "@/lib/engine";
import { reviewPath, type ClientAction, type SessionResponse } from "@/lib/api";
import { SCENARIO } from "@/lib/scenario";
import { BlueprintView, ExportBar, SourceItem } from "@/components/blueprint";
import { Button } from "@/components/kiln/Button";
import { CopyButton } from "@/components/CopyButton";
import { DecisionLog } from "@/components/DecisionLog";
import { EmptyState } from "@/components/EmptyState";
import { FlowRail } from "@/components/FlowRail";
import { KeyHint, submitOnEnter } from "@/components/Kbd";
import { ModeBadge } from "@/components/ModeBadge";
import { MorphNote } from "@/components/MorphNote";
import { Notice } from "@/components/Notice";
import { StatusProvider, useStatus } from "@/components/StatusStrip";
import { TextField } from "@/components/TextField";
import { TopBar } from "@/components/TopBar";
import { ScopePicker, ScopeSummary } from "./scope";

type ResolveChoice = PushbackChoice | "keep";

const EXAMPLE_IDEA = "Something that helps students figure out if they can switch into Finance.";
/** How often a waiting page checks for news. */
export const POLL_MS = 5000;
/** Steps where the main panel shows the blueprint instead of the interview. */
const BLUEPRINT_STEPS: Session["step"][] = ["blueprint", "review", "done"];

/** What the requester sees as the review state, in words, on the blueprint's spec sheet. */
const REVIEW_WORDS = { pending: "Waiting for review", changes: "Changes requested", approved: "Approved", rejected: "Rejected" } as const;

/**
 * The control that should hold focus once an action lands (a11y: never leave focus on <body>).
 * One selector per state; the Studio focuses it after the response renders.
 */
export function nextFocus(s: Session): string {
  switch (s.step) {
    case "idea": return "#idea";
    case "interview": return s.pushback?.blocking ? "#pushback-0" : "#answer";
    case "scope": return '#scope-picker [role="radio"][aria-checked="true"]';
    case "tests": return "#tests-continue";
    case "blueprint": return "#submit-blueprint";
    case "review": return "#copy-link";
    case "done": return "#new-idea";
  }
}

async function call(path: string, body?: unknown): Promise<SessionResponse> {
  const res = await fetch(path, body === undefined ? undefined : {
    method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify(body),
  });
  const data = (await res.json().catch(() => ({}))) as SessionResponse;
  if (!res.ok && !data.error) data.error = `Request failed (${res.status})`;
  return data;
}

/**
 * The requester's studio. `initialId` comes from ?s= (read on the server), so a shared link renders
 * a busy state instead of flashing the idea form. `pending` is the Suspense fallback while the link is read.
 */
export default function Studio(props: { initialId?: string; pending?: boolean }) {
  return (
    <StatusProvider>
      <StudioShell {...props} />
    </StatusProvider>
  );
}

function StudioShell({ initialId, pending }: { initialId?: string; pending?: boolean }) {
  const { say } = useStatus();
  const [session, setSession] = useState<Session>();
  const [blueprint, setBlueprint] = useState<Blueprint>();
  const [mode, setMode] = useState<string>();
  const [catalog, setCatalog] = useState<Catalog>();
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string>();
  const [text, setText] = useState("");
  const [loading, setLoading] = useState(Boolean(initialId || pending));
  /** ?s= named a session this server doesn't have. */
  const [missing, setMissing] = useState(false);
  /** Selector to focus once the current action has rendered. `soft`: only if focus was lost (poll updates). */
  const focusNext = useRef<{ sel: string; soft?: boolean } | null>(null);

  const apply = useCallback((r: SessionResponse) => {
    if (r.session) {
      setSession(r.session);
      setBlueprint(r.blueprint);
      const url = new URL(window.location.href);
      url.searchParams.set("s", r.session.id);
      window.history.replaceState(null, "", url);
    }
    if (r.mode) setMode(r.mode);
    if (r.catalog) setCatalog(r.catalog);
    setError(r.error);
  }, []);

  useEffect(() => {
    if (!initialId) return;
    call(`/api/sessions/${initialId}`)
      .then((r) => {
        apply(r);
        if (!r.session) setMissing(true);
      })
      .catch(() => setError("Network error. Reload the page."))
      .finally(() => setLoading(false));
  }, [initialId, apply]);

  // While the reviewer has the blueprint, check for their decision. Stops on any step change.
  const sid = session?.id;
  const waiting = session?.step === "review" && session.review?.status === "pending";
  useEffect(() => {
    if (!sid || !waiting) return;
    const timer = setInterval(() => {
      call(`/api/sessions/${sid}`).then((r) => {
        if (!r.session) return;
        apply(r);
        // The reviewer decided: the review card (and maybe the focused Copy button) goes away.
        if (r.session.step !== "review") focusNext.current = { sel: nextFocus(r.session), soft: true };
      }).catch(() => {});
    }, POLL_MS);
    return () => clearInterval(timer);
  }, [sid, waiting, apply]);

  // After an action: move focus to the next logical control once it exists and is enabled.
  useEffect(() => {
    if (busy || !focusNext.current) return;
    const lost = !document.activeElement || document.activeElement === document.body;
    if (focusNext.current.soft && !lost) {
      focusNext.current = null;
      return;
    }
    const el = document.querySelector<HTMLElement>(focusNext.current.sel);
    if (el && !el.hasAttribute("disabled")) {
      el.focus();
      focusNext.current = null;
    }
  });

  const run = async (p: Promise<SessionResponse>, focus?: string): Promise<SessionResponse | undefined> => {
    setBusy(true);
    try {
      const r = await p;
      apply(r);
      if (r.session) focusNext.current = { sel: focus ?? nextFocus(r.session) };
      return r;
    } catch {
      setError("Network error. Try again.");
      return undefined;
    } finally {
      setBusy(false);
    }
  };

  const start = (idea: string) => run(call("/api/sessions", { idea })).then(() => setText(""));
  const send = async (a: ClientAction, focus?: string) => {
    if (!session) return;
    const r = await run(call(`/api/sessions/${session.id}`, a), focus);
    // Transient results go to the StatusStrip (closed list); errors stay in place as alerts.
    if (!r?.session || r.error) return;
    if (a.type === "edit") say("Saved");
    if (a.type === "submit" && r.session.review) say(`Sent v${r.session.review.version} to the reviewer`);
  };
  const answer = (value: string) => {
    if (!value.trim()) return;
    setText("");
    send({ type: "answer", value });
  };
  const startOver = () => {
    window.history.replaceState(null, "", window.location.pathname);
    setSession(undefined);
    setBlueprint(undefined);
    setError(undefined);
    setLoading(false);
    setMissing(false);
    focusNext.current = { sel: "#idea" };
  };

  return (
    <>
      <TopBar title="Protostar" subtitle="Agent spec builder · prototype">
        {mode && <ModeBadge mode={mode} />}
        {session && <Button kind="link" onClick={startOver}>New idea</Button>}
      </TopBar>

      <main className="mx-auto flex w-full max-w-6xl flex-1 flex-col px-(--space-3) py-(--space-5) sm:px-(--space-6)">
        {!session && loading ? (
          <div role="status" aria-busy="true" className="small font-normal text-ink-muted">
            {error ?? "Loading your session…"}
          </div>
        ) : !session && missing ? (
          <SessionNotFound onNew={startOver} />
        ) : !session ? (
          <StartScreen text={text} setText={setText} busy={busy} error={error} onStart={start} />
        ) : (
          <div className="flex flex-1 flex-col gap-(--space-5)">
          <FlowRail variant="top" step={session.step} />
          <div className="grid flex-1 gap-(--space-5) lg:grid-cols-12">
            <section aria-label={BLUEPRINT_STEPS.includes(session.step) ? "Blueprint" : "Interview"} className="flex min-w-0 flex-col gap-(--space-4) lg:col-span-8">
              {BLUEPRINT_STEPS.includes(session.step) ? (
                <BlueprintStep session={session} blueprint={blueprint} busy={busy} error={error} send={send} onNewIdea={startOver} />
              ) : (
                <>
                  <div className="flex flex-col gap-(--space-3)">
                    {error && (session.step === "interview" ? (
                      <Notice tone="danger" actions={<Button kind="outline" onClick={() => send({ type: "retry" })} disabled={busy}>Retry</Button>}>
                        The interviewer didn&apos;t answer: {error}
                      </Notice>
                    ) : (
                      <Notice tone="danger">{error}</Notice>
                    ))}
                    {session.step === "scope" && catalog ? (
                      <ScopePicker session={session} catalog={catalog} busy={busy} onChoose={(scope, role, knobs) => send({ type: "choose_scope", scope, role, knobs })} />
                    ) : session.step === "tests" ? (
                      <TestsStep busy={busy} send={send} />
                    ) : (
                      <Composer session={session} busy={busy} text={text} setText={setText} onAnswer={answer} onResolve={(choice) => send({ type: "resolve", choice })} />
                    )}
                  </div>
                  <Ledger log={session.log} />
                </>
              )}
            </section>

            <aside aria-label="Spec so far" className="flex min-w-0 flex-col gap-(--space-5) lg:col-span-4">
              <SpecPanel session={session} busy={busy} onEdit={(key, value) => send({ type: "edit", key, value }, `#edit-${key}-btn`)} />
            </aside>
          </div>
          </div>
        )}
      </main>
    </>
  );
}

/**
 * Start (K4, Rayyan): the loud moment is type. A display statement straight on paper, left-aligned,
 * the field and one pill in the main column; a quiet margin with the flow strip and one honest aside.
 */
function StartScreen({ text, setText, busy, error, onStart }: {
  text: string; setText: (s: string) => void; busy: boolean; error?: string; onStart: (s: string) => void;
}) {
  return (
    <div className="grid gap-(--space-6) lg:grid-cols-12 lg:pt-(--space-5)">
      <form className="flex flex-col gap-(--space-4) lg:col-span-7" onSubmit={(e) => { e.preventDefault(); onStart(text); }}>
        <h1 className="display text-ink">What do you keep answering <span className="text-ink-muted">over and over?</span></h1>
        <TextField id="idea" label="Describe the agent you wish existed, in one sentence." multiline autosize rows={3} maxLength={1000}
          value={text} onChange={setText} placeholder="e.g. Something that answers change-of-major questions"
          onKeyDown={submitOnEnter({ empty: !text.trim(), busy }, () => onStart(text))} />
        {error && <Notice tone="danger">{error}</Notice>}
        <div className="flex flex-wrap items-center gap-(--space-3)">
          <Button type="submit" disabled={busy || !text.trim()}>{busy ? "Starting…" : "Start the interview"}</Button>
          <Button kind="link" onClick={() => setText(EXAMPLE_IDEA)}>Use Dana&apos;s example</Button>
        </div>
        <KeyHint items={[["Enter", "to start"], ["Shift + Enter", "for a new line"]]} />
      </form>
      <aside aria-label="How it works" className="flex flex-col gap-(--space-4) lg:col-span-3 lg:col-start-10 lg:pt-(--space-3)">
        <FlowRail variant="margin" />
        <p className="small font-normal text-ink-muted">Prototype. Public, Level 1–2 data only. Never student records.</p>
      </aside>
    </div>
  );
}

export function TestsStep({ busy, send }: { busy: boolean; send: (a: ClientAction) => unknown }) {
  return (
    <div className="flex flex-col gap-(--space-3)">
      <p className="body text-ink-soft">The test run needs live models and isn&apos;t built yet.</p>
      <div className="flex flex-wrap items-center gap-(--space-2)">
        <Button id="tests-continue" disabled={busy} onClick={() => send({ type: "continue" })}>Continue to blueprint</Button>
        <Button kind="outline" disabled={busy} onClick={() => send({ type: "reopen_scope" })}>Change scope</Button>
      </div>
    </div>
  );
}

/** Main panel for the blueprint, review and done steps. */
export function BlueprintStep({ session, blueprint, busy, error, send, onNewIdea }: {
  session: Session; blueprint?: Blueprint; busy: boolean; error?: string;
  send: (a: ClientAction) => unknown; onNewIdea: () => void;
}) {
  const r = session.review;
  const last = session.log.at(-1);
  const status = session.step === "blueprint" ? undefined : r ? REVIEW_WORDS[r.status] : undefined;
  return (
    <div className="flex flex-col gap-(--space-5)">
      <div className="flex flex-col gap-(--space-3)">
        {error && <Notice tone="danger">{error}</Notice>}
        {session.step === "blueprint" && (
          <>
            {r?.status === "changes" && (
              <Notice tone="accent" title={`Reviewer asked for changes on v${r.version}`}>{r.note || "No note given."}</Notice>
            )}
            {last?.kind === "blocked" && <Notice>{last.what}</Notice>}
            <div className="flex flex-wrap items-center gap-(--space-2)">
              <Button id="submit-blueprint" disabled={busy || !blueprint} onClick={() => send({ type: "submit" })}>
                {r ? `Resubmit as v${r.version + 1}` : "Submit for review"}
              </Button>
              <Button kind="outline" disabled={busy} onClick={() => send({ type: "reopen_scope" })}>Change scope</Button>
            </div>
            <p className="small font-normal text-ink-muted">You can still edit the spec on the right before you submit.</p>
          </>
        )}
        {session.step === "review" && r && <ReviewCard review={r} />}
        {session.step === "done" && r && <DoneBanner review={r} onNewIdea={onNewIdea} />}
      </div>
      {blueprint ? (
        <div className="flex flex-col gap-(--space-4)">
          <BlueprintView blueprint={blueprint} audience="requester" status={status} />
          <ExportBar blueprint={blueprint} />
        </div>
      ) : (
        <p className="small font-normal text-ink-muted">Loading the blueprint…</p>
      )}
    </div>
  );
}

const noSubscribe = () => () => {};
/** The page origin; "" in the server markup (no window during render). */
function useOrigin() {
  return useSyncExternalStore(noSubscribe, () => window.location.origin, () => "");
}

export function ReviewCard({ review: r }: { review: SessionReview }) {
  const link = `${useOrigin()}${reviewPath(r.reviewId)}`;
  return (
    <section aria-labelledby="review-waiting" className="flex flex-col gap-(--space-2) rounded-(--radius-md) border border-hairline bg-paper-raised p-(--space-3)">
      <h2 id="review-waiting" className="title text-accent">v{r.version} submitted · waiting for review</h2>
      <p className="small font-normal text-ink-soft">
        {r.openedAt ? "The reviewer has opened it." : "Send this link to your reviewer."} This page updates when they decide.
      </p>
      <div className="flex flex-wrap items-end gap-(--space-2)">
        <TextField id="review-link" label="Reviewer link" hideLabel readOnly value={link} className="min-w-0 flex-1"
          onFocus={(e) => e.currentTarget.select()} />
        <CopyButton id="copy-link" label="Copy link" text={() => link} message="Copied the review link"
          failText="Couldn't copy. Select the text and copy it yourself." />
      </div>
    </section>
  );
}

export function DoneBanner({ review: r, onNewIdea }: { review: SessionReview; onNewIdea: () => void }) {
  const approved = r.status === "approved";
  return (
    <Notice tone={approved ? "success" : "danger"} title={approved ? `Approved: v${r.version}.` : `Rejected v${r.version}:`}
      actions={<Button id="new-idea" kind="outline" onClick={onNewIdea}>New idea</Button>}>
      {approved ? "The reviewer signed off on this blueprint." : r.note || "No reason given."}
    </Notice>
  );
}

/** A missing ?s= session: type-only empty state with one way forward. */
export function SessionNotFound({ onNew }: { onNew: () => void }) {
  return (
    <EmptyState mark="Not found." action={<Button onClick={onNew}>Start a new idea</Button>}>
      That link doesn&apos;t match a session on this server.
    </EmptyState>
  );
}

type LedgerRow = { q: string; a?: string; tool?: boolean };

/** Earlier Q&A from the log, newest first. The unanswered current question is left out. */
function ledgerRows(log: Decision[]): LedgerRow[] {
  const rows: LedgerRow[] = [];
  let asked: string | undefined;
  for (const d of log) {
    if (d.kind === "idea") rows.push({ q: "Your idea", a: d.what });
    else if (d.kind === "question") asked = d.what;
    else if (d.kind === "answer") { rows.push({ q: asked ?? "Answer", a: d.what }); asked = undefined; }
    else if (d.kind === "resolve") rows.push({ q: "Data choice", a: d.what });
    else if (d.kind === "flag" || d.kind === "blocked" || d.kind === "done") rows.push({ q: d.what, tool: true });
  }
  return rows.reverse();
}

/**
 * The interview so far, as given: read-only history under the current question (K5a). The spec
 * panel is the only editor, so after an edit the two can differ; the heading says so.
 * No live region: focus moving to the new question announces the change.
 */
export function Ledger({ log }: { log: Decision[] }) {
  const rows = ledgerRows(log);
  if (!rows.length) return null;
  return (
    <section aria-labelledby="ledger-heading" className="flex flex-col gap-(--space-2)">
      <h2 id="ledger-heading" className="label text-ink-muted">Your answers, as given</h2>
      <ol>
        {rows.map((r, i) => (
          <li key={i} className="border-b border-hairline py-(--space-2) last:border-b-0">
            <p className="small font-normal text-ink-muted">{r.q}</p>
            {!r.tool && <p className="body mt-(--space-1) whitespace-pre-wrap text-ink">{r.a}</p>}
          </li>
        ))}
      </ol>
    </section>
  );
}

/** The current question as the statement (heading-2), its field under it; the pushback takes its place while it blocks. */
export function Composer({ session, busy, text, setText, onAnswer, onResolve }: {
  session: Session; busy: boolean; text: string; setText: (s: string) => void;
  onAnswer: (s: string) => void; onResolve: (c: ResolveChoice) => void;
}) {
  if (session.pushback?.blocking) return <PushbackCard session={session} busy={busy} onResolve={onResolve} />;
  if (session.step === "scope") return <p className="small font-normal text-ink-muted">Loading scope options…</p>;
  if (busy || !session.question) return <p className="small font-normal text-ink-muted">{busy ? "Thinking…" : "Waiting for the interviewer."}</p>;

  const q = session.question;
  const n = session.log.filter((d) => d.kind === "question").length + 1;
  return (
    <form onSubmit={(e) => { e.preventDefault(); onAnswer(text); }} className="flex flex-col gap-(--space-3)">
      <div className="flex flex-col gap-(--space-1)">
        <p className="label text-ink-muted">Question {n}</p>
        <h2 className="heading-2 text-ink">{q.ask}</h2>
      </div>
      {q.chips.length > 0 && (
        <div className="flex flex-wrap gap-(--space-2)">
          {q.chips.map((c) => (
            <Button key={c} kind="outline" onClick={() => setText(text ? `${text}; ${c}` : c)}>{c}</Button>
          ))}
        </div>
      )}
      {/* The field's name stays the question (sr-only label), so focus on it reads the question. */}
      <TextField id="answer" label={q.ask} hideLabel multiline autosize rows={2} value={text} onChange={setText}
        placeholder="Your answer, in your own words"
        onKeyDown={submitOnEnter({ empty: !text.trim(), busy }, () => onAnswer(text))} />
      <div className="flex flex-wrap items-center justify-between gap-(--space-3)">
        <KeyHint items={[["Enter", "to send"], ["Shift + Enter", "for a new line"]]} />
        <Button type="submit" disabled={!text.trim()}>Send</Button>
      </div>
    </form>
  );
}

/** The data gate's pushback: an alert that says what was flagged, each way forward as a button, and a way past. */
export function PushbackCard({ session, busy, onResolve }: { session: Session; busy: boolean; onResolve: (c: ResolveChoice) => void }) {
  const pb = session.pushback!;
  const names = pb.flagged.join(", ");
  return (
    <Notice tone="danger" title={`Hold on: this would use student records (${names})`}
      actions={<Button kind="link" danger disabled={busy} onClick={() => onResolve("keep")}>Keep it anyway</Button>}>
      <p>That counts as Penn State Level 3–4 data (FERPA). AI Studio agents may only use Level 1–2 data. How should the agent work instead?</p>
      <ul className="mt-(--space-3) flex flex-col gap-(--space-3)">
        {pb.options.map((choice, i) => {
          const opt = SCENARIO.pushback.options[choice];
          return (
            <li key={choice} className="flex flex-col items-start gap-(--space-1)">
              <Button id={`pushback-${i}`} kind="outline" disabled={busy} onClick={() => onResolve(choice)} aria-describedby={`pushback-${i}-detail`}>
                {opt.title}
              </Button>
              <span id={`pushback-${i}-detail`} className="text-ink-muted">{opt.detail}</span>
            </li>
          );
        })}
      </ul>
    </Notice>
  );
}

export function SpecPanel({ session, busy, onEdit, initialEditing }: {
  session?: Session; busy: boolean; onEdit: (k: SlotKey, v: string) => void;
  /** Server-render one slot's editor open (tests). The page always starts closed. */
  initialEditing?: SlotKey;
}) {
  const [editing, setEditing] = useState<SlotKey | undefined>(initialEditing);
  /** Typed text per slot. It survives a close (Esc, Cancel) and is dropped once saved. */
  const [drafts, setDrafts] = useState<Partial<Record<SlotKey, string>>>({});
  const canEdit = (session?.step === "interview" || session?.step === "blueprint") && !session.pushback?.blocking && !busy;

  return (
    <>
      <section className="flex flex-col gap-(--space-2)">
        <h2 className="label text-ink-muted">Spec so far</h2>
        <dl>
          {SLOT_KEYS.map((key) => {
            const slot = session?.slots.find((s) => s.key === key);
            const draft = drafts[key] ?? slot?.value ?? "";
            const save = () => {
              setEditing(undefined);
              setDrafts((d) => { const next = { ...d }; delete next[key]; return next; });
              onEdit(key, draft);
            };
            return (
              <div key={key} className="border-b border-hairline py-(--space-2) last:border-b-0">
                <dt className="flex flex-wrap items-center justify-between gap-(--space-2)">
                  <span className="small text-ink-soft">{SLOT_LABELS[key]}</span>
                  {slot && <span className="label text-ink-muted">{slot.filledBy === "requester" ? "You" : `Prefilled · ${Math.round((slot.confidence ?? 0) * 100)}%`}</span>}
                </dt>
                {/* The Edit button morphs into the slot editor (K6b). One open at a time; Esc = Cancel, focus back on Edit. */}
                <dd className={`mt-(--space-1) flex gap-(--space-2) ${editing === key ? "flex-col" : "items-start justify-between"}`}>
                  {editing !== key && <span className={`small font-normal ${slot ? "text-ink" : "text-ink-muted"}`}>{slot?.value ?? "—"}</span>}
                  {slot && (canEdit || editing === key) && (
                    <MorphNote id={`edit-${key}`} name={`morph-edit-${key}`} open={editing === key}
                      onOpenChange={(o) => setEditing(o ? key : undefined)}
                      trigger={<>Edit<span className="sr-only"> {SLOT_LABELS[key]}</span></>} triggerKind="link" triggerClassName="shrink-0"
                      prompt={SLOT_LABELS[key]} hidePrompt value={draft} onChange={(v) => setDrafts((d) => ({ ...d, [key]: v }))} rows={2}
                      submitLabel="Save" submitKind="outline" submitKey busy={busy} onSubmit={save} />
                  )}
                </dd>
              </div>
            );
          })}
        </dl>
      </section>

      <section className="flex flex-col gap-(--space-2)">
        <h2 className="label text-ink-muted">Data sources</h2>
        {session?.sources.length ? (
          <ul>{session.sources.map((s) => <SourceItem key={s.name} src={s} />)}</ul>
        ) : (
          <p className="small font-normal text-ink-muted">None yet.</p>
        )}
        {session?.pushback?.choice && (
          <p className="small font-normal text-ink-soft">
            <span className="font-semibold text-ink">Rule added by your choice:</span> {SCENARIO.pushback.options[session.pushback.choice].rule}
          </p>
        )}
        <p className="label text-ink-muted">Levels: Penn State data classes. “rule” = decided by a fixed table; “model” = classified by AI because no rule matched.</p>
      </section>

      {session?.scope && <ScopeSummary session={session} />}

      {session && <DecisionLog log={session.log} />}
    </>
  );
}

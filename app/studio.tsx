"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { SLOT_KEYS, SLOT_LABELS, type Blueprint, type Decision, type PushbackChoice, type Session, type SessionReview, type SlotKey } from "@/lib/types";
import type { Catalog } from "@/lib/engine";
import { reviewPath, type ClientAction, type SessionResponse } from "@/lib/api";
import { SCENARIO } from "@/lib/scenario";
import { BlueprintView, ExportBar, SourceItem } from "@/components/blueprint";
import { Button } from "@/components/kiln/Button";
import { Tag } from "@/components/kiln/Tag";
import { ChatRow } from "@/components/ChatRow";
import { DecisionLog } from "@/components/DecisionLog";
import { ModeBadge } from "@/components/ModeBadge";
import { MotionSwitch } from "@/components/MotionSwitch";
import { Notice } from "@/components/Notice";
import { StartScene } from "@/components/StartScene";
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
export default function Studio({ initialId, pending }: { initialId?: string; pending?: boolean }) {
  const [session, setSession] = useState<Session>();
  const [blueprint, setBlueprint] = useState<Blueprint>();
  const [mode, setMode] = useState<string>();
  const [catalog, setCatalog] = useState<Catalog>();
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string>();
  const [text, setText] = useState("");
  const [loading, setLoading] = useState(Boolean(initialId || pending));
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
      .then(apply)
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

  const run = async (p: Promise<SessionResponse>, focus?: string) => {
    setBusy(true);
    try {
      const r = await p;
      apply(r);
      if (r.session) focusNext.current = { sel: focus ?? nextFocus(r.session) };
    } catch {
      setError("Network error. Try again.");
    } finally {
      setBusy(false);
    }
  };

  const start = (idea: string) => run(call("/api/sessions", { idea })).then(() => setText(""));
  const send = (a: ClientAction, focus?: string) => session && run(call(`/api/sessions/${session.id}`, a), focus);
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
    focusNext.current = { sel: "#idea" };
  };

  return (
    <>
      <TopBar title="Protostar" subtitle="Agent spec builder · prototype">
        {mode && <ModeBadge mode={mode} />}
        <MotionSwitch />
        {session && <Button kind="link" onClick={startOver}>New idea</Button>}
      </TopBar>

      <main className="mx-auto flex w-full max-w-6xl flex-1 flex-col px-(--space-3) py-(--space-5) sm:px-(--space-6)">
        {!session && loading ? (
          <div role="status" aria-busy="true" className="small font-normal text-ink-muted">
            {error ?? "Loading your session…"}
          </div>
        ) : !session ? (
          <StartScreen text={text} setText={setText} busy={busy} error={error} onStart={start} />
        ) : (
          <div className="grid flex-1 gap-(--space-5) lg:grid-cols-12">
            <section aria-label={BLUEPRINT_STEPS.includes(session.step) ? "Blueprint" : "Interview"} className="flex min-w-0 flex-col gap-(--space-4) lg:col-span-8">
              {BLUEPRINT_STEPS.includes(session.step) ? (
                <BlueprintStep session={session} blueprint={blueprint} busy={busy} error={error} send={send} onNewIdea={startOver} />
              ) : (
                <>
                  <Transcript log={session.log} />
                  <div className="flex flex-col gap-(--space-3) border-t border-hairline pt-(--space-3)">
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
                </>
              )}
            </section>

            <aside aria-label="Spec so far" className="flex min-w-0 flex-col gap-(--space-4) lg:col-span-4">
              <SpecPanel session={session} busy={busy} onEdit={(key, value) => send({ type: "edit", key, value }, `#edit-${key}-btn`)} />
            </aside>
          </div>
        )}
      </main>
    </>
  );
}

/** Empty state (KILN-AGENT §6): the framed world, a heading-2, one sentence, the field, one pill. */
function StartScreen({ text, setText, busy, error, onStart }: {
  text: string; setText: (s: string) => void; busy: boolean; error?: string; onStart: (s: string) => void;
}) {
  return (
    <div className="mx-auto flex w-full max-w-2xl flex-col gap-(--space-4)">
      <StartScene />
      <form className="flex flex-col gap-(--space-3)" onSubmit={(e) => { e.preventDefault(); onStart(text); }}>
        <h1 className="heading-2 text-ink">What do you keep answering over and over?</h1>
        <TextField id="idea" label="Describe the agent you wish existed, in one sentence." multiline rows={3} maxLength={1000}
          value={text} onChange={setText} placeholder="e.g. Something that answers change-of-major questions" />
        {error && <Notice tone="danger">{error}</Notice>}
        <div className="flex flex-wrap items-center gap-(--space-3)">
          <Button type="submit" disabled={busy || !text.trim()}>{busy ? "Starting…" : "Start the interview"}</Button>
          <Button kind="link" onClick={() => setText(EXAMPLE_IDEA)}>Use Dana&apos;s example</Button>
        </div>
      </form>
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
function BlueprintStep({ session, blueprint, busy, error, send, onNewIdea }: {
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

function ReviewCard({ review: r }: { review: SessionReview }) {
  const [copied, setCopied] = useState("");
  const link = `${window.location.origin}${reviewPath(r.reviewId)}`;
  const copy = async () => {
    try {
      await navigator.clipboard.writeText(link);
      setCopied("Link copied.");
    } catch {
      setCopied("Couldn't copy. Select the link and copy it.");
    }
  };
  return (
    <section aria-labelledby="review-waiting" className="flex flex-col gap-(--space-2) rounded-(--radius-md) border border-hairline bg-paper-raised p-(--space-3)">
      <h2 id="review-waiting" className="title text-accent">v{r.version} submitted · waiting for review</h2>
      <p className="small font-normal text-ink-soft">
        {r.openedAt ? "The reviewer has opened it." : "Send this link to your reviewer."} This page updates when they decide.
      </p>
      <div className="flex flex-wrap items-end gap-(--space-2)">
        <TextField id="review-link" label="Reviewer link" hideLabel readOnly value={link} className="min-w-0 flex-1"
          onFocus={(e) => e.currentTarget.select()} />
        <Button id="copy-link" kind="outline" onClick={copy}>Copy link</Button>
      </div>
      <span role="status" className="label text-ink-soft">{copied}</span>
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

const YOU: Decision["kind"][] = ["idea", "answer", "resolve", "edit", "scope"];
const TOOL_LABEL: Partial<Record<NonNullable<Decision["kind"]>, string>> = { flag: "Flagged", blocked: "Blocked", done: "Done" };

/** The interview so far: the requester's words on paper-sunk, the tool's questions numbered. */
export function Transcript({ log }: { log: Decision[] }) {
  const end = useRef<HTMLDivElement>(null);
  useEffect(() => {
    end.current?.scrollIntoView({ behavior: "smooth", block: "end" }); // returns a Promise in newer browsers; don't return it
  }, [log.length]);
  const qNum = log.map((_, i) => log.slice(0, i + 1).filter((d) => d.kind === "question").length);
  return (
    <div className="flex flex-col gap-(--space-3)" aria-live="polite">
      {log.map((d, i) => {
        if (d.kind && YOU.includes(d.kind)) return <ChatRow key={i} from="you">{d.what}</ChatRow>;
        if (d.kind === "question") return <ChatRow key={i} from="tool" label={`Question ${qNum[i]}`}>{d.what}</ChatRow>;
        const label = d.kind && TOOL_LABEL[d.kind];
        if (label) return <ChatRow key={i} from="tool" label={label}>{d.what}</ChatRow>;
        return <ChatRow key={i} from="tool" quiet>{d.what}</ChatRow>;
      })}
      <div ref={end} />
    </div>
  );
}

function Composer({ session, busy, text, setText, onAnswer, onResolve }: {
  session: Session; busy: boolean; text: string; setText: (s: string) => void;
  onAnswer: (s: string) => void; onResolve: (c: ResolveChoice) => void;
}) {
  if (session.pushback?.blocking) return <PushbackCard session={session} busy={busy} onResolve={onResolve} />;
  if (session.step === "scope") return <p className="small font-normal text-ink-muted">Loading scope options…</p>;
  if (busy || !session.question) return <p className="small font-normal text-ink-muted">{busy ? "Thinking…" : "Waiting for the interviewer."}</p>;

  const q = session.question;
  return (
    <form onSubmit={(e) => { e.preventDefault(); onAnswer(text); }} className="flex flex-col gap-(--space-2)">
      {q.chips.length > 0 && (
        <div className="flex flex-wrap gap-(--space-2)">
          {q.chips.map((c) => (
            <Button key={c} kind="outline" onClick={() => setText(text ? `${text}; ${c}` : c)}>{c}</Button>
          ))}
        </div>
      )}
      <div className="flex flex-wrap items-end gap-(--space-2)">
        <TextField id="answer" label={q.ask} hideLabel multiline rows={2} value={text} onChange={setText} className="min-w-0 flex-1"
          placeholder="Your answer, in your own words"
          onKeyDown={(e) => { if (e.key === "Enter" && !e.shiftKey) { e.preventDefault(); onAnswer(text); } }} />
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

/** Inline editor for one spec slot: a TextField named after the slot, Save and Cancel. */
export function SlotEditor({ slotKey, value, onSave, onCancel }: {
  slotKey: SlotKey; value: string; onSave: (v: string) => void; onCancel: () => void;
}) {
  const [draft, setDraft] = useState(value);
  return (
    <form className="flex flex-col gap-(--space-2)" onSubmit={(e) => { e.preventDefault(); onSave(draft); }}>
      <TextField id={`edit-${slotKey}`} label={SLOT_LABELS[slotKey]} hideLabel multiline rows={2} autoFocus value={draft} onChange={setDraft}
        onFocus={(e) => { const end = e.currentTarget.value.length; e.currentTarget.setSelectionRange(end, end); }}
        onKeyDown={(e) => { if (e.key === "Escape") { e.preventDefault(); onCancel(); } }} />
      <div className="flex flex-wrap items-center gap-(--space-3)">
        <Button kind="outline" type="submit">Save</Button>
        <Button kind="link" onClick={onCancel}>Cancel</Button>
      </div>
    </form>
  );
}

export function SpecPanel({ session, busy, onEdit }: { session?: Session; busy: boolean; onEdit: (k: SlotKey, v: string) => void }) {
  const [editing, setEditing] = useState<SlotKey>();
  /** After Cancel, focus returns to that slot's Edit button. */
  const refocus = useRef<SlotKey | null>(null);
  const canEdit = (session?.step === "interview" || session?.step === "blueprint") && !session.pushback?.blocking && !busy;

  useEffect(() => {
    if (editing || !refocus.current) return;
    document.getElementById(`edit-${refocus.current}-btn`)?.focus();
    refocus.current = null;
  }, [editing]);

  return (
    <>
      <section className="flex flex-col gap-(--space-2)">
        <h2 className="label uppercase text-ink-muted">Spec so far</h2>
        <dl>
          {SLOT_KEYS.map((key) => {
            const slot = session?.slots.find((s) => s.key === key);
            return (
              <div key={key} className="border-b border-hairline py-(--space-2) last:border-b-0">
                <dt className="flex flex-wrap items-center justify-between gap-(--space-2)">
                  <span className="small text-ink-soft">{SLOT_LABELS[key]}</span>
                  {slot && <Tag>{slot.filledBy === "requester" ? "You" : `Prefilled · ${Math.round((slot.confidence ?? 0) * 100)}%`}</Tag>}
                </dt>
                {editing === key && slot ? (
                  <dd className="mt-(--space-1)">
                    <SlotEditor slotKey={key} value={slot.value}
                      onSave={(v) => { setEditing(undefined); onEdit(key, v); }}
                      onCancel={() => { refocus.current = key; setEditing(undefined); }} />
                  </dd>
                ) : (
                  <dd className="mt-(--space-1) flex items-start justify-between gap-(--space-2)">
                    <span className={`small font-normal ${slot ? "text-ink" : "text-ink-muted"}`}>{slot?.value ?? "—"}</span>
                    {canEdit && slot && (
                      <Button id={`edit-${key}-btn`} kind="link" className="shrink-0" onClick={() => setEditing(key)}>
                        Edit<span className="sr-only"> {SLOT_LABELS[key]}</span>
                      </Button>
                    )}
                  </dd>
                )}
              </div>
            );
          })}
        </dl>
      </section>

      <section className="flex flex-col gap-(--space-2) border-t border-hairline pt-(--space-3)">
        <h2 className="label uppercase text-ink-muted">Data sources</h2>
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

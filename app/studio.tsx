"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { SLOT_KEYS, SLOT_LABELS, type Decision, type PushbackChoice, type Session, type SlotKey } from "@/lib/types";
import { SourceItem } from "@/components/blueprint";
import type { Catalog } from "@/lib/engine";
import type { ClientAction, SessionResponse } from "@/lib/api";
import { SCENARIO } from "@/lib/scenario";
import { ScopePicker, ScopeSummary } from "./scope";

type ResolveChoice = PushbackChoice | "keep";

const EXAMPLE_IDEA = "Something that helps students figure out if they can switch into Finance.";

async function call(path: string, body?: unknown): Promise<SessionResponse> {
  const res = await fetch(path, body === undefined ? undefined : {
    method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify(body),
  });
  const data = (await res.json().catch(() => ({}))) as SessionResponse;
  if (!res.ok && !data.error) data.error = `Request failed (${res.status})`;
  return data;
}

export default function Studio() {
  const [session, setSession] = useState<Session>();
  const [mode, setMode] = useState<string>();
  const [catalog, setCatalog] = useState<Catalog>();
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string>();
  const [text, setText] = useState("");

  const apply = useCallback((r: SessionResponse) => {
    if (r.session) {
      setSession(r.session);
      const url = new URL(window.location.href);
      url.searchParams.set("s", r.session.id);
      window.history.replaceState(null, "", url);
    }
    if (r.mode) setMode(r.mode);
    if (r.catalog) setCatalog(r.catalog);
    setError(r.error);
  }, []);

  useEffect(() => {
    const id = new URL(window.location.href).searchParams.get("s");
    if (id) call(`/api/sessions/${id}`).then(apply);
  }, [apply]);

  const run = async (p: Promise<SessionResponse>) => {
    setBusy(true);
    try {
      apply(await p);
    } catch {
      setError("Network error. Try again.");
    } finally {
      setBusy(false);
    }
  };

  const start = (idea: string) => run(call("/api/sessions", { idea })).then(() => setText(""));
  const send = (a: ClientAction) => session && run(call(`/api/sessions/${session.id}`, a));
  const answer = (value: string) => {
    if (!value.trim()) return;
    setText("");
    send({ type: "answer", value });
  };
  const startOver = () => {
    window.history.replaceState(null, "", window.location.pathname);
    setSession(undefined);
    setError(undefined);
  };

  return (
    <div className="mx-auto flex w-full max-w-6xl flex-1 flex-col gap-6 px-4 py-6 sm:px-6">
      <header className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h1 className="text-xl font-semibold tracking-tight text-zinc-900">Protostar</h1>
          <p className="text-sm text-zinc-500">Agent spec builder · prototype</p>
        </div>
        <div className="flex items-center gap-2">
          {mode && <ModeBadge mode={mode} />}
          {session && (
            <button onClick={startOver} className="rounded-md px-3 py-1.5 text-sm text-zinc-600 hover:bg-zinc-100">
              New idea
            </button>
          )}
        </div>
      </header>

      <div className="grid flex-1 gap-6 lg:grid-cols-[minmax(0,1fr)_360px]">
        <section className="flex min-h-[60vh] flex-col rounded-xl border border-zinc-200 bg-white">
          {!session ? (
            <IdeaForm text={text} setText={setText} busy={busy} onStart={start} />
          ) : (
            <>
              <Transcript log={session.log} />
              <div className="border-t border-zinc-200 p-4">
                {error && (
                  <div role="alert" className="mb-3 flex items-center justify-between gap-3 rounded-lg bg-red-50 px-3 py-2 text-sm text-red-800">
                    <span>The interviewer didn&apos;t answer: {error}</span>
                    <button onClick={() => send({ type: "retry" })} disabled={busy} className="shrink-0 font-medium underline">Retry</button>
                  </div>
                )}
                {session.step === "scope" && catalog ? (
                  <ScopePicker session={session} catalog={catalog} busy={busy} onChoose={(scope, role, knobs) => send({ type: "choose_scope", scope, role, knobs })} />
                ) : (
                  <Composer session={session} busy={busy} text={text} setText={setText} onAnswer={answer} onResolve={(choice) => send({ type: "resolve", choice })} />
                )}
              </div>
            </>
          )}
        </section>

        <aside className="flex flex-col gap-4">
          <SpecPanel session={session} busy={busy} onEdit={(key, value) => send({ type: "edit", key, value })} />
        </aside>
      </div>
    </div>
  );
}

function ModeBadge({ mode }: { mode: string }) {
  if (mode === "offline") {
    return <span className="rounded-full bg-amber-100 px-3 py-1 text-xs font-medium text-amber-900">Offline script · no model calls</span>;
  }
  if (mode.startsWith("misconfigured")) {
    return <span className="rounded-full bg-red-100 px-3 py-1 text-xs font-medium text-red-900">{mode}</span>;
  }
  return <span className="rounded-full bg-emerald-100 px-3 py-1 text-xs font-medium text-emerald-900">Live models · {mode}</span>;
}

function IdeaForm({ text, setText, busy, onStart }: { text: string; setText: (s: string) => void; busy: boolean; onStart: (s: string) => void }) {
  return (
    <form className="m-auto flex w-full max-w-xl flex-col gap-4 p-6" onSubmit={(e) => { e.preventDefault(); onStart(text); }}>
      <label htmlFor="idea" className="text-lg font-medium text-zinc-900">
        What do you keep answering over and over? Describe the agent you wish existed, in one sentence.
      </label>
      <textarea
        id="idea" rows={3} value={text} onChange={(e) => setText(e.target.value)} maxLength={1000}
        className="rounded-lg border border-zinc-300 p-3 text-zinc-900 outline-none focus:border-indigo-500 focus:ring-2 focus:ring-indigo-100"
        placeholder="e.g. Something that answers change-of-major questions"
      />
      <div className="flex flex-wrap items-center gap-2">
        <button type="submit" disabled={busy || !text.trim()} className="rounded-lg bg-indigo-600 px-4 py-2 font-medium text-white disabled:opacity-40">
          {busy ? "Starting…" : "Start the interview"}
        </button>
        <button type="button" onClick={() => setText(EXAMPLE_IDEA)} className="rounded-full border border-zinc-300 px-3 py-1.5 text-sm text-zinc-700 hover:bg-zinc-50">
          Use Dana&apos;s example
        </button>
      </div>
    </form>
  );
}

function Transcript({ log }: { log: Decision[] }) {
  const end = useRef<HTMLDivElement>(null);
  useEffect(() => {
    end.current?.scrollIntoView({ behavior: "smooth", block: "end" }); // returns a Promise in newer browsers; don't return it
  }, [log.length]);
  const qNum = log.map((_, i) => log.slice(0, i + 1).filter((d) => d.kind === "question").length);
  return (
    <div className="flex-1 space-y-3 overflow-y-auto p-4" aria-live="polite">
      {log.map((d, i) => {
        switch (d.kind) {
          case "idea":
          case "answer":
          case "resolve":
          case "edit":
          case "scope":
            return (
              <div key={i} className="flex justify-end">
                <p className="max-w-[80%] whitespace-pre-wrap rounded-2xl rounded-br-sm bg-indigo-600 px-4 py-2 text-white">{d.what}</p>
              </div>
            );
          case "question":
            return (
              <div key={i} className="max-w-[80%]">
                <span className="text-xs font-medium text-zinc-500">Question {qNum[i]}</span>
                <p className="rounded-2xl rounded-tl-sm bg-zinc-100 px-4 py-2 text-zinc-900">{d.what}</p>
              </div>
            );
          case "flag":
            return <p key={i} className="rounded-lg border border-red-200 bg-red-50 px-3 py-2 text-sm text-red-900">{d.what}</p>;
          case "blocked":
            return <p key={i} className="rounded-lg border border-amber-200 bg-amber-50 px-3 py-2 text-sm text-amber-900">{d.what}</p>;
          case "done":
            return <p key={i} className="rounded-lg border border-emerald-200 bg-emerald-50 px-3 py-2 text-sm text-emerald-900">{d.what}</p>;
          default:
            return <p key={i} className="text-xs text-zinc-400">{d.what}</p>;
        }
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
  if (session.step === "scope") return <p className="text-sm text-zinc-500">Loading scope options…</p>;
  if (session.step === "tests") {
    return <p className="text-sm text-zinc-600">Scope chosen. Next: the tool drafts the agent and runs its tests on both models. That step needs live models (Phase 2, in progress).</p>;
  }
  if (busy || !session.question) return <p className="text-sm text-zinc-500">{busy ? "Thinking…" : "Waiting for the interviewer."}</p>;

  const q = session.question;
  return (
    <form onSubmit={(e) => { e.preventDefault(); onAnswer(text); }} className="flex flex-col gap-2">
      {q.chips.length > 0 && (
        <div className="flex flex-wrap gap-2">
          {q.chips.map((c) => (
            <button key={c} type="button" onClick={() => setText(text ? `${text}; ${c}` : c)}
              className="rounded-full border border-zinc-300 px-3 py-1 text-left text-sm text-zinc-700 hover:border-indigo-400 hover:bg-indigo-50">
              {c}
            </button>
          ))}
        </div>
      )}
      <div className="flex gap-2">
        <label htmlFor="answer" className="sr-only">{q.ask}</label>
        <textarea id="answer" rows={2} value={text} onChange={(e) => setText(e.target.value)} placeholder="Your answer, in your own words"
          onKeyDown={(e) => { if (e.key === "Enter" && !e.shiftKey) { e.preventDefault(); onAnswer(text); } }}
          className="flex-1 resize-none rounded-lg border border-zinc-300 p-2 text-zinc-900 outline-none focus:border-indigo-500 focus:ring-2 focus:ring-indigo-100" />
        <button type="submit" disabled={!text.trim()} className="self-end rounded-lg bg-indigo-600 px-4 py-2 font-medium text-white disabled:opacity-40">Send</button>
      </div>
    </form>
  );
}

function PushbackCard({ session, busy, onResolve }: { session: Session; busy: boolean; onResolve: (c: ResolveChoice) => void }) {
  const pb = session.pushback!;
  const names = pb.flagged.join(", ");
  return (
    <div className="rounded-xl border border-red-200 bg-red-50/60 p-4">
      <h2 className="font-semibold text-red-950">Hold on: this would use student records ({names})</h2>
      <p className="mt-1 text-sm text-red-900">
        That counts as Penn State Level 3–4 data (FERPA). AI Studio agents may only use Level 1–2 data. How should the agent work instead?
      </p>
      <div className="mt-3 grid gap-2 sm:grid-cols-2">
        {pb.options.map((choice) => {
          const opt = SCENARIO.pushback.options[choice];
          return (
            <button key={choice} disabled={busy} onClick={() => onResolve(choice)} className="rounded-lg border border-zinc-300 bg-white p-3 text-left hover:border-indigo-400 disabled:opacity-50">
              <span className="block font-medium text-zinc-900">{opt.title}</span>
              <span className="block text-sm text-zinc-600">{opt.detail}</span>
            </button>
          );
        })}
      </div>
      <button disabled={busy} onClick={() => onResolve("keep")} className="mt-3 text-sm text-red-900 underline disabled:opacity-50">
        Keep it anyway
      </button>
    </div>
  );
}

function SpecPanel({ session, busy, onEdit }: { session?: Session; busy: boolean; onEdit: (k: SlotKey, v: string) => void }) {
  const [editing, setEditing] = useState<SlotKey>();
  const [draft, setDraft] = useState("");
  const canEdit = session?.step === "interview" && !session.pushback?.blocking && !busy;

  return (
    <>
      <div className="rounded-xl border border-zinc-200 bg-white p-4">
        <h2 className="mb-3 text-sm font-semibold uppercase tracking-wide text-zinc-500">Spec so far</h2>
        <dl className="space-y-3">
          {SLOT_KEYS.map((key) => {
            const slot = session?.slots.find((s) => s.key === key);
            return (
              <div key={key}>
                <dt className="flex items-center justify-between text-xs font-medium text-zinc-500">
                  <span>{SLOT_LABELS[key]}</span>
                  {slot && (
                    <span className={slot.filledBy === "requester" ? "text-indigo-700" : "text-zinc-400"}>
                      {slot.filledBy === "requester" ? "You" : `Prefilled · ${Math.round((slot.confidence ?? 0) * 100)}%`}
                    </span>
                  )}
                </dt>
                {editing === key ? (
                  <form className="mt-1 flex flex-col gap-1" onSubmit={(e) => { e.preventDefault(); onEdit(key, draft); setEditing(undefined); }}>
                    <textarea autoFocus rows={2} value={draft} onChange={(e) => setDraft(e.target.value)} className="rounded border border-zinc-300 p-1.5 text-sm" />
                    <div className="flex gap-2 text-xs">
                      <button type="submit" className="font-medium text-indigo-700">Save</button>
                      <button type="button" onClick={() => setEditing(undefined)} className="text-zinc-500">Cancel</button>
                    </div>
                  </form>
                ) : (
                  <dd className="group mt-0.5 flex items-start justify-between gap-2 text-sm text-zinc-900">
                    <span className={slot ? "" : "text-zinc-300"}>{slot?.value ?? "—"}</span>
                    {canEdit && slot && (
                      <button onClick={() => { setDraft(slot.value); setEditing(key); }} className="shrink-0 text-xs text-zinc-400 hover:text-indigo-700">Edit</button>
                    )}
                  </dd>
                )}
              </div>
            );
          })}
        </dl>
      </div>

      <div className="rounded-xl border border-zinc-200 bg-white p-4">
        <h2 className="mb-3 text-sm font-semibold uppercase tracking-wide text-zinc-500">Data sources</h2>
        {session?.sources.length ? (
          <ul className="space-y-2">{session.sources.map((s) => <SourceItem key={s.name} src={s} />)}</ul>
        ) : (
          <p className="text-sm text-zinc-400">None yet.</p>
        )}
        {session?.pushback?.choice && (
          <p className="mt-3 rounded-lg bg-zinc-50 p-2 text-xs text-zinc-700">
            <span className="font-medium">Rule added by your choice:</span> {SCENARIO.pushback.options[session.pushback.choice].rule}
          </p>
        )}
        <p className="mt-3 text-xs text-zinc-400">Levels: Penn State data classes. “rule” = decided by a fixed table; “model” = classified by AI because no rule matched.</p>
      </div>

      {session?.scope && <ScopeSummary session={session} />}

      {session && (
        <details className="rounded-xl border border-zinc-200 bg-white p-4">
          <summary className="cursor-pointer text-sm font-semibold uppercase tracking-wide text-zinc-500">Decision log ({session.log.length})</summary>
          <ol className="mt-3 space-y-1.5 text-xs">
            {session.log.map((d, i) => (
              <li key={i} className="flex gap-2">
                <span className={`w-16 shrink-0 font-medium ${d.who === "requester" ? "text-indigo-700" : d.who === "reviewer" ? "text-amber-700" : "text-zinc-500"}`}>{d.who}</span>
                <span className="text-zinc-700">{d.what}</span>
              </li>
            ))}
          </ol>
        </details>
      )}
    </>
  );
}

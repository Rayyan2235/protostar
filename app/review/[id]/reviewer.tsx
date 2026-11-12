"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import type { ReviewDecision, ReviewRound, ReviewView } from "@/lib/types";
import type { ReviewAction, ReviewResponse } from "@/lib/api";
import { BlueprintView, ExportBar } from "@/components/blueprint";
import { ModeBadge, POLL_MS } from "@/app/studio";

type Reply = { status: number; data: ReviewResponse };

async function request(reviewId: string, body?: ReviewAction): Promise<Reply> {
  const res = await fetch(`/api/review/${encodeURIComponent(reviewId)}`, body === undefined ? undefined : {
    method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify(body),
  });
  const data = (await res.json().catch(() => ({}))) as ReviewResponse;
  if (!res.ok && !data.error) data.error = `Request failed (${res.status})`;
  return { status: res.status, data };
}

const when = (iso?: string) =>
  iso ? new Date(iso).toLocaleString("en-US", { month: "short", day: "numeric", hour: "numeric", minute: "2-digit" }) : "—";

const OUTCOME: Record<ReviewRound["status"], string> = {
  pending: "Waiting", approved: "Approved", changes: "Changes requested", rejected: "Rejected",
};

export default function Reviewer({ reviewId }: { reviewId: string }) {
  const [view, setView] = useState<ReviewView>();
  const [mode, setMode] = useState<string>();
  const [missing, setMissing] = useState(false);
  const [error, setError] = useState<string>();
  const [busy, setBusy] = useState(false);
  /** The version this tab has already reported as opened. */
  const opened = useRef(0);

  const take = useCallback(({ status, data }: Reply) => {
    if (data.mode) setMode(data.mode);
    if (status === 404) {
      setMissing(true);
      setView(undefined);
      return;
    }
    if (data.review) setView(data.review); // a 409 carries the refreshed view
    setError(data.error);
  }, []);

  /** When a version is pending and new to this tab, record that the reviewer opened it. */
  const openIfNew = useCallback(async (v?: ReviewView) => {
    if (v?.status !== "pending" || opened.current === v.blueprint.version) return;
    opened.current = v.blueprint.version;
    const r = await request(reviewId, { type: "open", version: v.blueprint.version });
    if (r.data.review) setView(r.data.review);
  }, [reviewId]);

  const load = useCallback(
    () => request(reviewId).then((r) => { take(r); return openIfNew(r.data.review); }),
    [reviewId, take, openIfNew],
  );

  useEffect(() => {
    load().catch(() => setError("Network error. Reload the page."));
  }, [load]);

  // Sent back for changes: check for the resubmitted version.
  const waiting = view?.status === "changes";
  useEffect(() => {
    if (!waiting) return;
    const timer = setInterval(() => { load().catch(() => {}); }, POLL_MS);
    return () => clearInterval(timer);
  }, [waiting, load]);

  const decide = async (status: ReviewDecision, note: string): Promise<boolean> => {
    if (!view) return false;
    setBusy(true);
    try {
      const r = await request(reviewId, { type: "decide", version: view.blueprint.version, status, ...(note ? { note } : {}) });
      take(r);
      if (r.status === 409) await openIfNew(r.data.review); // stale tab: a newer version is showing now
      return r.status === 200;
    } catch {
      setError("Network error. Try again.");
      return false;
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="mx-auto flex w-full max-w-6xl flex-1 flex-col gap-6 px-4 py-6 sm:px-6">
      <header className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h1 className="text-xl font-semibold tracking-tight text-zinc-900">Protostar</h1>
          <p className="text-sm text-zinc-500">Blueprint review · prototype</p>
        </div>
        {mode && <ModeBadge mode={mode} />}
      </header>

      {missing ? (
        <div role="alert" className="rounded-xl border border-zinc-200 bg-white p-6 text-zinc-800">
          <h2 className="font-semibold text-zinc-900">This review link doesn&apos;t exist.</h2>
          <p className="mt-1 text-sm text-zinc-600">Check the link with the person who sent it.</p>
        </div>
      ) : !view ? (
        <p className="text-sm text-zinc-500">{error ?? "Loading the blueprint…"}</p>
      ) : (
        <div className="grid flex-1 gap-6 lg:grid-cols-[minmax(0,1fr)_360px]">
          <section className="rounded-xl border border-zinc-200 bg-white">
            <BlueprintView blueprint={view.blueprint} audience="reviewer" />
            <ExportBar blueprint={view.blueprint} />
          </section>
          <aside className="flex flex-col gap-4">
            <StatusCard view={view} />
            {error && <p role="alert" className="rounded-lg bg-red-50 px-3 py-2 text-sm text-red-800">{error}</p>}
            {/* Keyed by version so a resubmitted version starts with an empty note. */}
            <DecisionForm key={view.blueprint.version} enabled={view.status === "pending"} busy={busy} onDecide={decide} />
            <Rounds view={view} />
          </aside>
        </div>
      )}
    </div>
  );
}

function StatusCard({ view }: { view: ReviewView }) {
  const v = view.blueprint.version;
  const note = view.rounds.at(-1)?.note;
  const text = {
    pending: { head: `v${v} · waiting for your decision`, body: "Read the blueprint, then approve it, ask for changes, or reject it.", style: "border-sky-200 bg-sky-50 text-sky-950" },
    changes: { head: "Waiting for the requester to resubmit", body: `You asked for changes on v${v}: ${note ?? ""} This page shows the new version when it arrives.`, style: "border-amber-200 bg-amber-50 text-amber-950" },
    approved: { head: `Approved v${v}`, body: "This review is closed.", style: "border-emerald-200 bg-emerald-50 text-emerald-950" },
    rejected: { head: `Rejected v${v}`, body: note ?? "", style: "border-red-200 bg-red-50 text-red-950" },
  }[view.status];
  return (
    <div role="status" className={`rounded-xl border p-4 ${text.style}`}>
      <h2 className="font-semibold">{text.head}</h2>
      {text.body && <p className="mt-1 text-sm">{text.body}</p>}
    </div>
  );
}

function DecisionForm({ enabled, busy, onDecide }: {
  enabled: boolean; busy: boolean; onDecide: (s: ReviewDecision, note: string) => Promise<boolean>;
}) {
  const [note, setNote] = useState("");
  const [missingNote, setMissingNote] = useState<string>();
  const field = useRef<HTMLTextAreaElement>(null);

  const submit = async (status: ReviewDecision) => {
    const text = note.trim();
    if (status !== "approved" && !text) {
      setMissingNote(status === "changes" ? "Say what should change before you request changes." : "Say why before you reject it.");
      field.current?.focus();
      return;
    }
    setMissingNote(undefined);
    if (await onDecide(status, text)) setNote("");
  };

  const off = !enabled || busy;
  return (
    <form className="flex flex-col gap-2 rounded-xl border border-zinc-200 bg-white p-4" onSubmit={(e) => e.preventDefault()}>
      <h2 className="text-sm font-semibold uppercase tracking-wide text-zinc-500">Your decision</h2>
      <label htmlFor="review-note" className="text-sm text-zinc-700">Note to the requester (required to request changes or reject)</label>
      <textarea id="review-note" ref={field} rows={3} value={note} disabled={!enabled} maxLength={2000}
        onChange={(e) => setNote(e.target.value)} aria-invalid={missingNote ? true : undefined} aria-describedby={missingNote ? "review-note-error" : undefined}
        className="rounded-lg border border-zinc-300 p-2 text-sm text-zinc-900 outline-none focus:border-indigo-500 focus:ring-2 focus:ring-indigo-100 disabled:bg-zinc-50" />
      {missingNote && <p id="review-note-error" role="alert" className="text-sm text-red-800">{missingNote}</p>}
      <div className="flex flex-wrap gap-2">
        <button type="button" disabled={off} onClick={() => submit("approved")} className="rounded-lg bg-emerald-700 px-3 py-2 text-sm font-medium text-white disabled:opacity-40">Approve</button>
        <button type="button" disabled={off} onClick={() => submit("changes")} className="rounded-lg border border-amber-300 bg-amber-50 px-3 py-2 text-sm font-medium text-amber-950 disabled:opacity-40">Request changes</button>
        <button type="button" disabled={off} onClick={() => submit("rejected")} className="rounded-lg border border-red-300 bg-red-50 px-3 py-2 text-sm font-medium text-red-950 disabled:opacity-40">Reject</button>
      </div>
      {!enabled && <p className="text-xs text-zinc-500">Nothing to decide right now.</p>}
    </form>
  );
}

function Rounds({ view }: { view: ReviewView }) {
  return (
    <div className="rounded-xl border border-zinc-200 bg-white p-4">
      <h2 className="mb-2 text-sm font-semibold uppercase tracking-wide text-zinc-500">Rounds ({view.rounds.length})</h2>
      <ol className="space-y-2 text-sm">
        {view.rounds.map((r) => (
          <li key={r.version} className="rounded-lg bg-zinc-50 p-2">
            <p className="flex justify-between gap-2">
              <span className="font-medium text-zinc-900">v{r.version} · {OUTCOME[r.status]}</span>
              {r.minutes !== undefined && <span className="text-zinc-700">{r.minutes} min</span>}
            </p>
            <p className="text-xs text-zinc-500">Submitted {when(r.submittedAt)} · opened {when(r.openedAt)} · decided {when(r.decidedAt)}</p>
            {r.note && <p className="mt-1 text-xs text-zinc-700">{r.note}</p>}
          </li>
        ))}
      </ol>
      <p className="mt-3 text-sm text-zinc-900">
        <span className="font-semibold">{view.expertMinutes}</span> minutes from first open of the link to decision
        <span className="block text-xs text-zinc-500">Total over decided rounds.</span>
      </p>
    </div>
  );
}

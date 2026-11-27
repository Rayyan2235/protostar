"use client";

import { useCallback, useEffect, useRef, useState, type ReactNode } from "react";
import type { ReviewDecision, ReviewRound, ReviewView } from "@/lib/types";
import type { ReviewAction, ReviewResponse } from "@/lib/api";
import { BlueprintView, ExportBar } from "@/components/blueprint";
import { Button } from "@/components/kiln/Button";
import { EmptyState } from "@/components/EmptyState";
import { ModeBadge } from "@/components/ModeBadge";
import { StatusProvider } from "@/components/StatusStrip";
import { Notice } from "@/components/Notice";
import { MorphNote } from "@/components/MorphNote";
import { TopBar } from "@/components/TopBar";
import { POLL_MS } from "@/app/studio";

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

/** Page frame shared by every state: TopBar, then content at the app-shell width. */
function Shell({ mode, children }: { mode?: string; children: ReactNode }) {
  return (
    <StatusProvider>
      <TopBar title="Protostar" subtitle="Blueprint review · prototype">
        {mode && <ModeBadge mode={mode} />}
      </TopBar>
      <main className="mx-auto flex w-full max-w-6xl flex-1 flex-col gap-(--space-5) px-(--space-3) py-(--space-5) sm:px-(--space-6)">
        {children}
      </main>
    </StatusProvider>
  );
}

export default function Reviewer({ reviewId }: { reviewId: string }) {
  const [view, setView] = useState<ReviewView>();
  const [mode, setMode] = useState<string>();
  const [missing, setMissing] = useState(false);
  const [error, setError] = useState<string>();
  const [busy, setBusy] = useState(false);
  /** The version this tab has already reported as opened. */
  const opened = useRef(0);
  /** After a decision the form goes away; move focus to the new status instead of <body>. */
  const focusStatus = useRef(false);

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
      if (r.status === 200) focusStatus.current = true;
      return r.status === 200;
    } catch {
      setError("Network error. Try again.");
      return false;
    } finally {
      setBusy(false);
    }
  };

  useEffect(() => {
    if (!focusStatus.current) return;
    focusStatus.current = false;
    document.getElementById("review-status")?.focus();
  }, [view]);

  if (missing) {
    return (
      <Shell mode={mode}>
        <ReviewNotFound />
      </Shell>
    );
  }

  if (!view) {
    return (
      <Shell mode={mode}>
        {error ? <Notice tone="danger">{error}</Notice> : <p className="small font-normal text-ink-muted">Loading the blueprint…</p>}
      </Shell>
    );
  }

  return (
    <Shell mode={mode}>
      <h1 className="sr-only">Review blueprint v{view.blueprint.version}</h1>
      <div className="grid gap-(--space-5) lg:grid-cols-12">
        <div className="flex min-w-0 flex-col gap-(--space-4) lg:col-span-8">
          <BlueprintView blueprint={view.blueprint} audience="reviewer" status={OUTCOME[view.status]} />
          <ExportBar blueprint={view.blueprint} />
        </div>
        {/* Sticky on wide screens so the decision stays in reach while the blueprint scrolls. */}
        <aside className="flex min-w-0 flex-col gap-(--space-4) lg:sticky lg:top-(--space-3) lg:col-span-4 lg:self-start" aria-label="Your review">
          <div id="review-status" tabIndex={-1} className="rounded-(--radius-sm) focus-visible:outline-2 focus-visible:outline-offset-3 focus-visible:outline-accent">
            <StatusNotice view={view} />
          </div>
          {error && <Notice tone="danger">{error}</Notice>}
          {/* Only while a decision is open; a decided version shows its status alone. Keyed by version so v2 starts empty. */}
          {view.status === "pending" && <DecisionForm key={view.blueprint.version} version={view.blueprint.version} enabled busy={busy} onDecide={decide} />}
        </aside>
        <div className="min-w-0 lg:col-span-8">
          <Rounds view={view} />
        </div>
      </div>
    </Shell>
  );
}

/** A bad review link: type-only empty state, one way forward. */
export function ReviewNotFound() {
  return (
    <EmptyState mark="Not found." action={<Button kind="outline" href="/">Go to the start</Button>}>
      This review link doesn&apos;t exist. Check the link with the person who sent it.
    </EmptyState>
  );
}

/** Where the review stands, in words. Rejected is an alert; the rest are status. */
export function StatusNotice({ view }: { view: ReviewView }) {
  const v = view.blueprint.version;
  const note = view.rounds.at(-1)?.note;
  const s = {
    pending: { tone: "accent", head: `v${v} · waiting for your decision`, body: "Read the blueprint, then approve it, ask for changes, or reject it." },
    changes: { tone: "neutral", head: "Waiting for the requester to resubmit", body: `You asked for changes on v${v}: ${note ?? ""} This page shows the new version when it arrives.` },
    approved: { tone: "success", head: `Approved v${v}`, body: "This review is closed." },
    rejected: { tone: "danger", head: `Rejected v${v}`, body: note || "This review is closed." },
  } as const;
  const { tone, head, body } = s[view.status];
  return <Notice tone={tone} title={head}>{body}</Notice>;
}

/** Each decision's panel. Approve and Reject end the review, so they have no shortcut (K6b). */
export const DECISIONS = {
  approved: { trigger: "Approve", prompt: "Note to the requester (optional)", submit: (v: number) => `Approve v${v}`, submitKey: false, required: false },
  changes: { trigger: "Request changes", prompt: "What should change? (sent to the requester)", submit: () => "Request changes", submitKey: true, required: true },
  rejected: { trigger: "Reject", prompt: "Why reject? (sent to the requester)", submit: (v: number) => `Reject v${v}`, submitKey: false, required: true },
} as const satisfies Record<ReviewDecision, unknown>;

const MISSING_NOTE: Partial<Record<ReviewDecision, string>> = {
  changes: "Say what should change before you request changes.",
  rejected: "Say why before you reject it.",
};

/** What a submit does: send with the trimmed note, or say why not. Approve's note is optional. */
export function decisionSubmit(status: ReviewDecision, note: string):
  { send: { status: ReviewDecision; note: string } } | { error: string } {
  const text = note.trim();
  if (DECISIONS[status].required && !text) return { error: MISSING_NOTE[status]! };
  return { send: { status, note: text } };
}

const ORDER: ReviewDecision[] = ["approved", "changes", "rejected"];

/**
 * The decision panel: the one card on the page, because it is the thing you act on. Each decision
 * morphs into its own note panel with one submit; while one is open the other two are hidden, so it
 * has one target. Approve is the filled primary. Typed notes survive a close.
 */
export function DecisionForm({ version, enabled, busy, onDecide, initialOpen }: {
  version: number; enabled: boolean; busy: boolean; onDecide: (s: ReviewDecision, note: string) => Promise<boolean>;
  /** Server-render a panel open (tests). The page always starts closed. */
  initialOpen?: ReviewDecision;
}) {
  const [open, setOpen] = useState<ReviewDecision | undefined>(initialOpen);
  const [notes, setNotes] = useState<Record<ReviewDecision, string>>({ approved: "", changes: "", rejected: "" });
  const [error, setError] = useState<string>();

  const submit = async (status: ReviewDecision) => {
    const r = decisionSubmit(status, notes[status]);
    if ("error" in r) {
      setError(r.error);
      document.getElementById("review-note")?.focus();
      return;
    }
    setError(undefined);
    if (await onDecide(r.send.status, r.send.note)) setNotes((n) => ({ ...n, [status]: "" }));
  };

  const off = !enabled || busy;
  return (
    <div className="flex flex-col gap-(--space-3) rounded-(--radius-md) border border-hairline bg-paper-raised p-(--space-3)">
      <h2 className="title text-ink">Your decision</h2>
      <div className="flex flex-wrap items-center gap-(--space-2)">
        {ORDER.filter((s) => !open || open === s).map((s) => {
          const d = DECISIONS[s];
          return (
            <MorphNote key={s} id="review-note" triggerId={`decide-${s}-btn`} name={`morph-decision-${s}`}
              open={open === s} onOpenChange={(o) => { setOpen(o ? s : undefined); setError(undefined); }}
              trigger={d.trigger} triggerKind={s === "approved" ? "primary" : "outline"} triggerDanger={s === "rejected"} disabled={off}
              prompt={d.prompt} value={notes[s]} onChange={(v) => setNotes((n) => ({ ...n, [s]: v }))} error={open === s ? error : undefined}
              maxLength={2000} submitLabel={d.submit(version)} submitDanger={s === "rejected"}
              submitKey={d.submitKey} required={d.required} busy={off} onSubmit={() => submit(s)} />
          );
        })}
      </div>
      {!enabled && <p className="small font-normal text-ink-muted">Nothing to decide right now.</p>}
    </div>
  );
}

/** Every round as a List row, newest last; the expert minutes in a label. */
export function Rounds({ view }: { view: ReviewView }) {
  return (
    <section className="flex flex-col gap-(--space-2)">
      <h2 className="label text-ink-muted">Rounds ({view.rounds.length})</h2>
      <ol>
        {view.rounds.map((r) => (
          <li key={r.version} className="border-b border-hairline py-(--space-2)">
            <p className="flex justify-between gap-(--space-2)">
              <span className="small text-ink">v{r.version} · {OUTCOME[r.status]}</span>
              {r.minutes !== undefined && <span className="label text-ink-soft">{r.minutes} min</span>}
            </p>
            <p className="label mt-(--space-1) text-ink-muted">Submitted {when(r.submittedAt)} · opened {when(r.openedAt)} · decided {when(r.decidedAt)}</p>
            {r.note && <p className="small mt-(--space-1) font-normal text-ink-soft">{r.note}</p>}
          </li>
        ))}
      </ol>
      <p className="small font-normal text-ink">
        <span className="font-semibold">{view.expertMinutes}</span> minutes from first open of the link to decision
        <span className="label block text-ink-muted">Total over decided rounds.</span>
      </p>
    </section>
  );
}

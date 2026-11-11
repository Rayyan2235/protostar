"use client";

import { useState, type ReactNode } from "react";
import type { Blueprint, BlueprintSlot, Level } from "@/lib/types";
import { aiStudioText, blueprintJson, blueprintMarkdown, exportFileName } from "@/lib/export";
import { formatDollars } from "@/lib/scoper";

type Audience = "requester" | "reviewer";

/** Badge colors by data level (index = level). */
export const LEVEL_STYLE = ["", "bg-emerald-100 text-emerald-900", "bg-sky-100 text-sky-900", "bg-red-100 text-red-900", "bg-red-200 text-red-950"];

const RISK_STYLE = { Low: "bg-emerald-100 text-emerald-900", Medium: "bg-amber-100 text-amber-900", High: "bg-red-100 text-red-900" } as const;

/** ISO date or timestamp -> YYYY-MM-DD. Same output on server and client. */
const day = (iso: string) => iso.slice(0, 10);

export function LevelBadge({ level }: { level: Level }) {
  return <span className={`rounded px-1.5 py-0.5 text-xs font-medium ${LEVEL_STYLE[level]}`}>L{level}</span>;
}

function Section({ title, aside, children }: { title: string; aside?: ReactNode; children: ReactNode }) {
  return (
    <section className="border-t border-zinc-200 pt-4">
      <div className="mb-2 flex flex-wrap items-center justify-between gap-2">
        <h3 className="text-sm font-semibold uppercase tracking-wide text-zinc-500">{title}</h3>
        {aside}
      </div>
      {children}
    </section>
  );
}

function SpecRow({ slot, audience }: { slot: BlueprintSlot; audience: Audience }) {
  const byRequester = slot.filledBy === "requester";
  return (
    <div>
      <dt className="flex items-center justify-between gap-2 text-xs font-medium text-zinc-500">
        <span>{slot.label}</span>
        <span className={byRequester ? "text-indigo-700" : "text-zinc-500"}>
          {byRequester ? (audience === "requester" ? "You" : "Requester") : "Filled by the tool"}
        </span>
      </dt>
      <dd className="mt-0.5 whitespace-pre-wrap text-sm text-zinc-900">
        {slot.value || <span className="text-zinc-400">Not answered</span>}
      </dd>
      {slot.note && <dd className="mt-1 rounded bg-amber-50 px-2 py-1 text-xs text-amber-900">{slot.note}</dd>}
    </div>
  );
}

/** The one-page blueprint: what the requester submits and the reviewer approves. Read-only. */
export function BlueprintView({ blueprint: bp, audience }: { blueprint: Blueprint; audience: Audience }) {
  const { data, scope } = bp;
  return (
    <article className="flex flex-col gap-4 p-4" aria-label={`Blueprint v${bp.version}`}>
      <header>
        <p className="text-xs font-medium text-zinc-500">
          {bp.draft ? `Draft · becomes v${bp.version} when submitted` : `v${bp.version} · submitted ${day(bp.builtAt)}`}
        </p>
        <h2 className="mt-1 text-lg font-semibold text-zinc-900">{bp.title}</h2>
        <p className="mt-1 whitespace-pre-wrap text-sm text-zinc-700">
          <span className="font-medium text-zinc-900">Purpose: </span>{bp.idea}
        </p>
      </header>

      <Section title="Spec">
        <dl className="space-y-3">
          {bp.spec.map((s) => <SpecRow key={s.key} slot={s} audience={audience} />)}
        </dl>
      </Section>

      <Section
        title="Data"
        aside={
          <span className={`rounded-full px-2 py-0.5 text-xs font-medium ${data.allowed ? "bg-emerald-100 text-emerald-900" : "bg-red-100 text-red-900"}`}>
            {data.allowed ? `Allowed · highest Level ${data.maxLevel}` : `Blocked · Level ${data.maxLevel}`}
          </span>
        }
      >
        <p className="text-sm text-zinc-800">{data.summary}</p>
        {data.sources.length > 0 && (
          <ul className="mt-2 space-y-1.5">
            {data.sources.map((s) => (
              <li key={s.name} className="flex items-start justify-between gap-2 text-sm">
                <span className="text-zinc-800">{s.url ? <a href={s.url} target="_blank" rel="noreferrer" className="underline decoration-zinc-300">{s.name}</a> : s.name}</span>
                <span className="flex shrink-0 gap-1">
                  <LevelBadge level={s.level} />
                  <span className="rounded bg-zinc-100 px-1.5 py-0.5 text-xs text-zinc-600" title={s.reason}>{s.decidedBy}</span>
                </span>
              </li>
            ))}
          </ul>
        )}
        {data.pushback && (
          <div className="mt-3 rounded-lg border border-zinc-200 bg-zinc-50 p-3 text-sm">
            <p className="text-zinc-700">
              <span className="font-medium text-zinc-900">Flagged and removed: </span>
              {data.pushback.flagged.map((f, i) => (
                <span key={f.name}>
                  {i > 0 && ", "}
                  {f.name}
                  {f.level && <> <LevelBadge level={f.level} /></>}
                </span>
              ))}
            </p>
            <p className="mt-2 text-zinc-700"><span className="font-medium text-zinc-900">Data choice: </span>{data.pushback.title}</p>
            <p className="mt-1 text-zinc-700"><span className="font-medium text-zinc-900">Rule added: </span>{data.pushback.rule}</p>
          </div>
        )}
      </Section>

      <Section title="Scope and cost">
        <p className="flex flex-wrap items-center gap-2 text-sm">
          <span className="font-medium text-zinc-900">{scope.label}</span>
          <span className={`rounded-full px-2 py-0.5 text-xs font-medium ${RISK_STYLE[scope.risk]}`}>{scope.risk} risk</span>
        </p>
        <p className="mt-1 text-sm text-zinc-700">{scope.desc}</p>
        <p className="mt-2 text-sm text-zinc-800">
          Model: <span className="font-medium">{scope.model}</span> · {scope.knobs.studentsPerMonth.toLocaleString("en-US")} students/month × {scope.knobs.convsPerStudent} conversations each
        </p>
        <p className="mt-1 text-sm text-zinc-900">
          {scope.estimate
            ? <>≈ <span className="font-semibold">{formatDollars(scope.estimate.monthlyDollars)}</span>/month</>
            : "No list price on file for this model, so no estimate."}
        </p>
        <p className="mt-1 text-xs text-zinc-500">{bp.costNote}</p>
      </Section>

      <Section title="Knowledge">
        {bp.knowledge.length ? (
          <ul className="space-y-1.5">
            {bp.knowledge.map((k) => (
              <li key={k.url} className="flex items-start justify-between gap-2 text-sm">
                <a href={k.url} target="_blank" rel="noreferrer" className="text-zinc-800 underline decoration-zinc-300">{k.title}</a>
                <span className="flex shrink-0 items-center gap-1 text-xs text-zinc-500">
                  fetched {day(k.fetchedAt)} <LevelBadge level={k.level} />
                </span>
              </li>
            ))}
          </ul>
        ) : (
          <p className="text-sm text-zinc-400">No knowledge pages.</p>
        )}
      </Section>

      <Section
        title="Draft instructions"
        aside={<span className="rounded bg-zinc-100 px-1.5 py-0.5 text-xs text-zinc-600">{bp.instructions.draftedBy === "template" ? "template" : "drafted by model"}</span>}
      >
        <pre className="max-h-80 overflow-auto whitespace-pre-wrap rounded-lg bg-zinc-50 p-3 font-sans text-sm text-zinc-800">{bp.instructions.text}</pre>
      </Section>

      <Section title="Tests">
        <p className="text-sm text-zinc-600">{bp.tests.note}</p>
      </Section>

      <details className="border-t border-zinc-200 pt-4">
        <summary className="cursor-pointer text-sm font-semibold uppercase tracking-wide text-zinc-500">Decision log ({bp.log.length})</summary>
        <ol className="mt-3 space-y-1.5 text-xs">
          {bp.log.map((d, i) => (
            <li key={i} className="flex gap-2">
              <span className={`w-16 shrink-0 font-medium ${d.who === "requester" ? "text-indigo-700" : d.who === "reviewer" ? "text-amber-700" : "text-zinc-500"}`}>{d.who}</span>
              <span className="text-zinc-700">{d.what}</span>
            </li>
          ))}
        </ol>
      </details>
    </article>
  );
}

function download(text: string, name: string, type: string) {
  const url = URL.createObjectURL(new Blob([text], { type }));
  const a = document.createElement("a");
  a.href = url;
  a.download = name;
  a.click();
  setTimeout(() => URL.revokeObjectURL(url), 0);
}

/** Markdown and JSON downloads, plus a copy-paste block for AI Studio. */
export function ExportBar({ blueprint: bp }: { blueprint: Blueprint }) {
  const [status, setStatus] = useState("");

  const copy = async () => {
    try {
      await navigator.clipboard.writeText(aiStudioText(bp));
      setStatus("Copied. Field names are provisional.");
    } catch {
      setStatus("Couldn't copy. Use Download Markdown instead.");
    }
  };

  const btn = "rounded-lg border border-zinc-300 bg-white px-3 py-1.5 text-sm font-medium text-zinc-800 hover:border-indigo-400 hover:bg-indigo-50";
  return (
    <div className="flex flex-wrap items-center gap-2 border-t border-zinc-200 p-4">
      <button type="button" className={btn} onClick={() => download(blueprintMarkdown(bp), exportFileName(bp, "md"), "text/markdown")}>
        Download Markdown
      </button>
      <button type="button" className={btn} onClick={() => download(blueprintJson(bp), exportFileName(bp, "json"), "application/json")}>
        Download JSON
      </button>
      <button type="button" className={btn} onClick={copy} aria-describedby="ai-studio-note">
        Copy for AI Studio
      </button>
      <span id="ai-studio-note" className="text-xs text-zinc-500">AI Studio field names provisional</span>
      <span role="status" className="w-full text-xs text-zinc-600">{status}</span>
    </div>
  );
}

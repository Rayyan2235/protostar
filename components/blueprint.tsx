"use client";

import { useState, type ReactNode } from "react";
import type { Blueprint, BlueprintSlot, Level, Source } from "@/lib/types";
import { aiStudioText, blueprintJson, blueprintMarkdown, exportFileName } from "@/lib/export";
import { formatDollars } from "@/lib/scoper";
import { Button } from "@/components/kiln/Button";
import { SpecSheet } from "@/components/kiln/SpecSheet";
import { Tag } from "@/components/kiln/Tag";
import { DecisionLog } from "@/components/DecisionLog";
import { Notice } from "@/components/Notice";

type Audience = "requester" | "reviewer";

/** ISO date or timestamp -> YYYY-MM-DD. Same output on server and client. */
const day = (iso: string) => iso.slice(0, 10);

/** A data level, always in words. */
export function LevelBadge({ level }: { level: Level }) {
  return <Tag>Level {level}</Tag>;
}

const LINK = "text-link underline underline-offset-4 decoration-stone hover:decoration-link focus-visible:outline-2 focus-visible:outline-offset-3 focus-visible:outline-accent";

/** A data source: name (linked when public), level, who decided it, and why (visible, not hover-only). */
export function SourceItem({ src }: { src: Source }) {
  return (
    <li className="border-b border-hairline py-(--space-2) last:border-b-0">
      <div className="flex flex-wrap items-start justify-between gap-(--space-2)">
        <span className="small text-ink">
          {src.url ? <a href={src.url} target="_blank" rel="noreferrer" className={LINK}>{src.name}</a> : src.name}
        </span>
        <span className="flex shrink-0 gap-(--space-1)">
          <LevelBadge level={src.level} />
          <Tag>by {src.decidedBy}</Tag>
        </span>
      </div>
      <p className="small mt-(--space-1) font-normal text-ink-muted">{src.reason}</p>
    </li>
  );
}

/** A blueprint section: grouped by space and a hairline, headed by a mono label. No boxes. */
function Section({ title, aside, children }: { title: string; aside?: ReactNode; children: ReactNode }) {
  return (
    <section className="border-t border-hairline pt-(--space-3)">
      <div className="mb-(--space-2) flex flex-wrap items-center justify-between gap-(--space-2)">
        <h3 className="label uppercase text-ink-muted">{title}</h3>
        {aside}
      </div>
      {children}
    </section>
  );
}

function SpecRow({ slot, audience }: { slot: BlueprintSlot; audience: Audience }) {
  const byRequester = slot.filledBy === "requester";
  return (
    <div className="border-b border-hairline py-(--space-2) last:border-b-0">
      <dt className="flex flex-wrap items-center justify-between gap-(--space-2)">
        <span className="small text-ink-soft">{slot.label}</span>
        <Tag>{byRequester ? (audience === "requester" ? "You" : "Requester") : "Filled by the tool"}</Tag>
      </dt>
      <dd className="body mt-(--space-1) whitespace-pre-wrap text-ink">
        {slot.value || <span className="text-ink-muted">Not answered</span>}
      </dd>
      {slot.note && <dd className="small mt-(--space-1) font-normal text-ink-soft"><span className="font-semibold text-ink">Note: </span>{slot.note}</dd>}
    </div>
  );
}

/** The one-page blueprint: what the requester submits and the reviewer approves. Read-only. */
export function BlueprintView({ blueprint: bp, audience, status }: {
  blueprint: Blueprint;
  audience: Audience;
  /** The review state in words. Defaults to draft / submitted. */
  status?: string;
}) {
  const { data, scope } = bp;
  const cost = (
    <span className="flex flex-col gap-(--space-1) sm:items-end">
      <span>
        {scope.estimate
          ? <>≈ <span className="font-semibold">{formatDollars(scope.estimate.monthlyDollars)}</span></>
          : "No list price on file for this model, so no estimate."}
      </span>
      <span className="text-ink-muted">{bp.costNote}</span>
    </span>
  );

  return (
    <article className="flex flex-col gap-(--space-5)" aria-label={`Blueprint v${bp.version}`}>
      <div className="flex flex-col gap-(--space-3)">
        <SpecSheet
          number={bp.draft ? "Draft" : `v${bp.version}`}
          title={bp.title}
          revision={bp.draft ? `becomes v${bp.version} on submit` : `rev. ${day(bp.builtAt)}`}
          rows={[
            { label: "Scope", value: `${scope.label} · ${scope.risk} risk` },
            { label: "Model", value: scope.model },
            { label: "Est. cost / month", value: cost },
            { label: "Highest data level", value: `Level ${data.maxLevel} · ${data.allowed ? "allowed" : "blocked"}` },
            { label: "Data choice", value: data.pushback ? data.pushback.title : "Nothing flagged" },
            { label: "Tests", value: bp.tests.status === "not-run" ? "Not run yet" : String(bp.tests.status) },
            { label: "Status", value: status ?? (bp.draft ? "Draft, not submitted" : "Submitted") },
          ]}
        />
        <p className="body whitespace-pre-wrap text-ink-soft">
          <span className="font-semibold text-ink">Purpose: </span>{bp.idea}
        </p>
      </div>

      <Section title="Spec">
        <dl>
          {bp.spec.map((s) => <SpecRow key={s.key} slot={s} audience={audience} />)}
        </dl>
      </Section>

      <Section title="Data">
        <p className="body text-ink">{data.summary}</p>
        {data.sources.length > 0 && (
          <ul className="mt-(--space-2)">
            {data.sources.map((s) => <SourceItem key={s.name} src={s} />)}
          </ul>
        )}
        {data.pushback && (
          <div className="mt-(--space-3)">
            <Notice tone="accent" title="Flagged and removed" live={false}>
              <p>
                {data.pushback.flagged.map((f, i) => (
                  <span key={f.name}>
                    {i > 0 && ", "}
                    {f.name}
                    {f.level && <> <LevelBadge level={f.level} /></>}
                  </span>
                ))}
              </p>
              <p className="mt-(--space-1)"><span className="font-semibold text-ink">Data choice: </span>{data.pushback.title}</p>
              <p className="mt-(--space-1)"><span className="font-semibold text-ink">Rule added: </span>{data.pushback.rule}</p>
            </Notice>
          </div>
        )}
      </Section>

      <Section title="Scope" aside={<Tag>{scope.risk} risk</Tag>}>
        <p className="title text-ink">{scope.label}</p>
        <p className="body mt-(--space-1) text-ink-soft">{scope.desc}</p>
        <p className="small mt-(--space-2) font-normal text-ink-soft">
          Model: <span className="font-semibold text-ink">{scope.model}</span> · {scope.knobs.studentsPerMonth.toLocaleString("en-US")} students/month × {scope.knobs.convsPerStudent} conversations each
        </p>
      </Section>

      <Section title="Knowledge">
        {bp.knowledge.length ? (
          <ul>
            {bp.knowledge.map((k) => (
              <li key={k.url} className="flex flex-wrap items-start justify-between gap-(--space-2) border-b border-hairline py-(--space-2) last:border-b-0">
                <a href={k.url} target="_blank" rel="noreferrer" className={`small ${LINK}`}>{k.title}</a>
                <span className="flex shrink-0 items-center gap-(--space-2)">
                  <span className="label text-ink-muted">fetched {day(k.fetchedAt)}</span>
                  <LevelBadge level={k.level} />
                </span>
              </li>
            ))}
          </ul>
        ) : (
          <p className="small font-normal text-ink-muted">No knowledge pages.</p>
        )}
      </Section>

      <Section title="Draft instructions" aside={<Tag>{bp.instructions.draftedBy === "template" ? "template" : "drafted by model"}</Tag>}>
        <pre className="small max-h-[calc(var(--space-8)*2)] overflow-auto whitespace-pre-wrap rounded-(--radius-sm) bg-paper-sunk p-(--space-3) font-body font-normal text-ink">{bp.instructions.text}</pre>
      </Section>

      <Section title="Tests">
        <p className="body text-ink-soft">{bp.tests.note}</p>
      </Section>

      <DecisionLog log={bp.log} />
    </article>
  );
}

function download(text: string, name: string, type: string) {
  const url = URL.createObjectURL(new Blob([text], { type }));
  const a = document.createElement("a");
  a.href = url;
  a.download = name;
  document.body.appendChild(a);
  a.click();
  a.remove();
  // Revoking at once can cancel the download in Safari; give it a moment to start.
  setTimeout(() => URL.revokeObjectURL(url), 1000);
}

/** Markdown and JSON downloads, plus a copy-paste block for AI Studio. Outline buttons: the screen's pill is elsewhere. */
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

  return (
    <div className="flex flex-wrap items-center gap-(--space-2) border-t border-hairline pt-(--space-3)">
      <Button kind="outline" onClick={() => download(blueprintMarkdown(bp), exportFileName(bp, "md"), "text/markdown")}>
        Download Markdown
      </Button>
      <Button kind="outline" onClick={() => download(blueprintJson(bp), exportFileName(bp, "json"), "application/json")}>
        Download JSON
      </Button>
      <Button kind="outline" onClick={copy} aria-describedby="ai-studio-note">
        Copy for AI Studio
      </Button>
      <span id="ai-studio-note" className="label text-ink-muted">AI Studio field names provisional</span>
      <span role="status" className="small w-full font-normal text-ink-soft">{status}</span>
    </div>
  );
}

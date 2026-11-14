"use client";

import type { ReactNode } from "react";
import type { Blueprint, BlueprintSlot, Level, Source } from "@/lib/types";
import { aiStudioText, blueprintJson, blueprintMarkdown, exportFileName } from "@/lib/export";
import { formatDollars } from "@/lib/scoper";
import { Button } from "@/components/kiln/Button";
import { CopyButton } from "@/components/CopyButton";
import { useStatus } from "@/components/StatusStrip";
import { SpecSheet } from "@/components/kiln/SpecSheet";
import { Tag } from "@/components/kiln/Tag";
import { DecisionLog } from "@/components/DecisionLog";
import { Figure } from "@/components/Figure";
import { FoldedSheet } from "@/components/FoldedSheet";
import { SectionTabs } from "@/components/SectionTabs";
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
        <span className="flex shrink-0 items-center gap-(--space-2)">
          <span className="label text-ink-muted">by {src.decidedBy}</span>
          <LevelBadge level={src.level} />
        </span>
      </div>
      <p className="small mt-(--space-1) font-normal text-ink-muted">{src.reason}</p>
    </li>
  );
}

/** A blueprint section: grouped by space and headed by a mono label (Kiln §5: space, not rules). No boxes. */
function Section({ title, aside, children }: { title: string; aside?: ReactNode; children: ReactNode }) {
  return (
    <section>
      <div className="mb-(--space-2) flex flex-wrap items-center justify-between gap-(--space-2)">
        <h3 className="label text-ink-muted">{title}</h3>
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
        <span className="label text-ink-muted">{byRequester ? (audience === "requester" ? "You" : "Requester") : "Filled by the tool"}</span>
      </dt>
      <dd className="body mt-(--space-1) whitespace-pre-wrap text-ink">
        {slot.value || <span className="text-ink-muted">Not answered</span>}
      </dd>
      {slot.note && <dd className="small mt-(--space-1) font-normal text-ink-soft"><span className="font-semibold text-ink">Note: </span>{slot.note}</dd>}
    </div>
  );
}

/**
 * The one-page blueprint: what the requester submits and the reviewer approves. Read-only.
 * The requester's live draft is split into SectionTabs (K6b); a submitted blueprint shows in one
 * scroll on a FoldedSheet, because the reviewer approves the whole page.
 */
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
          ? <>≈ <span className="font-semibold"><Figure value={scope.estimate.monthlyDollars} format={formatDollars} /></span></>
          : "No list price on file for this model, so no estimate."}
      </span>
      <span className="text-ink-muted">{bp.costNote}</span>
    </span>
  );

  const header = (
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
  );
  const summary = (
    <>
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
    </>
  );
  const instructions = (
    <Section title="Draft instructions" aside={<Tag>{bp.instructions.draftedBy === "template" ? "template" : "drafted by model"}</Tag>}>
      <pre className="small max-h-[calc(var(--space-8)*2)] overflow-auto whitespace-pre-wrap rounded-(--radius-sm) bg-paper-sunk p-(--space-3) font-body font-normal text-ink">{bp.instructions.text}</pre>
    </Section>
  );
  const testsSection = (
    <Section title="Tests">
      <p className="body text-ink-soft">{bp.tests.note}</p>
    </Section>
  );

  if (bp.draft && audience === "requester") {
    return (
      <article className="flex flex-col gap-(--space-5)" aria-label={`Blueprint v${bp.version}`}>
        {header}
        <SectionTabs id="blueprint" label="Blueprint sections" tabs={[
          { key: "summary", name: "Summary", panel: <div className="flex flex-col gap-(--space-6)">{summary}</div> },
          { key: "tests", name: testsTabName(bp), panel: testsSection },
          { key: "decisions", name: "Decisions", panel: <DecisionLog log={bp.log} open /> },
          { key: "export", name: "Export", panel: <div className="flex flex-col gap-(--space-4)">{instructions}<ExportBar blueprint={bp} /></div> },
        ]} />
      </article>
    );
  }

  const sheet = (
    <article className="flex flex-col gap-(--space-6)" aria-label={`Blueprint v${bp.version}`}>
      {header}
      {summary}
      {instructions}
      {testsSection}
      <DecisionLog log={bp.log} />
    </article>
  );
  return bp.draft ? sheet : <FoldedSheet>{sheet}</FoldedSheet>;
}

/** The Tests tab carries the run's state in its name, so the tab's accessible name says it. */
export function testsTabName(bp: Blueprint): string {
  return bp.tests.status === "not-run" ? "Tests · not run" : "Tests";
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

/**
 * Markdown and JSON downloads, plus a copy-paste block for AI Studio. All outline: the screen's one
 * filled primary is elsewhere. Results are announced by the StatusStrip; no live region here.
 */
export function ExportBar({ blueprint: bp }: { blueprint: Blueprint }) {
  const { say } = useStatus();
  const save = (ext: "md" | "json") => {
    const name = exportFileName(bp, ext);
    if (ext === "md") download(blueprintMarkdown(bp), name, "text/markdown");
    else download(blueprintJson(bp), name, "application/json");
    say(`Downloaded ${name}`);
  };

  return (
    <div className="flex flex-wrap items-center gap-(--space-2)">
      <Button kind="outline" onClick={() => save("md")}>Download Markdown</Button>
      <Button kind="outline" onClick={() => save("json")}>Download JSON</Button>
      <CopyButton label="Copy for AI Studio" text={() => aiStudioText(bp)} message="Copied for AI Studio" describedBy="ai-studio-note"
        failText="Couldn't copy. Use Download Markdown instead." />
      <span id="ai-studio-note" className="label text-ink-muted">AI Studio field names provisional</span>
    </div>
  );
}

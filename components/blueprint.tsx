"use client";

import { createContext, useContext, useRef, useState, type ReactNode } from "react";
import type { Blueprint, BlueprintSlot, Level, Role2, Source, TestsSummary } from "@/lib/types";
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
import { InkMark } from "@/components/InkMark";
import { testNo } from "@/components/ResultTable";
import { staleNote } from "@/lib/testSummary";
import { useSectionReveal } from "@/components/motion/scroll";
import { gsap, space, track, useKilnMotion } from "@/components/motion/kiln";

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
/** True on the reviewer's submitted sheet: its sections fade in on scroll (K7). */
const RevealCtx = createContext(false);

function Section({ title, aside, children }: { title: string; aside?: ReactNode; children: ReactNode }) {
  const reveal = useContext(RevealCtx);
  return (
    <section data-reveal={reveal ? "" : undefined}>
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
export function BlueprintView({ blueprint: bp, audience, status, costInk = true, onRunTests, busy = false }: {
  blueprint: Blueprint;
  audience: Audience;
  /** The review state in words. Defaults to draft / submitted. */
  status?: string;
  /** The cost's ink circle. Off once the reviewer's approved stamp carries the screen's one ink mark (K7). */
  costInk?: boolean;
  /** Draft only: re-run the tests from the blueprint (TESTS_RUN is allowed there). No handler, no control. */
  onRunTests?: () => void;
  busy?: boolean;
}) {
  const { data, scope } = bp;
  // K7: the reviewer's submitted sheet unfolds once per version and reveals its lower sections.
  const reviewing = audience === "reviewer" && !bp.draft;
  const sheetRef = useRef<HTMLElement>(null);
  useSectionReveal(sheetRef, reviewing);
  const cost = (
    <span className="flex flex-col gap-(--space-1) sm:items-end">
      <span>
        {scope.estimate
          // The page's one ink mark: the number a reviewer signs off on.
          ? (() => {
              const figure = <span className="font-semibold"><Figure value={scope.estimate.monthlyDollars} format={formatDollars} /></span>;
              return <>≈ {costInk ? <InkMark kind="circle">{figure}</InkMark> : figure}</>;
            })()
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
          { label: "Tests", value: bp.tests.status === "not-run" ? "Not run yet" : bp.tests.headline },
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
  const stale = bp.tests.status === "run" && bp.tests.stale;
  const testsSection = <TestsSection tests={bp.tests} version={bp.version} frozen={!bp.draft} />;

  if (bp.draft && audience === "requester") {
    return (
      <article className="flex flex-col gap-(--space-5)" aria-label={`Blueprint v${bp.version}`}>
        {header}
        {/* Outside the tab panels (K6), so it reads whichever tab is open. */}
        {stale && (
          <div className="flex flex-wrap items-center gap-(--space-2)">
            <StaleLine blueprint={bp} rise />
            {onRunTests && <Button id="blueprint-rerun" kind="outline" disabled={busy} onClick={onRunTests}>Run tests again</Button>}
          </div>
        )}
        <SectionTabs id="blueprint" label="Blueprint sections" tabs={[
          { key: "summary", name: "Summary", panel: <div className="flex flex-col gap-(--space-6)">{summary}</div> },
          { key: "tests", name: testsTabName(bp), panel: (
            <div className="flex flex-col gap-(--space-3)">
              {testsSection}
              {onRunTests && <div><Button id="blueprint-rerun-panel" kind="outline" disabled={busy} onClick={onRunTests}>Run tests again</Button></div>}
            </div>
          ) },
          { key: "decisions", name: "Decisions", panel: <DecisionLog log={bp.log} open /> },
          { key: "export", name: "Export", panel: <div className="flex flex-col gap-(--space-4)">{instructions}<ExportBar blueprint={bp} /></div> },
        ]} />
      </article>
    );
  }

  const sheet = (
    <RevealCtx.Provider value={reviewing}>
      <article ref={sheetRef} className="flex flex-col gap-(--space-6)" aria-label={`Blueprint v${bp.version}`}>
        {header}
        {summary}
        {instructions}
        {testsSection}
        <DecisionLog log={bp.log} version={bp.version} />
      </article>
    </RevealCtx.Provider>
  );
  return bp.draft ? sheet : <FoldedSheet unfold={reviewing} version={bp.version}>{sheet}</FoldedSheet>;
}

/** The Tests tab carries the run's state in its name, so the tab's accessible name says it. */
export function testsTabName(bp: Blueprint): string {
  const t = bp.tests;
  if (t.status === "not-run") return "Tests · not run";
  if (t.stale) return "Tests · out of date";
  return t.failures.length ? `Tests · ${t.failures.length} failed` : "Tests · all passed";
}

const ROLE_NAME: Record<Role2, string> = { cheap: "Cheap", capable: "Capable" };

/**
 * The blueprint's tests: the headline first, then each failure as a hairline row with its
 * accepted note. The source Tag is always shown once there's a run, so an offline script is
 * never read as model evidence.
 */
/**
 * `staleNote(version)` in danger ink when the blueprint's run is out of date; nothing otherwise.
 * Never retyped. `rise` (draft only): when it appears after an edit in this tab, it rises in by
 * --space-2 with opacity (motionOk gates it); still on load, on the FoldedSheet and the reviewer.
 */
export function StaleLine({ blueprint: bp, rise = false }: { blueprint: Blueprint; rise?: boolean }) {
  const stale = bp.tests.status === "run" && bp.tests.stale;
  // Whether it just appeared in this tab ("state from props"): never on the first paint.
  const [was, setWas] = useState(stale);
  const [appeared, setAppeared] = useState(false);
  if (was !== stale) {
    setWas(stale);
    setAppeared(stale);
  }
  const ref = useRef<HTMLParagraphElement>(null);
  useKilnMotion(ref, (t) => {
    if (rise && appeared && ref.current) track(gsap.from(ref.current, { y: space("--space-2"), opacity: 0, duration: t.quick, ease: t.ease }));
  }, [appeared]);
  if (!stale) return null;
  return <p ref={ref} className="small font-semibold text-danger">{staleNote(bp.version)}</p>;
}

function TestsSection({ tests: t, version, frozen }: { tests: TestsSummary; version: number; frozen: boolean }) {
  if (t.status === "not-run") {
    return (
      <Section title="Tests">
        <p className="body text-ink-soft">{t.note}</p>
      </Section>
    );
  }
  return (
    <Section title="Tests" aside={<Tag>{t.label}</Tag>}>
      {/* The frozen sheet says it in its Tests section; the draft says it once above its tabs. */}
      {frozen && t.stale && <p className="small font-semibold text-danger">{staleNote(version)}</p>}
      <p className="body text-ink">{t.headline}</p>
      {t.failures.length > 0 && (
        <ul className="mt-(--space-2)">
          {t.failures.map((f) => (
            <li key={`${f.testId}-${f.role}`} data-failure="" className="flex flex-col gap-(--space-1) border-b border-hairline py-(--space-2) last:border-b-0">
              <span className="flex flex-wrap items-baseline gap-(--space-2)">
                <span className="label text-ink-muted">{testNo(f.testId)}</span>
                <span className="small font-semibold text-ink">{ROLE_NAME[f.role]}</span>
                <span className="small font-normal text-ink-soft">{f.prompt}</span>
              </span>
              <span className="small font-normal text-ink-soft">{f.reason}</span>
              {f.accepted && <span className="small font-normal text-ink">Accepted: {f.accepted}</span>}
            </li>
          ))}
        </ul>
      )}
    </Section>
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

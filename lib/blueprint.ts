/**
 * The one-page blueprint (Phase 3). Pure and browser-safe: built from the session and the
 * knowledge refs, with no model call. The engine freezes a copy on each submit, so the
 * reviewer sees exactly what was submitted (ADR 0011).
 *
 * Judgment answers are shown as the requester wrote them. When an answer mentions record
 * data that the pushback already ruled on, it gets a note; the text is never rewritten.
 */
import { scanText } from "./dataRules";
import { chosen, choiceRules, ruleText } from "./pushback";
import { SCENARIO } from "./scenario";
import { PRICE_SOURCE, PRICES_AS_OF, priceFor, scopeByKey } from "./scoper";
import {
  SLOT_KEYS, SLOT_LABELS,
  type Blueprint, type BlueprintSlot, type DataVerdict, type KnowledgeRef, type Level, type Pushback, type Session, type SlotKey, type TestsSummary,
} from "./types";

export const TESTS_NOT_RUN: TestsSummary = { status: "not-run", note: "Not run yet: the test run needs live models." };

const TITLE_MAX = 80;

function titleOf(idea: string): string {
  const first = idea.split("\n")[0].trim();
  return first.length <= TITLE_MAX ? first : `${first.slice(0, TITLE_MAX - 1).trimEnd()}…`;
}

const slotValue = (s: Session, key: SlotKey) => s.slots.find((x) => x.key === key)?.value.trim() ?? "";
/** Ends a sentence with a period unless it already ends with punctuation. */
const sentence = (t: string) => (/[.!?]["'”’)]?$/.test(t) ? t : `${t}.`);

export function dataVerdict(s: Session): DataVerdict {
  const maxLevel = s.sources.reduce<Level>((m, x) => (x.level > m ? x.level : m), 1);
  const allowed = maxLevel <= 2;
  const base = allowed ? "All sources are Level 1–2." : `A source is Level ${maxLevel}. ${SCENARIO.pushback.limit}`;
  const pb = s.pushback;
  const rules = choiceRules(pb);
  if (!pb?.choice || !rules.length) return { maxLevel, allowed, sources: s.sources, summary: base };

  const flagged: NonNullable<DataVerdict["pushback"]>["flagged"] =
    pb.flaggedSources?.map(({ name, level, decidedBy, reason }) => ({ name, level, decidedBy, reason }))
    ?? pb.flagged.map((name) => ({ name })); // sessions from before flaggedSources: names only
  const named = flagged
    .map((f) => `"${f.name}"${f.level ? ` (Level ${f.level}${f.decidedBy ? `, by ${f.decidedBy}` : ""})` : ""}`)
    .join(", ");
  const letters = rules.map((r) => r.title.match(/^\(\w\)/)?.[0] ?? `"${r.title}"`).join(", then ");
  return {
    maxLevel, allowed, sources: s.sources,
    pushback: { flagged, choice: pb.choice, title: titles(pb), rule: ruleText(pb) },
    summary: `${base} Flagged ${named}; the requester chose ${letters}.`,
  };
}

/** Every applied choice's card title, in chosen order, joined with "; ". */
const titles = (pb?: Pushback) => choiceRules(pb).map((r) => r.title).join("; ");

/** "Mentions {rule labels}. The data choice applies: {option titles}." once the pushback is resolved. */
function noteFor(s: Session, key: SlotKey, value: string): string | undefined {
  if (!chosen(s.pushback).length || !value) return undefined;
  const hits = scanText(value, key);
  if (!hits.length) return undefined;
  return `Mentions ${hits.map((h) => h.name).join(", ")}. The data choice applies: ${titles(s.pushback)}.`;
}

/** Model-free template from the requester's own words, the data rule, the scope and the pages. */
export function draftInstructions(s: Session, knowledge: KnowledgeRef[]): string {
  const v = (k: SlotKey) => slotValue(s, k);
  const scope = s.scope ? scopeByKey(s.scope) : undefined;
  const rule = ruleText(s.pushback);
  const lines = [
    v("users") && sentence(`You help ${v("users")}`),
    scope && sentence(`Scope: ${scope.label}. ${scope.desc}`),
    knowledge.length ? sentence(`Answer only from these pages: ${knowledge.map((k) => k.title).join("; ")}`) : "",
    v("never") && sentence(`Must never (from the requester): ${v("never")}`),
    rule && sentence(rule),
    v("handoff") && sentence(`Hand off to a human when: ${v("handoff")}`),
    v("examples") && sentence(`Example of a great vs. bad answer: ${v("examples")}`),
  ];
  return lines.filter((l): l is string => !!l).join("\n");
}

export function buildBlueprint(
  s: Session, knowledge: KnowledgeRef[], at: string, opts: { version: number; draft: boolean },
): Blueprint {
  if (!s.scope) throw new Error("A blueprint needs a chosen scope.");
  const sc = scopeByKey(s.scope);
  const deployment = s.model?.name ?? "";

  const spec: BlueprintSlot[] = SLOT_KEYS.map((key) => {
    const slot = s.slots.find((x) => x.key === key);
    const value = slot?.value ?? "";
    const note = noteFor(s, key, value);
    return {
      key, label: SLOT_LABELS[key], value, filledBy: slot?.filledBy ?? "requester",
      ...(slot?.confidence !== undefined ? { confidence: slot.confidence } : {}),
      ...(note ? { note } : {}),
    };
  });

  return {
    version: opts.version,
    draft: opts.draft,
    builtAt: at,
    title: titleOf(s.idea),
    idea: s.idea,
    spec,
    data: dataVerdict(s),
    scope: {
      key: sc.key, label: sc.label, risk: sc.risk, desc: sc.desc,
      model: priceFor(deployment)?.name ?? deployment,
      knobs: s.knobs,
      ...(s.estimate ? { estimate: s.estimate } : {}),
    },
    knowledge,
    instructions: { text: draftInstructions(s, knowledge), draftedBy: "template" },
    tests: { ...TESTS_NOT_RUN },
    log: s.log,
    costNote: `Estimate from ${PRICE_SOURCE}, as of ${PRICES_AS_OF}. Not a quote.`,
  };
}

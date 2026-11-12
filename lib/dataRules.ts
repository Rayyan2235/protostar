/**
 * Data gate, rules first (ADR 0003).
 *
 * Penn State classifies data in four levels (Policy AD95): 1 Public, 2 Internal/Controlled,
 * 3 High (e.g. FERPA student records, PII), 4 Restricted (e.g. SSNs, health data, GLBA
 * financial data). Penn State AI Studio allows Levels 1–2 only; 3–4 are prohibited
 * (Penn State AI Studio data guidance).
 *
 * A deterministic table decides every source it recognises. The model's suggested level
 * is used only for sources no rule matches, and the result says which one decided. The
 * pushback therefore never depends on a model run.
 */
import type { Level, Pushback, SlotKey, Source } from "./types";

export interface Rule {
  id: string;
  level: Level;
  /** Canonical name used when the rule fires on free text. */
  label: string;
  pattern: RegExp;
  reason: string;
}

/**
 * Text as the rules see it: compatibility forms folded (fullwidth letters, NBSP, U+2011),
 * every format character removed (zero-width, soft hyphen, bidi), and every space
 * separator turned into a plain space. Line breaks and tabs stay, so they still end a
 * negation (contract §6, BE-4d).
 */
export function normalise(text: string): string {
  return text.normalize("NFKC").replace(/\p{Cf}/gu, "").replace(/\p{Zs}/gu, " ");
}

/**
 * The gap inside a multi-word term: any run of whitespace, Unicode dashes (\p{Pd}), the minus
 * sign U+2212 (not in Pd) or underscores ("student_id"), possibly none: "degree" + U+200B +
 * "audit" normalises to "degreeaudit". No "." or "/" (contract §6).
 */
const SEP = String.raw`[\s\p{Pd}\u2212_]*`;
/** Expands a template: "_" is the gap inside a term, "'" any apostrophe. */
const expand = (src: string) => src.replace(/_/g, SEP).replace(/'/g, "['\u2019]");
/** A Level 1-2 pattern: whole words (\b), so ".psu.edu" still matches inside "www.psu.edu". */
const term = (src: string) => new RegExp(String.raw`\b(${expand(src)})\b`, "iu");
/**
 * A Level 3-4 pattern: no letter or digit on either side. \b would treat "_" as part of a word,
 * so "my_degree_audit" would not match.
 */
const recordTerm = (src: string) => new RegExp(String.raw`(?<![\p{L}\p{N}])(${expand(src)})(?![\p{L}\p{N}])`, "iu");

// Highest level first: the first match wins. Patterns match data sources, not topics:
// "medical withdrawal" as a hand-off topic is fine; "medical records" as a source is not.
export const RULES: Rule[] = [
  { id: "ssn", level: 4, label: "Social Security numbers", pattern: recordTerm("(ssn|social_security(_number)?)s?"), reason: "SSNs are Level 4 (restricted)." },
  { id: "health", level: 4, label: "Health or medical records", pattern: recordTerm("(medical|health|counseling|disability)_(records?|history|files?|information|notes)"), reason: "Health records are Level 4 (restricted)." },
  { id: "finaid", level: 4, label: "Financial aid account data", pattern: recordTerm("financial_aid_(account|record|package|award)s?|fafsa|bank_(account|details)"), reason: "Financial account data is Level 4 (GLBA)." },
  { id: "degree-audit", level: 3, label: "Degree audits", pattern: recordTerm("degree_audits?|what_if_reports?|academic_requirements_reports?"), reason: "A degree audit is a FERPA student record (Level 3)." },
  { id: "transcript", level: 3, label: "Transcripts", pattern: recordTerm("transcripts?|advising_transcripts?"), reason: "Transcripts are FERPA student records (Level 3)." },
  { id: "grades", level: 3, label: "Student grades", pattern: recordTerm("grade_(reports?|history|records?)|gradebook|(their|student'?s?|students'|individual)_grades"), reason: "Individual grades are FERPA student records (Level 3)." },
  { id: "student-id", level: 3, label: "Student IDs", pattern: recordTerm("(student_id|psu_id|id_numbers?|access_account_(id|user_id))s?"), reason: "Student identifiers are PII (Level 3)." },
  { id: "records-system", level: 3, label: "Student records systems", pattern: recordTerm("lionpath_(records?|data)|starfish_(notes|records?)|advising_(notes|records)|student_records?"), reason: "Records about a named student are FERPA records (Level 3)." },
  { id: "internal-doc", level: 2, label: "Internal documents", pattern: term("sharepoint|onedrive|internal_(doc|document|wiki|page)s?|teams_(files?|channel)|(my|our|the_advising)_(faq|notes|doc|docs|spreadsheet)"), reason: "Internal department material is Level 2." },
  { id: "public-page", level: 1, label: "Public web pages", pattern: term(String.raw`bulletins?|public_(web_)?(pages?|site)|website|catalog|\.psu\.edu|smeal_(change_of_major_)?page`), reason: "Published public pages are Level 1." },
];

export function matchRule(text: string): Rule | undefined {
  const t = normalise(text);
  return RULES.find((r) => r.pattern.test(t));
}

/** Classify one named source: rule if any matches, else the model's suggestion. */
export function classifySource(
  src: { name: string; url?: string; suggestedLevel?: Level; reason?: string },
): Source {
  const rule = matchRule(`${src.name} ${src.url ?? ""}`);
  if (rule) return { name: src.name, url: src.url, level: rule.level, decidedBy: "rule", reason: rule.reason, ruleId: rule.id };
  if (src.suggestedLevel) {
    return { name: src.name, url: src.url, level: src.suggestedLevel, decidedBy: "model", reason: src.reason?.trim() || "Classified by model." };
  }
  // No rule and no model opinion: treat as internal until a reviewer says otherwise.
  return { name: src.name, url: src.url, level: 2, decidedBy: "rule", reason: "Unrecognised source; treated as Level 2 until reviewed.", ruleId: "default" };
}

const NEGATION_WORD = /\b(?:never|not|no|don'?t|do not|doesn'?t|without|avoid|refuse|stop)\b/gi;
/** Max characters between a negation word and the term it hides (parked, contract §6). */
const GAP_MAX = 40;
/** An ASCII hyphen or slash with a letter or digit on both sides is part of a word ("self-report", "and/or"). */
const INNER_JOIN = /(?<=[\p{L}\p{Nd}])[-/](?=[\p{L}\p{Nd}])/gu;
/** The only characters a negation may reach across: letters, digits, plain spaces, apostrophes. */
const GAP_CHARS = /^[\p{L}\p{Nd} '\u2019]*$/u;
/** The never slot also allows commas: "Never ask for transcripts, degree audits or student IDs". */
const GAP_CHARS_NEVER = /^[\p{L}\p{Nd} '\u2019,]*$/u;
/** Words that start a new thought, in every slot. */
const TURN_WORDS = /\b(?:but|so|then|however|though|instead|yet|except)\b/i;
/** Words that join a new item; they keep the negation only in the never slot. "and/or" counts. */
const LIST_WORDS = /\b(?:and|or|nor)\b/i;

/** Whether a negation reaches across `gap` (the text between the negation word and the term). */
function negationReaches(gap: string, slot?: SlotKey): boolean {
  const never = slot === "never";
  return gap.length <= GAP_MAX
    && (never ? GAP_CHARS_NEVER : GAP_CHARS).test(gap.replace(INNER_JOIN, ""))
    && !TURN_WORDS.test(gap)
    && (never || !LIST_WORDS.test(gap));
}

/** True if some negation word before `index` reaches the term there. */
function negated(text: string, index: number, slot?: SlotKey): boolean {
  const before = text.slice(0, index);
  for (const m of before.matchAll(NEGATION_WORD)) {
    if (negationReaches(before.slice(m.index + m[0].length), slot)) return true;
  }
  return false;
}

/**
 * Safety net over the requester's own words: Level 3–4 rule hits in free text, even if
 * the model failed to extract them. An allow list, so it fails closed: a negation hides a
 * hit ("never read transcripts") only across letters, digits, spaces and apostrophes, with
 * no turn word (but, so, then, ...) and, outside the never slot, no and/or/nor or comma.
 * Any other character in between (punctuation, line break, dash, bracket, symbol) and the
 * term counts.
 */
export function scanText(text: string, slot?: SlotKey): Source[] {
  const hits: Source[] = [];
  const norm = normalise(text); // matching and the negation gap both read the normalised text
  for (const rule of RULES.filter((r) => r.level >= 3)) {
    const re = new RegExp(rule.pattern.source, rule.pattern.flags + "g");
    for (const m of norm.matchAll(re)) {
      if (negated(norm, m.index, slot)) continue;
      hits.push({ name: rule.label, level: rule.level, decidedBy: "rule", reason: rule.reason, ruleId: rule.id });
      break;
    }
  }
  return hits;
}

/**
 * Combine model-extracted sources with the free-text safety net for one requester turn.
 * - One source per rule id (the model's descriptive name wins over the canonical label).
 * - Rules the requester already resolved in a pushback don't fire again.
 */
export function gate(
  requesterText: string,
  extracted: { name: string; url?: string; suggestedLevel?: Level; reason?: string }[],
  pushback?: Pushback,
  /** The slot this text answers, if any (undefined for the idea). */
  slot?: SlotKey,
): Source[] {
  const resolved = new Set(pushback && !pushback.blocking ? pushback.flaggedRules : []);
  const out: Source[] = [];
  const seenRules = new Set<string>();
  for (const src of [...extracted.map(classifySource), ...scanText(requesterText, slot)]) {
    if (src.ruleId && src.ruleId !== "default") {
      if (resolved.has(src.ruleId) || seenRules.has(src.ruleId)) continue;
      if (src.level >= 3) seenRules.add(src.ruleId); // collapse duplicate record hits only
    }
    out.push(src);
  }
  return out;
}

/**
 * Level 3–4 hits for a requester edit (contract §6, edit gate).
 * - A `sources` edit is scanned with no resolved-rule filter: resolving the pushback
 *   never lets a record source back in through an edit.
 * - Any other slot keeps the filter, so a resolved topic (e.g. a hand-off for
 *   "anything about their degree audit") can be written down.
 */
export function editFlags(key: SlotKey, value: string, pushback?: Pushback): Source[] {
  if (key === "sources") return scanText(value, key);
  return gate(value, [], pushback, key).filter((s) => s.level >= 3);
}

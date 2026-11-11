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
import type { Level, Pushback, Source } from "./types";

export interface Rule {
  id: string;
  level: Level;
  /** Canonical name used when the rule fires on free text. */
  label: string;
  pattern: RegExp;
  reason: string;
}

// Highest level first: the first match wins. Patterns match data sources, not topics:
// "medical withdrawal" as a hand-off topic is fine; "medical records" as a source is not.
export const RULES: Rule[] = [
  { id: "ssn", level: 4, label: "Social Security numbers", pattern: /\b(ssn|social security( number)?)s?\b/i, reason: "SSNs are Level 4 (restricted)." },
  { id: "health", level: 4, label: "Health or medical records", pattern: /\b(medical|health|counseling|disability) (records?|history|files?|information|notes)\b/i, reason: "Health records are Level 4 (restricted)." },
  { id: "finaid", level: 4, label: "Financial aid account data", pattern: /\b(financial[- ]aid (account|record|package|award)s?|fafsa|bank (account|details))\b/i, reason: "Financial account data is Level 4 (GLBA)." },
  { id: "degree-audit", level: 3, label: "Degree audits", pattern: /\b(degree audits?|what[- ]?if reports?|academic requirements reports?)\b/i, reason: "A degree audit is a FERPA student record (Level 3)." },
  { id: "transcript", level: 3, label: "Transcripts", pattern: /\b(transcripts?|advising transcripts?)\b/i, reason: "Transcripts are FERPA student records (Level 3)." },
  { id: "grades", level: 3, label: "Student grades", pattern: /\b(grade (reports?|history|records?)|gradebook|(their|student'?s?|students'|individual) grades)\b/i, reason: "Individual grades are FERPA student records (Level 3)." },
  { id: "student-id", level: 3, label: "Student IDs", pattern: /\b(student id|psu id|id numbers?|access account (id|user ?id))s?\b/i, reason: "Student identifiers are PII (Level 3)." },
  { id: "records-system", level: 3, label: "Student records systems", pattern: /\b(lionpath (records?|data)|starfish (notes|records?)|advising (notes|records)|student records?)\b/i, reason: "Records about a named student are FERPA records (Level 3)." },
  { id: "internal-doc", level: 2, label: "Internal documents", pattern: /\b(sharepoint|onedrive|internal (doc|document|wiki|page)s?|teams (files?|channel)|(my|our|the advising) (faq|notes|doc|docs|spreadsheet))\b/i, reason: "Internal department material is Level 2." },
  { id: "public-page", level: 1, label: "Public web pages", pattern: /\b(bulletins?|public (web )?(pages?|site)|website|catalog|\.psu\.edu|smeal (change[- ]of[- ]major )?page)\b/i, reason: "Published public pages are Level 1." },
];

export function matchRule(text: string): Rule | undefined {
  return RULES.find((r) => r.pattern.test(text));
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

const NEGATION = /\b(never|not|no|don'?t|do not|doesn'?t|without|avoid|refuse|stop)\b[^.;!?]{0,40}$/i;

/**
 * Safety net over the requester's own words: Level 3–4 rule hits in free text, even if
 * the model failed to extract them. Skips negated mentions ("never read transcripts").
 */
export function scanText(text: string): Source[] {
  const hits: Source[] = [];
  for (const rule of RULES.filter((r) => r.level >= 3)) {
    const re = new RegExp(rule.pattern.source, "gi");
    for (const m of text.matchAll(re)) {
      if (NEGATION.test(text.slice(0, m.index))) continue;
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
): Source[] {
  const resolved = new Set(pushback && !pushback.blocking ? pushback.flaggedRules : []);
  const out: Source[] = [];
  const seenRules = new Set<string>();
  for (const src of [...extracted.map(classifySource), ...scanText(requesterText)]) {
    if (src.ruleId && src.ruleId !== "default") {
      if (resolved.has(src.ruleId) || seenRules.has(src.ruleId)) continue;
      if (src.level >= 3) seenRules.add(src.ruleId); // collapse duplicate record hits only
    }
    out.push(src);
  }
  return out;
}

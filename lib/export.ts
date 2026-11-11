/**
 * Blueprint exports (ADR 0011): Markdown, JSON and "Copy for AI Studio" text. Pure and
 * browser-safe; the page downloads or copies the result. AI Studio field names are
 * provisional until they are checked against AI Studio itself.
 */
import { formatDollars } from "./scoper";
import type { Blueprint, BlueprintSlot } from "./types";

/** A Markdown table cell: pipes escaped, line breaks kept as <br>. */
const cell = (t: string) => t.replace(/\|/g, "\\|").replace(/\r?\n/g, "<br>");

function filledBy(x: BlueprintSlot): string {
  if (x.filledBy === "requester") return "Requester";
  return `Filled by the tool${x.confidence !== undefined ? ` (confidence ${x.confidence.toFixed(2)})` : ""}`;
}

export function blueprintMarkdown(bp: Blueprint): string {
  const { data, scope } = bp;
  const cost = scope.estimate
    ? `- Estimated cost: ${formatDollars(scope.estimate.monthlyDollars)}/month`
    : "- Estimated cost: no list price for this model, so no estimate.";
  const lines = [
    `# ${bp.title}`,
    "",
    bp.draft ? `_Draft of v${bp.version}, not submitted yet. Built ${bp.builtAt}._` : `_Blueprint v${bp.version}, submitted ${bp.builtAt}._`,
    "",
    "## Purpose",
    "",
    bp.idea,
    "",
    "## Spec",
    "",
    "| Slot | Answer | Filled by |",
    "|---|---|---|",
    ...bp.spec.map((x) =>
      `| ${x.label} | ${x.value ? cell(x.value) : "_(empty)_"}${x.note ? `<br>_Note: ${cell(x.note)}_` : ""} | ${filledBy(x)} |`),
    "",
    "## Data verdict",
    "",
    data.summary,
    "",
    `- Highest level: Level ${data.maxLevel} (${data.allowed ? "allowed" : "not allowed"} in AI Studio)`,
    "- Sources:",
    ...data.sources.map((s) => `  - ${s.name}: Level ${s.level}, decided by ${s.decidedBy}. ${s.reason}`),
    ...(data.pushback ? [`- Data choice: ${data.pushback.title}`, `- Rule added to the agent: ${data.pushback.rule}`] : []),
    "",
    "## Scope & cost",
    "",
    `- Scope: ${scope.label} (risk ${scope.risk}). ${scope.desc}`,
    `- Model: ${scope.model}`,
    `- Volume: ${scope.knobs.studentsPerMonth.toLocaleString("en-US")} students a month × ${scope.knobs.convsPerStudent} conversations each`,
    cost,
    `- ${bp.costNote}`,
    "",
    "## Knowledge",
    "",
    ...bp.knowledge.map((k) => `- [${k.title}](${k.url}), fetched ${k.fetchedAt}, Level ${k.level}`),
    "",
    "## Draft instructions",
    "",
    bp.instructions.draftedBy === "template" ? "_Template, not model-drafted._" : "_Drafted by a model._",
    "",
    "```text",
    bp.instructions.text,
    "```",
    "",
    "## Tests",
    "",
    bp.tests.note,
    "",
    "## Decision log",
    "",
    "| When | Who | What |",
    "|---|---|---|",
    ...bp.log.map((d) => `| ${d.at} | ${d.who} | ${cell(d.what)} |`),
    "",
  ];
  return lines.join("\n");
}

export function blueprintJson(bp: Blueprint): string {
  return JSON.stringify(bp, null, 2);
}

export interface AiStudioFields {
  provisional: true;
  name: string;
  description: string;
  instructions: string;
  knowledge: string[];
  starters: string[];
}

/** Conversation starters from the requester's top questions: split on separators and question marks. */
function starters(top: string): string[] {
  return top
    .split(/[;\n|]+/)
    .flatMap((part) => part.split(/(?<=\?)\s+/))
    .map((q) => q.replace(/^[-*•]\s+/, "").trim())
    .filter(Boolean)
    .slice(0, 4);
}

export function aiStudioFields(bp: Blueprint): AiStudioFields {
  return {
    provisional: true,
    name: bp.title,
    description: `${bp.scope.label}: ${bp.scope.desc}`,
    instructions: bp.instructions.text,
    knowledge: bp.knowledge.map((k) => k.url),
    starters: starters(bp.spec.find((x) => x.key === "top")?.value ?? ""),
  };
}

export function aiStudioText(bp: Blueprint): string {
  const f = aiStudioFields(bp);
  return [
    "Field names are provisional until checked against AI Studio.",
    `Name: ${f.name}`,
    `Description: ${f.description}`,
    "Instructions:",
    f.instructions,
    "Knowledge:",
    ...f.knowledge.map((u) => `- ${u}`),
    "Conversation starters:",
    ...f.starters.map((q) => `- ${q}`),
  ].join("\n");
}

export function exportFileName(bp: Blueprint, ext: "md" | "json"): string {
  return `protostar-blueprint-v${bp.version}${bp.draft ? "-draft" : ""}.${ext}`;
}

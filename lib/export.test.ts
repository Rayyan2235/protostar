import { test } from "node:test";
import assert from "node:assert/strict";
import { aiStudioFields, aiStudioText, blueprintJson, blueprintMarkdown, exportFileName } from "./export";
import { SLOT_LABELS, type Blueprint } from "./types";

const at = "2026-11-11T09:00:00.000Z";
const blueprint: Blueprint = {
  version: 1,
  draft: false,
  builtAt: at,
  title: "Finance change-of-major helper",
  idea: "Something that helps students figure out if they can switch into Finance.",
  spec: [
    { key: "users", label: SLOT_LABELS.users, value: "Sophomores thinking about Finance", filledBy: "prefill", confidence: 0.9 },
    { key: "top", label: SLOT_LABELS.top, value: "Can I switch?; What GPA do I need? | When can I apply?", filledBy: "prefill", confidence: 0.85 },
    { key: "never", label: SLOT_LABELS.never, value: "Promise admission", filledBy: "requester" },
    { key: "examples", label: SLOT_LABELS.examples, value: "Great: cites 3.50.\nBad: 'you'll get in'.", filledBy: "requester" },
    { key: "sources", label: SLOT_LABELS.sources, value: "The bulletin", filledBy: "requester" },
    {
      key: "handoff", label: SLOT_LABELS.handoff, value: "Anything where they paste their degree audit", filledBy: "requester",
      note: "Mentions Degree audits. The data choice applies: (a) Students tell it their GPA and credits.",
    },
  ],
  data: {
    maxLevel: 1,
    allowed: true,
    sources: [{ name: "Undergraduate Bulletin", level: 1, decidedBy: "rule", reason: "Published public pages are Level 1." }],
    pushback: {
      flagged: [{ name: "Students paste their degree audit", level: 3, decidedBy: "rule", reason: "FERPA" }],
      choice: "selfreport",
      title: "(a) Students tell it their GPA and credits",
      rule: "Never ask for, read, or store student records.",
    },
    summary: "All sources are Level 1–2. Flagged \"Students paste their degree audit\" (Level 3, by rule); the requester chose (a).",
  },
  scope: {
    key: "guided", label: "Guided eligibility check", risk: "Medium", desc: "Walks the entrance rules.", model: "Claude Haiku 4.5",
    knobs: { studentsPerMonth: 2000, convsPerStudent: 2 },
    estimate: {
      scope: "guided", model: "Claude Haiku 4.5", conversations: 4000, inputMTok: 32, outputMTok: 4.8,
      monthlyDollars: 112, tokensPerStudent: 18400, pricesAsOf: "2026-11-03",
    },
  },
  knowledge: [{ title: "Finance, B.S.", url: "https://bulletins.psu.edu/finance", fetchedAt: "2026-11-03", level: 1 }],
  instructions: { text: "You help sophomores.\nYou must never: Promise admission.", draftedBy: "template" },
  tests: { status: "not-run", note: "Not run yet: the test run needs live models." },
  log: [
    { at, who: "requester", what: "Something that helps students", kind: "idea" },
    { at, who: "reviewer", what: "Opened blueprint v1.", kind: "review" },
  ],
  costNote: "Estimate from Anthropic public list prices (same rates on Microsoft Foundry), as of 2026-11-03. Not a quote.",
};

test("Markdown has every section in order", () => {
  const md = blueprintMarkdown(blueprint);
  const headings = ["# Finance change-of-major helper", "## Purpose", "## Spec", "## Data verdict", "## Scope & cost", "## Knowledge",
    "## Draft instructions", "## Tests", "## Decision log"];
  const lines = md.split("\n");
  const positions = headings.map((h) => lines.indexOf(h));
  assert.deepEqual(headings.filter((_, i) => positions[i] < 0), [], "missing headings");
  assert.ok(positions.every((p, i) => i === 0 || p > positions[i - 1]), "sections in order");
});

test("Markdown says estimate, not run yet, template, and shows every slot label", () => {
  const md = blueprintMarkdown(blueprint);
  assert.match(md, /estimate/i);
  assert.ok(md.includes(blueprint.costNote));
  assert.ok(md.includes("$112/month"));
  assert.ok(md.includes("Not run yet"));
  assert.match(md, /template, not model-drafted/i);
  for (const label of Object.values(SLOT_LABELS)) assert.ok(md.includes(label), label);
  assert.ok(md.includes(blueprint.data.summary));
  assert.ok(md.includes(blueprint.data.pushback!.rule));
  assert.ok(md.includes("https://bulletins.psu.edu/finance") && md.includes("2026-11-03"));
  assert.ok(md.includes("Opened blueprint v1."));
});

test("Markdown marks prefilled answers as filled by the tool and shows slot notes", () => {
  const md = blueprintMarkdown(blueprint);
  const row = (label: string) => md.split("\n").find((l) => l.startsWith(`| ${label} |`))!;
  assert.match(row("Who uses it"), /Filled by the tool/);
  assert.doesNotMatch(row("Must never"), /Filled by the tool/);
  assert.ok(row("Hands off when").includes("Mentions Degree audits."));
});

test("Markdown table cells escape pipes and newlines", () => {
  const md = blueprintMarkdown(blueprint);
  const row = (label: string) => md.split("\n").find((l) => l.startsWith(`| ${label} |`))!;
  assert.ok(row("Top questions").includes("What GPA do I need? \\| When can I apply?"));
  assert.ok(row("Great vs. bad answer").includes("Great: cites 3.50.<br>Bad:"));
});

test("Markdown says when there is no list price", () => {
  const md = blueprintMarkdown({ ...blueprint, scope: { ...blueprint.scope, estimate: undefined } });
  assert.match(md, /no list price/i);
  assert.doesNotMatch(md, /\$\d/);
});

test("Markdown labels a draft as not submitted", () => {
  assert.match(blueprintMarkdown({ ...blueprint, draft: true }), /draft/i);
});

test("JSON round-trips to the same object", () => {
  assert.deepEqual(JSON.parse(blueprintJson(blueprint)), blueprint);
  assert.equal(blueprintJson(blueprint), JSON.stringify(blueprint, null, 2));
});

test("AI Studio fields are provisional and carry the instructions", () => {
  const f = aiStudioFields(blueprint);
  assert.equal(f.provisional, true);
  assert.equal(f.instructions, blueprint.instructions.text);
  assert.equal(f.name, blueprint.title);
  assert.deepEqual(f.knowledge, ["https://bulletins.psu.edu/finance"]);
  assert.ok(f.starters.length > 0 && f.starters.length <= 4);
  assert.ok(f.starters.includes("What GPA do I need?"));
});

test("AI Studio text says up front that field names are provisional", () => {
  const text = aiStudioText(blueprint);
  assert.match(text.split("\n")[0], /provisional/i);
  assert.ok(text.includes(blueprint.instructions.text));
});

test("export file names", () => {
  assert.equal(exportFileName(blueprint, "md"), "protostar-blueprint-v1.md");
  assert.equal(exportFileName({ ...blueprint, version: 2, draft: true }, "json"), "protostar-blueprint-v2-draft.json");
});

test("instructions with backticks stay inside a longer fence", () => {
  const text = "Answer plainly.\n```\n## Fake heading\n````";
  const md = blueprintMarkdown({ ...blueprint, instructions: { text, draftedBy: "template" } });
  const lines = md.split("\n");
  const open = lines.indexOf("`````text");
  assert.ok(open > 0, "fence is one backtick longer than the longest run (4)");
  const close = lines.indexOf("`````", open + 1);
  assert.ok(close > open + 4, "the fence closes after the instructions");
  assert.deepEqual(lines.slice(open + 1, close), text.split("\n"));
});

test("plain instructions keep a three-backtick fence", () => {
  const lines = blueprintMarkdown(blueprint).split("\n");
  assert.ok(lines.includes("```text"));
});

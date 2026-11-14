import { test } from "node:test";
import assert from "node:assert/strict";
import { buildBlueprint, dataVerdict, draftInstructions, TESTS_NOT_RUN } from "./blueprint";
import { blueprintJson, blueprintMarkdown } from "./export";
import { initial, reduce, type Action } from "./journey";
import { SCENARIO } from "./scenario";
import { estimate, priceFor, PRICE_SOURCE, PRICES_AS_OF } from "./scoper";
import { SLOT_KEYS, SLOT_LABELS, type KnowledgeRef, type Session, type SlotKey, type Source } from "./types";

const at = "2026-11-11T09:00:00.000Z";
const audit: Source = {
  name: "Students paste their degree audit", level: 3, decidedBy: "rule",
  reason: "A degree audit is a FERPA student record (Level 3).", ruleId: "degree-audit",
};
const bulletin: Source = { name: "Undergraduate Bulletin", level: 1, decidedBy: "rule", reason: "Published public pages are Level 1.", ruleId: "public-page" };
const knowledge: KnowledgeRef[] = [
  { title: "Finance, B.S. (Undergraduate Bulletin)", url: "https://bulletins.psu.edu/finance", fetchedAt: "2026-11-03", level: 1 },
  { title: "Smeal change of major", url: "https://smeal.psu.edu/change-of-major", fetchedAt: "2026-11-03", level: 1 },
];
const ANSWERS: Record<SlotKey, string> = {
  users: "Sophomores thinking about Finance",
  top: "Can I switch? What GPA do I need? When can I apply?",
  never: "Promise admission or ask for records",
  examples: "Great: cites the 3.50 minimum and says it isn't a guarantee. Bad: 'you'll get in'.",
  sources: "The bulletin and the Smeal change-of-major page",
  handoff: "Appeals and anything about their own record",
};

/** Dana's path: prefilled users/top, degree audit flagged and resolved, interview done, scope chosen. */
function dana(model = "claude-haiku-4-5"): Session {
  let s = reduce(initial("dana", at), { type: "SUBMIT_IDEA", text: "Something that helps students figure out if they can switch into Finance.\nMostly sophomores.", at });
  s = reduce(s, {
    type: "APPLY_TURN", sources: [bulletin, audit], at,
    prefilled: [{ key: "users", value: ANSWERS.users, confidence: 0.9 }, { key: "top", value: ANSWERS.top, confidence: 0.85 }],
  });
  s = reduce(s, { type: "RESOLVE_PUSHBACK", choice: "selfreport", at });
  while (s.step === "interview" && s.question) {
    s = reduce(reduce(s, { type: "ANSWER", value: ANSWERS[s.question.slot], at }), { type: "APPLY_TURN", prefilled: [], sources: [], at });
  }
  const choose: Action = {
    type: "CHOOSE_SCOPE", scope: "guided", role: "cheap", model, price: priceFor(model),
    knobs: { studentsPerMonth: 2000, convsPerStudent: 2 }, at,
  };
  return reduce(s, choose);
}
const bp = (s: Session = dana()) => buildBlueprint(s, knowledge, at, { version: 1, draft: true });

test("fixture reaches the tests step with the pushback resolved", () => {
  const s = dana();
  assert.equal(s.step, "tests");
  assert.equal(s.pushback?.choice, "selfreport");
});

test("Dana's data verdict: allowed, Level 1, flagged audit kept with level and rule", () => {
  const d = dataVerdict(dana());
  assert.equal(d.allowed, true);
  assert.equal(d.maxLevel, 1);
  assert.ok(d.sources.every((x) => x.level < 3));
  assert.equal(d.pushback?.choice, "selfreport");
  assert.deepEqual(d.pushback?.flagged[0], { name: audit.name, level: 3, decidedBy: "rule", reason: audit.reason });
  assert.equal(d.pushback?.title, SCENARIO.pushback.options.selfreport.title);
  assert.equal(d.pushback?.rule, SCENARIO.pushback.options.selfreport.rule);
  assert.match(d.summary, /Level 3, by rule/);
  assert.match(d.summary, /^All sources are Level 1–2\./);
  assert.equal(d.summary, `All sources are Level 1–2. Flagged "${audit.name}" (Level 3, by rule); the requester chose (a).`);
});

test("an old session without flaggedSources shows names only", () => {
  const s = dana();
  const old: Session = { ...s, pushback: { ...s.pushback!, flaggedSources: undefined } };
  const d = dataVerdict(old);
  assert.deepEqual(d.pushback?.flagged, [{ name: audit.name }]);
  assert.doesNotMatch(d.summary, /\(Level/);
  assert.doesNotMatch(d.summary, /by rule/);
});

test("no pushback: verdict has no pushback block", () => {
  const s: Session = { ...dana(), pushback: undefined, sources: [bulletin] };
  const d = dataVerdict(s);
  assert.equal(d.pushback, undefined);
  assert.equal(d.summary, "All sources are Level 1–2.");
});

test("a Level 2 source sets maxLevel 2 and still allows", () => {
  const sharepoint: Source = { name: "Advising FAQ on SharePoint", level: 2, decidedBy: "rule", reason: "Internal.", ruleId: "internal-doc" };
  const d = dataVerdict({ ...dana(), sources: [bulletin, sharepoint] });
  assert.equal(d.maxLevel, 2);
  assert.equal(d.allowed, true);
});

test("spec has 6 slots in SLOT_KEYS order with labels; prefills keep filledBy", () => {
  const spec = bp().spec;
  assert.deepEqual(spec.map((x) => x.key), [...SLOT_KEYS]);
  assert.deepEqual(spec.map((x) => x.label), SLOT_KEYS.map((k) => SLOT_LABELS[k]));
  const users = spec.find((x) => x.key === "users")!;
  assert.deepEqual([users.value, users.filledBy, users.confidence], [ANSWERS.users, "prefill", 0.9]);
  assert.equal(spec.find((x) => x.key === "never")?.filledBy, "requester");
});

test("an empty slot has value \"\"", () => {
  const s = dana();
  const spec = bp({ ...s, slots: s.slots.filter((x) => x.key !== "examples") }).spec;
  assert.equal(spec.length, 6);
  assert.equal(spec.find((x) => x.key === "examples")?.value, "");
});

test("a slot that mentions resolved record data keeps its text and gets a note", () => {
  const s = dana();
  const said = "Anything where they paste their degree audit";
  const spec = bp({ ...s, slots: s.slots.map((x) => (x.key === "handoff" ? { ...x, value: said } : x)) }).spec;
  const handoff = spec.find((x) => x.key === "handoff")!;
  assert.equal(handoff.value, said);
  assert.equal(handoff.note, `Mentions Degree audits. The data choice applies: ${SCENARIO.pushback.options.selfreport.title}.`);
  assert.ok(spec.filter((x) => x.key !== "handoff").every((x) => x.note === undefined));
});

test("slot notes scan with the slot's own clause rules: a never list of records gets no note", () => {
  const s = dana();
  const said = "Never ask for transcripts, degree audits or student IDs";
  const spec = bp({ ...s, slots: s.slots.map((x) => (x.key === "never" ? { ...x, value: said } : x)) }).spec;
  assert.equal(spec.find((x) => x.key === "never")?.note, undefined);
  const asSources = bp({ ...s, slots: s.slots.map((x) => (x.key === "sources" ? { ...x, value: said } : x)) }).spec;
  assert.equal(asSources.find((x) => x.key === "sources")?.note,
    `Mentions Degree audits, Student IDs. The data choice applies: ${SCENARIO.pushback.options.selfreport.title}.`);
});

test("scope block: label, risk, desc, model name, knobs, estimate from list prices", () => {
  const s = dana();
  const scope = bp(s).scope;
  assert.deepEqual(
    { key: scope.key, label: scope.label, risk: scope.risk, model: scope.model, knobs: scope.knobs },
    { key: "guided", label: "Guided eligibility check", risk: "Medium", model: "Claude Haiku 4.5", knobs: s.knobs },
  );
  assert.ok(scope.desc.length > 0);
  assert.deepEqual(scope.estimate, estimate("guided", priceFor("claude-haiku-4-5")!, s.knobs));
});

test("a model with no list price: deployment name shown, no estimate", () => {
  const scope = bp(dana("gpt-5.4-mini")).scope;
  assert.equal(scope.model, "gpt-5.4-mini");
  assert.equal(scope.estimate, undefined);
});

test("tests are honestly not run; cost note names the price source", () => {
  const b = bp();
  assert.deepEqual(TESTS_NOT_RUN, { status: "not-run", note: "Not run yet: the test run needs live models." });
  assert.deepEqual(b.tests, TESTS_NOT_RUN);
  assert.equal(b.costNote, `Estimate from Anthropic public list prices (same rates on Microsoft Foundry), as of ${PRICES_AS_OF}. Not a quote.`);
  assert.ok(b.costNote.includes(PRICE_SOURCE));
});

test("header fields: version, draft, builtAt, title from the first line, idea, knowledge, log", () => {
  const s = dana();
  const b = buildBlueprint(s, knowledge, "2026-11-12T00:00:00.000Z", { version: 2, draft: false });
  assert.deepEqual([b.version, b.draft, b.builtAt], [2, false, "2026-11-12T00:00:00.000Z"]);
  assert.equal(b.title, "Something that helps students figure out if they can switch into Finance.");
  assert.equal(b.idea, s.idea);
  assert.deepEqual(b.knowledge, knowledge);
  assert.deepEqual(b.log, s.log);
});

test("a long first line is cut to 80 characters", () => {
  const s = { ...dana(), idea: "x".repeat(200) };
  assert.ok(bp(s).title.length <= 80);
});

test("buildBlueprint throws before a scope is chosen", () => {
  assert.throws(() => bp({ ...dana(), scope: undefined }));
});

test("draft instructions are a template built only from Dana's words, the rule and the pages", () => {
  const s = dana();
  const text = draftInstructions(s, knowledge);
  for (const part of [ANSWERS.users, ANSWERS.never, ANSWERS.handoff, ANSWERS.examples, SCENARIO.pushback.options.selfreport.rule, ...knowledge.map((k) => k.title)]) {
    assert.ok(text.includes(part), `missing: ${part}`);
  }
  assert.ok(text.includes("Guided eligibility check"));
  assert.ok(!text.includes(".."), "no doubled periods");
  assert.ok(text.split(/\r?\n/).includes(`Must never (from the requester): ${ANSWERS.never}.`), text);
  assert.doesNotMatch(text, /You must never/);
  assert.deepEqual(bp(s).instructions, { text, draftedBy: "template" });
});

// BE-12 (plan-4 §5): every applied data choice stays in force, in first-chosen order.
const transcripts: Source = { name: "Students upload transcripts", level: 3, decidedBy: "rule", reason: "A transcript is a FERPA student record (Level 3).", ruleId: "transcript" };
const { selfreport, route } = SCENARIO.pushback.options;
/** Dana after a second flag (transcripts) resolved with (b). */
function twoChoices(): Session {
  const s = dana();
  return {
    ...s,
    pushback: {
      ...s.pushback!, flagged: [transcripts.name], flaggedRules: ["degree-audit", "transcript"],
      flaggedSources: [audit, transcripts], choice: "route", choices: ["selfreport", "route"],
    },
  };
}
/** The handoff answer mentions a degree audit, so its slot gets a note. */
const withNote = (s: Session): Session =>
  ({ ...s, slots: s.slots.map((x) => (x.key === "handoff" ? { ...x, value: "Anything where they paste their degree audit" } : x)) });
const oldStyle = (s: Session): Session => {
  const pb = { ...s.pushback! };
  delete pb.choices;
  return { ...s, pushback: pb };
};

test("an old session (choice only) gives today's verdict, byte for byte", () => {
  const s = dana();
  assert.deepEqual(s.pushback?.choices, ["selfreport"], "a new session records choices");
  const old = oldStyle(s);
  assert.equal(old.pushback?.choices, undefined);
  const d = dataVerdict(old);
  assert.equal(d.summary, `All sources are Level 1–2. Flagged "${audit.name}" (Level 3, by rule); the requester chose (a).`);
  assert.deepEqual(d.pushback, {
    flagged: [{ name: audit.name, level: 3, decidedBy: "rule", reason: audit.reason }],
    choice: "selfreport", title: selfreport.title, rule: selfreport.rule,
  });
  assert.equal(JSON.stringify(d), JSON.stringify(dataVerdict(s)));
});

test("choices [x] gives the same verdict, notes, instructions and export as an old choice x", () => {
  for (const x of ["selfreport", "route"] as const) {
    const s = withNote(dana());
    const fresh: Session = { ...s, pushback: { ...s.pushback!, choice: x, choices: [x] } };
    const old = oldStyle({ ...s, pushback: { ...s.pushback!, choice: x } });
    assert.equal(JSON.stringify(dataVerdict(fresh)), JSON.stringify(dataVerdict(old)), x);
    assert.equal(draftInstructions(fresh, knowledge), draftInstructions(old, knowledge), x);
    assert.deepEqual(bp(fresh).spec, bp(old).spec, x);
    assert.equal(blueprintMarkdown(bp(fresh)), blueprintMarkdown(bp(old)), x);
    assert.equal(blueprintJson(bp(fresh)), blueprintJson(bp(old)), x);
  }
});

test("two choices: the verdict joins titles and rules, names both sources, and says (a), then (b)", () => {
  const d = dataVerdict(twoChoices());
  assert.equal(d.pushback?.choice, "route", "choice is the latest");
  assert.equal(d.pushback?.title, `${selfreport.title}; ${route.title}`);
  assert.equal(d.pushback?.rule, `${selfreport.rule} ${route.rule}`);
  assert.deepEqual(d.pushback?.flagged.map((f) => f.name), [audit.name, transcripts.name]);
  assert.equal(d.summary,
    `All sources are Level 1–2. Flagged "${audit.name}" (Level 3, by rule), "${transcripts.name}" (Level 3, by rule); the requester chose (a), then (b).`);
});

test("two choices: the slot note and the draft instructions carry both rules in order", () => {
  const s = withNote(twoChoices());
  assert.equal(bp(s).spec.find((x) => x.key === "handoff")?.note,
    `Mentions Degree audits. The data choice applies: ${selfreport.title}; ${route.title}.`);
  const text = draftInstructions(s, knowledge);
  const a = text.indexOf(selfreport.rule);
  const b = text.indexOf(route.rule);
  assert.ok(a >= 0 && b > a, text);
});

test("two choices: the export markdown has both rules", () => {
  const md = blueprintMarkdown(bp(twoChoices()));
  assert.ok(md.includes(`- Data choice: ${selfreport.title}; ${route.title}`), md);
  assert.ok(md.includes(`- Rule added to the agent: ${selfreport.rule} ${route.rule}`), md);
});

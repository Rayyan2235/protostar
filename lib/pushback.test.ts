import { test } from "node:test";
import assert from "node:assert/strict";
import { chosen, choiceRules, ruleText } from "./pushback";
import { SCENARIO } from "./scenario";
import type { Pushback } from "./types";

const base: Pushback = { blocking: false, flagged: [], flaggedRules: [], options: ["selfreport", "route"], attempts: 0 };
const { selfreport, route } = SCENARIO.pushback.options;

test("chosen: no pushback or no choice gives []", () => {
  assert.deepEqual(chosen(undefined), []);
  assert.deepEqual(chosen(base), []);
});

test("chosen: an old session (choice only) gives [choice]", () => {
  assert.deepEqual(chosen({ ...base, choice: "route" }), ["route"]);
});

test("chosen: choices win over choice, in first-chosen order", () => {
  assert.deepEqual(chosen({ ...base, choice: "route", choices: ["selfreport", "route"] }), ["selfreport", "route"]);
});

test("choiceRules: title and rule from the scenario, in chosen order", () => {
  assert.deepEqual(choiceRules({ ...base, choice: "route", choices: ["selfreport", "route"] }), [
    { choice: "selfreport", title: selfreport.title, rule: selfreport.rule },
    { choice: "route", title: route.title, rule: route.rule },
  ]);
  assert.deepEqual(choiceRules(undefined), []);
});

test("ruleText: the rules joined with a space, \"\" when none", () => {
  assert.equal(ruleText(undefined), "");
  assert.equal(ruleText({ ...base, choice: "selfreport" }), selfreport.rule);
  assert.equal(ruleText({ ...base, choice: "route", choices: ["selfreport", "route"] }), `${selfreport.rule} ${route.rule}`);
});

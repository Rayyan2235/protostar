/**
 * The requester's data choices (plan-4 BE-12). A second Level 3–4 flag adds a choice; it never
 * replaces the first, so every rule the requester chose stays in force, in the order chosen.
 * Old sessions only have `choice`. Pure and browser-safe: scenario and types only.
 */
import { SCENARIO } from "./scenario";
import type { Pushback, PushbackChoice } from "./types";

/** Every applied choice, first-chosen first. Old sessions: [choice]. */
export function chosen(pb?: Pushback): PushbackChoice[] {
  return pb?.choices ?? (pb?.choice ? [pb.choice] : []);
}

/** The card title and the agent rule for each applied choice, in chosen order. */
export function choiceRules(pb?: Pushback): { choice: PushbackChoice; title: string; rule: string }[] {
  return chosen(pb).map((choice) => {
    const { title, rule } = SCENARIO.pushback.options[choice];
    return { choice, title, rule };
  });
}

/** The rules joined with a space; "" when nothing was chosen. */
export function ruleText(pb?: Pushback): string {
  return choiceRules(pb).map((r) => r.rule).join(" ");
}

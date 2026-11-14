/**
 * Test support: Dana's session at the tests step, built with the reducer only (no model, no
 * I/O). Public data and placeholders only. Used by the run and contract tests.
 */
import { initial, reduce } from "./journey";
import { priceFor } from "./scoper";
import type { Session, SlotKey, Source } from "./types";

export const AT = "2026-11-12T09:00:00.000Z";

export const DANA_ANSWERS: Record<SlotKey, string> = {
  users: "Sophomores thinking about Finance",
  top: "Can I switch? What GPA do I need? When can I apply?",
  never: "Promise admission or ask for records",
  examples: "Great: cites the 3.50 minimum and says it isn't a guarantee. Bad: 'you'll get in'.",
  sources: "The bulletin and the Smeal change-of-major page",
  handoff: "Appeals and anything about their own record",
};

const audit: Source = {
  name: "Students paste their degree audit", level: 3, decidedBy: "rule",
  reason: "A degree audit is a FERPA student record (Level 3).", ruleId: "degree-audit",
};
const bulletin: Source = { name: "Undergraduate Bulletin", level: 1, decidedBy: "rule", reason: "Published public pages are Level 1.", ruleId: "public-page" };

/** Prefilled users/top, degree audit flagged and resolved with (a), interview done, guided scope on the cheap model. */
export function danaAtTests(id = "dana"): Session {
  let s = reduce(initial(id, AT), { type: "SUBMIT_IDEA", text: "Something that helps students figure out if they can switch into Finance.", at: AT });
  s = reduce(s, {
    type: "APPLY_TURN", sources: [bulletin, audit], at: AT,
    prefilled: [{ key: "users", value: DANA_ANSWERS.users, confidence: 0.9 }, { key: "top", value: DANA_ANSWERS.top, confidence: 0.85 }],
  });
  s = reduce(s, { type: "RESOLVE_PUSHBACK", choice: "selfreport", at: AT });
  while (s.step === "interview" && s.question) {
    s = reduce(reduce(s, { type: "ANSWER", value: DANA_ANSWERS[s.question.slot], at: AT }), { type: "APPLY_TURN", prefilled: [], sources: [], at: AT });
  }
  const model = "claude-haiku-4-5";
  return reduce(s, {
    type: "CHOOSE_SCOPE", scope: "guided", role: "cheap", model, price: priceFor(model),
    knobs: { studentsPerMonth: 2000, convsPerStudent: 2 }, at: AT,
  });
}

/**
 * The interviewer on the real path (BE-8, ADR 0013): the offline fixture is raw TurnSchema
 * input, parsed with the schema and mapped with toTurn() like a model's output. GOLDEN is
 * what the old offlineTurn() returned at each stage of the Dana path (captured on 19c513a),
 * so the move changes no behaviour.
 */
import { test } from "node:test";
import assert from "node:assert/strict";
import { initial, reduce } from "./journey";
import * as interviewer from "./interviewer";
import { interviewTurn, toTurn } from "./interviewer";
import { offlineTurnRaw } from "./offline";
import { OFFLINE_SOURCE, TurnSchema } from "./schemas";
import type { InterviewTurn, Session } from "./types";

const at = "2026-11-12T00:00:00.000Z";
const ANSWERS: Record<string, string> = {
  top: "What GPA do I need? Which courses first?", never: "Promise admission",
  examples: "Great: cites 3.50. Bad: you'll get in.", handoff: "Appeals", users: "Sophomores", sources: "The bulletin",
};

const GOLDEN: InterviewTurn[] = [
  {
    "prefilled": [
      {
        "key": "users",
        "value": "Students considering a change of major into Finance",
        "confidence": 0.8
      },
      {
        "key": "sources",
        "value": "Finance B.S. bulletin page; Smeal change-of-major page",
        "confidence": 0.8
      },
      {
        "key": "top",
        "value": "Minimum GPA; required entrance courses; credit window",
        "confidence": 0.5
      }
    ],
    "sources": [
      {
        "name": "Finance, B.S. (Business) — Entrance to Major",
        "url": "https://bulletins.psu.edu/undergraduate/colleges/smeal-business/finance-bs/",
        "suggestedLevel": 1,
        "reason": "Public page"
      },
      {
        "name": "Petition for Department Review to Change Major",
        "url": "https://smeal.psu.edu/student-success/undergraduate/advising/get-into-a-smeal-major/petition-for-department-review-to-change-major",
        "suggestedLevel": 1,
        "reason": "Public page"
      }
    ],
    "nextQuestion": {
      "slot": "top",
      "ask": "What are the top questions they ask you? Give me up to five.",
      "chips": [
        "What GPA do I need?",
        "Which courses come first?",
        "When can I apply?"
      ]
    },
    "done": false
  },
  {
    "prefilled": [],
    "sources": [],
    "nextQuestion": {
      "slot": "never",
      "ask": "What must it never do?",
      "chips": [
        "Promise someone gets in",
        "Tell a student what to drop",
        "Look up a student's record"
      ]
    },
    "done": false
  },
  {
    "prefilled": [],
    "sources": [],
    "nextQuestion": {
      "slot": "examples",
      "ask": "Show me one great answer and one bad answer to the same question.",
      "chips": [
        "Great: the published minimum + next steps. Bad: \"Yes, you qualify!\""
      ]
    },
    "done": false
  },
  {
    "prefilled": [],
    "sources": [],
    "nextQuestion": {
      "slot": "handoff",
      "ask": "When should it stop and send the student to you?",
      "chips": [
        "Appeals",
        "Medical or special circumstances",
        "Anything about a specific record"
      ]
    },
    "done": false
  },
  {
    "prefilled": [],
    "sources": [],
    "done": true
  }
];

/** The session before each offline turn of the Dana path, driven the same way GOLDEN was captured. */
function stages(): Session[] {
  let s = reduce(initial("g", at), { type: "SUBMIT_IDEA", text: "Help students see if they can switch into Finance", at });
  const out: Session[] = [];
  for (let i = 0; i < 8; i++) {
    out.push(s);
    const t = toTurn(TurnSchema.parse(offlineTurnRaw(s)));
    s = reduce(s, {
      type: "APPLY_TURN", prefilled: t.prefilled, at, question: t.nextQuestion,
      sources: t.sources.map((x) => ({ name: x.name, url: x.url, level: x.suggestedLevel, decidedBy: "model" as const, reason: x.reason })),
    });
    if (!s.question) break;
    s = reduce(s, { type: "ANSWER", value: ANSWERS[s.question.slot], at });
  }
  return out;
}

test("every offline turn fixture parses with TurnSchema, at every stage of the Dana path", () => {
  const all = stages();
  assert.equal(all.length, GOLDEN.length);
  for (const s of all) TurnSchema.parse(offlineTurnRaw(s));
});

test("golden: parse + toTurn gives exactly what the old offline script returned", () => {
  assert.deepEqual(stages().map((s) => toTurn(TurnSchema.parse(offlineTurnRaw(s)))), GOLDEN);
});

test("interviewTurn in offline mode goes through complete() and is labelled offline", async () => {
  const prev = process.env.LLM_PROVIDER;
  process.env.LLM_PROVIDER = "offline";
  try {
    const s = stages()[0];
    const r = await interviewTurn(s, s.idea);
    assert.deepEqual(r, { turn: GOLDEN[0], model: OFFLINE_SOURCE, offline: true });
  } finally {
    if (prev === undefined) delete process.env.LLM_PROVIDER; else process.env.LLM_PROVIDER = prev;
  }
});

test("toTurn clamps model output: confidence 0-1, level 1-4, null url and question dropped", () => {
  const t = toTurn({
    prefilled: [{ key: "users", value: "x", confidence: 1.7 }, { key: "top", value: "y", confidence: -1 }],
    sources: [{ name: "a", url: null, suggestedLevel: 7, reason: "r" }, { name: "b", url: "https://x", suggestedLevel: 2.6, reason: "r" }],
    nextQuestion: null,
  });
  assert.deepEqual(t.prefilled.map((p) => p.confidence), [1, 0]);
  assert.deepEqual(t.sources.map((x) => [x.url, x.suggestedLevel]), [[undefined, 4], ["https://x", 3]]);
  assert.equal(t.nextQuestion, undefined);
  assert.equal(t.done, true);
});

test("the interviewer no longer exports TurnSchema or a hand-built offline turn", () => {
  assert.equal("TurnSchema" in interviewer, false);
  assert.equal("offlineTurn" in interviewer, false);
});

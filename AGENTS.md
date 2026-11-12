# Protostar — agent instructions

Protostar (working name; "Agent Spec Builder") is a prototype, not a product. A university staff member describes an AI agent they want. Protostar **interviews** them, **pushes back** on risky data, offers **scoped options with a cost estimate**, drafts the agent, **tests** it on two models, and hands a reviewer a **one-page blueprint** to approve.

Demo path only: Dana, a Penn State Smeal undergraduate advisor, wants an agent that answers change-of-major-into-Finance questions. Build for that path; do not generalize.

## Hard rules

- **No student data.** Public / Penn State Level 1–2 data only. Knowledge comes from the public page snapshots in `knowledge/`.
- **Never scrape, automate, or inject into aistudio.psu.edu** or any nebulaONE instance. Protostar is standalone.
- **Keys live only in `.env`** (gitignored). Never commit, log, or paste them.
- **Costs are estimates** from public list prices, and the UI says so.
- **Humans own judgment, the tool owns busywork.** Never-do rules, examples, and hand-off rules are always asked, never invented. Every decision is logged with who made it (`requester` | `tool` | `reviewer`).
- **Data gate is rules first.** A rules table assigns data levels; the model only classifies sources the rules do not cover, and the result records `decidedBy: 'rule' | 'model'`. Degree audits / transcripts (Level 3–4, FERPA) always block. "Keep anyway" never advances the flow.
- **All model calls go through `lib/llm.ts` `complete()`** with a zod schema. No agent framework. Provider is one env value: `foundry | anthropic | nebulaone`.
- Commits: small, pushed often, **no `Co-Authored-By` trailer**.

## Layout

```
app/            Next.js App Router pages + route handlers (/ requester, /review/[id] reviewer)
lib/llm.ts      complete({ system, messages, schema, model }) -> typed JSON
lib/            journey (state machine), dataRules (gate), interviewer, knowledge, store (SQLite), engine (orchestration); later: scoper, drafter, tests, runner, grader
knowledge/      public page snapshots, front matter has url + fetchedAt
scripts/        smoke.ts (npm run smoke)
data/           SQLite file (gitignored)
```

## Contract (draft, from the planning vault)

```ts
type Who = 'requester' | 'tool' | 'reviewer';
type Level = 1 | 2 | 3 | 4;
type SlotKey = 'users' | 'top' | 'never' | 'examples' | 'sources' | 'handoff';
interface Slot { key: SlotKey; value: string; filledBy: 'requester' | 'prefill'; confidence?: number }
interface Source { name: string; url?: string; level: Level; decidedBy: 'rule' | 'model'; reason: string }
interface Decision { at: string; who: Who; what: string }
interface Test { id: number; prompt: string; mustInclude: string[]; mustNot: string[]; from: 'top' | 'never' | 'example' | 'handoff' | 'requester' }
interface Verdict { testId: number; model: string; pass: boolean; by: 'check' | 'judge'; reason: string; answer: string }
```

Steps: `idea -> interview -> scope -> tests -> blueprint -> review -> done`. Cost: `students x convsPerStudent x (inTok x in$/1M + outTok x out$/1M)`.

## Commands

- `npm run dev` · `npm test` · `npm run typecheck` · `npm run lint`
- `LLM_PROVIDER=offline` in `.env`: scripted interviewer, no model calls, labeled in the UI. For UI work only; the demo uses real models.
- `npm run smoke`: one structured call per configured model (needs `.env`)
- `npm run report -- <session-id>`: per-step timings from a session's decision log (for user tests)

<!-- BEGIN:nextjs-agent-rules -->

## This is NOT the Next.js you know

This version has breaking changes — APIs, conventions, and file structure may all differ from your training data. Read the relevant guide in `node_modules/next/dist/docs/` (resolved from this file's directory; in monorepos the `next` package may not be visible from the repo root) before writing any code. Heed deprecation notices.

This block is written and re-added by `next dev` — verify at `node_modules/next/dist/server/lib/generate-agent-files.js`. Removing it from a diff only re-creates the uncommitted change; committing it with your work keeps the tree clean.

<!-- END:nextjs-agent-rules -->

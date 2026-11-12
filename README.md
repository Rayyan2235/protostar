# Protostar

> Working name. A prototype "Agent Spec Builder" for university AI platforms. A prototype, not a product.

A staff member types one sentence, such as "I want an agent that answers change-of-major questions". Protostar then:

1. **interviews** them, a few sharp questions at a time;
2. **pushes back** on risky data with a rules-first FERPA gate;
3. offers **scoped options** with a monthly **cost estimate**;
4. drafts the agent and **tests** it on two models against real public pages;
5. hands a reviewer a **one-page blueprint** to approve or send back.

## Why

University AI platforms such as nebulaONE make it easy to build an agent. The bottleneck is expert time: someone has to scope it, check its data and review it. Protostar does the busywork so that time goes to the judgment calls.

## Run it

Needs Node 22 or later (`better-sqlite3` 13 requires it). Verified with Node 24.22.1 and npm 11.3.0.

```bash
npm ci
cp .env.example .env
```

Then, in `.env`, set `LLM_PROVIDER=offline` to try it without keys, or fill in a provider (below). After that:

```bash
npm run dev       # http://localhost:3000
npm test          # unit tests (node:test via tsx)
npm run typecheck
npm run lint
npm run smoke     # one structured call per configured model; needs real keys
```

### Windows: if `npm ci` fails on `better-sqlite3`

On Windows without Visual Studio's C++ build tools, `npm ci` fails while building `better-sqlite3`:

```
gyp ERR! find VS You need to install the latest version of Visual Studio
```

`better-sqlite3` ships a prebuilt Windows x64 binary, so you can skip the native build and only run the one other install script the project needs:

```bash
npm ci --ignore-scripts
npm rebuild esbuild
```

Checked on Windows 11 with Node 24.22.1 and npm 11.3.0. Plain `npm ci` failed as shown above, and the two commands above installed cleanly with all tests passing. The error's own suggested fix also works in principle: install Visual Studio with the "Desktop development with C++" workload, then run plain `npm ci`. That route wasn't tried here.

## Providers

One value picks the gateway: `LLM_PROVIDER=foundry | anthropic | nebulaone | offline`. Every model call goes through one function (`complete()` in `lib/llm.ts`) with a zod schema, so the same code runs on each.

| `LLM_PROVIDER` | What you set |
|---|---|
| `foundry` | `LLM_API_KEY` plus `LLM_FOUNDRY_RESOURCE` (or `LLM_BASE_URL`); model names are your deployment names |
| `anthropic` | `LLM_API_KEY` |
| `nebulaone` | `LLM_API_KEY` plus `LLM_BASE_URL=https://<gateway>/anthropic`, a nebulaONE gateway's Anthropic-compatible endpoint, so it can run inside an institution's own tenant |
| `offline` | Nothing. No model calls: a fixed script stands in for the model, and the UI labels it. Good for trying the flow and for tests; it is not a model run |

`MODEL_CHEAP` and `MODEL_CAPABLE` name the two models the tests compare. `MODEL_JUDGE` defaults to `MODEL_CAPABLE`. See `.env.example`.

## Where it stands

| Phase | State |
|---|---|
| 0 Setup: Next.js, SQLite, one model-call function, smoke test | Merged |
| 1 Interview and the rules-first data gate | Merged |
| 2a Scope options, cost estimate, deterministic answer checks | Merged |
| 3 Blueprint, submit, reviewer link (request changes, resubmit, approve), exports | Built, in review |
| 2b Drafting, test generation and two-model test runs, offline first | In progress |
| 4 Polish, hosting, write-up | Not started |

Nothing has run against a real model yet: the real-model runs wait on keys. Everything above runs offline today.

## Next

- Phase 2b end to end offline, then the same flow with real models once keys are in place.
- A short user test of the interview with a staff member who builds agents.

## Out of scope

- Logins and accounts. A secret review link is the only access control.
- Talking to any university AI platform. Protostar is standalone: it never scrapes, automates or writes to one, and its export is text you copy.
- More than one use case. The demo is one advisor's change-of-major agent.

## Ground rules

- **No student data.** Only public pages and Level 1–2 data under the university's data classification. Knowledge is snapshots of public pages in `knowledge/`, each with its source URL and fetch date. Transcripts, degree audits and other student records always block.
- **Cost figures are estimates** from public list prices, not quotes, and the UI says so.
- **Keys live only in `.env`**, which is gitignored.

# Protostar

> Working name. A prototype "Agent Spec Builder" for university AI platforms.

A staff member types one sentence ("I want an agent that answers change-of-major questions"). Protostar interviews them, pushes back on risky data (FERPA), offers scoped options with a monthly cost estimate, drafts and tests the agent on two models against real public pages, and hands a reviewer a one-page blueprint to approve.

**Status:** Phase 0 (setup). Not usable yet.

## Run

```bash
npm install
cp .env.example .env   # fill in provider + key
npm run smoke          # one structured call per model
npm run dev
```

## Provider config

One value switches the gateway: `LLM_PROVIDER=foundry | anthropic | nebulaone`. `nebulaone` points at an Anthropic-compatible gateway (`<gateway>/anthropic`), so the same flow can run inside a customer's own tenant.

## Ground rules

- No student data. Knowledge is snapshots of public Penn State pages in `knowledge/`, each with its source URL and fetch date.
- Cost figures are estimates from public list prices.
- Standalone. It does not touch any university AI platform.

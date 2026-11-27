# StatusMark

New part, built from Kiln tokens. A test verdict as a word plus a small shape. Used on the tests screen.

## What the consumer provides
- `state` is one of:
  - `"idle"`
  - `"running"`
  - `"pass"`
  - `"fail"`
  - `"model-unavailable"`
  - `"judge-unavailable"`
  - `"accepted"`
- `land` (optional): true when this mark's run just arrived in this tab, so its check or cross draws.
- `delay` (optional, seconds): the row's stagger offset.

## Anatomy
- An `aria-hidden` shape, then a **visible** word in `small` semibold. The word is never `sr-only` only.

| State | Word | Shape |
|---|---|---|
| idle | Not run | Ring, `ink-muted` |
| running | Running | Arc, `ink-soft` |
| pass | Pass | Check, `success` |
| fail | Fail | Cross, `danger` |
| model-unavailable | Model unavailable | Dash, `ink-muted` |
| judge-unavailable | Judge unavailable | Dash, `ink-muted` |
| accepted | Accepted | Cross, `ink-muted` |

## Motion
These follow plan-kiln's "Motion rules".
- **`running`:** the arc turns once per `--dur-mood`. The turn is linear and repeats until the state changes. Only the two column marks should ever be `running`; row marks keep their last state until the run lands.
- **Landing:** a check or cross draws with DrawSVG over `--dur-quick` at `delay`. That happens only when `land` is set or straight after `running`. It never happens on a reload, a poll or a first paint.
- **Still state:** the server markup and reduced motion both show the final shape, and a still arc while running.

## Rules
- The word carries the meaning; colour only echoes it.
- Colours come only from tokens.
- Built on `DrawnMark` (`components/motion/DrawnCheck.tsx`).

## Credit
Our own code and paths, on GSAP (Standard "No Charge" GSAP License).

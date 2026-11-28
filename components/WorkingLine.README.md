# WorkingLine

New part, built from Kiln tokens. It shows a test run's progress, then its result, in one line on the tests screen.

## What the consumer provides
- `n`: the number of tests.
- `offline`: true for an offline-script run.
- `state`: `"running"` or `"done"`.
- `startedAt`: `Date.now()` at the click, while running.
- `seconds`: the measured click-to-response time, once done.

## Anatomy
- **Running:** "Running {n} tests on 2 models", then an `aria-hidden` clock " · {s} s".
  - The clock ticks each second. It's plain text in tabular nums, with no roll.
  - The line is `aria-busy`.
- **Done:** "Ran {n} tests on 2 models · {x.x} s". Offline, it reads "Ran {n} tests (offline script) · {x.x} s".
- `small` text in `ink-soft`. No live region of its own: the StatusStrip says "Running tests" once and the result line once (K6 closed list).

## Motion
- The line rises in by `--space-2` with opacity as a run starts.
- On running → done, it crossfades over `--dur-quick`.
- It never animates on a first paint of a finished run. With motion off, it shows the text, still.

## Rules
- The interview keeps its own "Thinking…" line. K5's "the interview uses the same line" is retired.

## Credit
Our own code on GSAP.

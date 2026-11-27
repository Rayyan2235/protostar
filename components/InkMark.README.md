# InkMark

A hand-drawn ink stroke around a few words, drawn once when it appears. Marks the one fact a screen is about.

## What the consumer provides
- `kind`: `"underline"` or `"circle"`.
- `children`: the words (or a number) to mark. Keep it short: it doesn't wrap (`whitespace-nowrap`).

## Anatomy
- An inline-block `span` with the words as plain text, then one `aria-hidden` SVG positioned around them (`preserveAspectRatio="none"`, so the stroke fits any width).
- Stroke in `signal`, `currentColor`, round caps. Underline sits just under the baseline; circle sits around the words with `--space-2` / `--space-1` of room.
- GSAP DrawSVG draws the path from 0 over `--dur-enter`, after a `--dur-quick` delay, with the `--ease-out` curve.

## Where it's used
- The red card's title: an underline under "student records".
- The blueprint's monthly cost: a circle around the figure (requester and reviewer).

## Rules
- **One per screen.** `signal` is the sun: never two on one view, and never on body text.
- The server markup is the drawn mark; reduced motion shows it still.
- Never put meaning only in the mark: the words around it already say it.

## Credit
Behaviour inspired by Componentry's Annotated Text (https://componentry.dev/docs/components/annotated-text; repo github.com/harshjdhv/componentry). Componentry's terms say its components are "generally provided under the MIT License". No Componentry code is copied: our own paths, drawn with GSAP (Standard "No Charge" GSAP License).

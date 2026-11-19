# Motion (GSAP)

GSAP is the project's **one** animation library (Kiln `Sources.md`: "one animation library per project"). Rayyan chose it on 2026-11-19 for four effects. Licence: Standard "No Charge" GSAP License (Webflow): free for commercial use, all plugins included. The only prohibited use is a no-code animation builder that competes with Webflow.

## Files

| File | What it is |
|---|---|
| `kiln.ts` | Registers the plugins (Flip, SplitText, DrawSVG, CustomEase, `useGSAP`) in the browser. `kilnTiming()` reads `--dur-quick`, `--dur-enter` and `--ease-out` from `app/tokens.css` and builds the `kiln-out` CustomEase. `useKilnMotion(ref, run, deps)` runs effects only under `(prefers-reduced-motion: no-preference)` and reverts them on unmount. `space()` and `motionOk()` are small helpers. |
| `reveal.ts` | `useLineReveal(ref, key, pace)`: a heading's lines rise through a mask (SplitText), then the split is undone. `useRiseIn(ref, key)`: a block fades up by `--space-2`. |
| `fold.ts` | `foldFrom(el)` on the click that resolves the red card, `foldInto(row)` when the new "Data choice" row mounts: the row slides from where the card was. |
| `DrawnCheck.tsx` | A small check that draws itself (DrawSVG) when a step is finished. |

The highlight glide in `components/ChoiceList.tsx` (scope cards) uses Flip directly: one highlight span (`data-flip-id="choice-highlight"`) under the checked row, recorded before a change and flipped to the new row.

## Where each effect is

| Effect | Where | Pace |
|---|---|---|
| Statement reveal | Start screen `h1`, once | `--dur-enter` (the screen's one loud moment) |
| Question arrival | Each new interview question `h2`; its chips and field rise in under it | `--dur-quick`, triggered by the requester's answer |
| Step check | Step bar, each finished step | `--dur-quick` |
| Highlight glide | Scope cards and model choice (ChoiceList) | `--dur-quick` |
| Fold | Red card → "Data choice" row in the answer list | `--dur-quick` |
| Answer list open/close | Collapsed "Your answers, as given" | `--dur-quick` |
| Ink marks | Red card title, blueprint cost (see `InkMark.README.md`) | `--dur-enter` |

## Rules
- **Timing only from tokens.** No raw durations or curves here: a missing token means 0 s, not a made-up number. No stock GSAP eases (`power2`, `elastic`…).
- **Reduced motion = the final state, still.** Every effect sits behind `gsap.matchMedia()` or `motionOk()`.
- **The server markup is the final, still state.** Effects only animate *from* somewhere, so nothing is hidden if JavaScript is slow or off.
- **Accessibility is unchanged.** SplitText adds its own `aria-label` and the split is reverted when the animation ends; ink strokes and checks are `aria-hidden`; focus moves exactly as before.
- One animation library: don't add `motion`/framer-motion next to GSAP.
- Hidden tabs and panes don't paint frames, so effects simply don't run there. Browser checks need a visible window.

# FoldedSheet

Wraps every **submitted** blueprint (`bp.draft === false`): the reviewer page and the requester's review and done steps.

## Anatomy
- `paper-raised` sheet, padding `--space-4`.
- The top-right corner is cut with `clip-path` by `--space-4`; a `stone` triangle in `::before` shows the fold.
- The padding equals the fold size, so the SpecSheet's `v{n}` and revision (already in its header) are never clipped. No second version stamp.

## Rules
- Static: no motion. No shadow (depth from tone).
- Under `forced-colors: active` and in print: no clip, no triangle.
- Never on a draft.

## Unfold (K7)
- `unfold` and `version` are optional. Only the reviewer's `BlueprintView` passes them, and only for a submitted sheet; the requester's review step stays static.
- When a version mounts, GSAP tweens the `--fold` custom property from `--space-5` to `--space-4` over `--dur-enter`. Both the clip-path and the `::before` triangle read `var(--fold, var(--space-4))`.
- It plays once per version. Polls never replay it, and a resubmitted v2 unfolds once.
- The `--space-5` start stays under twice the padding, so the fold never covers content.
- With motion off it shows the resting fold, still.

## Credit
Behaviour adapted from Cult UI Folded Card (https://github.com/nolly-studio/cult-ui).
Cult UI © Jordan Gilliam, released under the MIT licence: permission is granted to use, copy, modify and distribute it, provided the copyright and permission notice are kept.
What we changed: rebuilt without motion/shadcn on Kiln tokens; clip-path and a CSS triangle.

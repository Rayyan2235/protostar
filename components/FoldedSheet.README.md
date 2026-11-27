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

## Credit
Behaviour adapted from Cult UI Folded Card (https://github.com/nolly-studio/cult-ui).
Cult UI © Jordan Gilliam, released under the MIT licence: permission is granted to use, copy, modify and distribute it, provided the copyright and permission notice are kept.
What we changed: rebuilt without motion/shadcn on Kiln tokens; clip-path and a CSS triangle.

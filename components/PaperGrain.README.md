# PaperGrain

A faint paper texture behind every screen. A surface finish, not art.

## Use
- Rendered once, in `app/layout.tsx`, as the first child of `<body>`. Never anywhere else.
- Remove it in one commit (the component, its line in the layout, the `.paper-grain` rule and the `--grain*` tokens) if Rayyan drops it.

## Anatomy
- One `<div aria-hidden="true" class="paper-grain">`, no children.
- `position: fixed; inset: 0; z-index: -1; pointer-events: none`.
- Background: `--grain`, three tiny `radial-gradient` dot layers from `color-mix(in oklab, var(--ink) var(--grain-share), transparent)`. No image, no SVG filter, no JS.

## Tokens
- `--grain`, `--grain-share` (8 %), `--grain-opacity` (0.5), in the project override block of `app/tokens.css`.
- **Bound:** `--grain-opacity` × `--grain-share` ≤ 0.04. `contrast.test.ts` checks every text pair on paper mixed with 4 % ink in light, dark and dusk.

## Accessibility
- `aria-hidden`; never takes focus or pointer events.
- `display: none` under `forced-colors: active` and in print.
- Static, so reduced motion needs nothing.

## Credit
Behaviour adapted from Cult UI Texture Overlay (https://github.com/nolly-studio/cult-ui).
Cult UI © Jordan Gilliam, released under the MIT licence: permission is granted to use, copy, modify and distribute it, provided the copyright and permission notice are kept.
What we changed: rebuilt without motion/shadcn as one div on Kiln tokens; CSS gradients instead of an image.

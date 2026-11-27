# SectionTabs

WAI-ARIA tabs for the requester's **live draft blueprint only** (`bp.draft === true`).

## Use
- Tabs: Summary (Spec, Data, Scope, Knowledge) · Tests · Decisions (the DecisionLog of `bp.log`, unfolded) · Export (Draft instructions + the ExportBar).
- The SpecSheet facts stay above the tablist. **Nothing that blocks or warns hides in a panel:** Submit and every blocking or stale notice sit above the tablist (`BlueprintStep`).
- A panel's state goes in its tab name, so the accessible name carries it: "Tests · not run" (`testsTabName`); FE-4b adds "Tests · out of date".
- **Not** on the reviewer page or any submitted blueprint (one scroll on a FoldedSheet), and not for models in 2b (side by side, ADR 0005).

## Behaviour
- `role="tablist"` / `tab` / `tabpanel`, roving `tabIndex`, ←/→ wrap, Home/End (`nextTab`, pure), automatic activation.
- Every panel is in the markup; inactive ones are `hidden`; a print rule shows them all.
- Selected tab: a 2px `ink` underline, no fill, in `.label`.
- On a change the incoming panel slides in by `--space-3` from the side the tab order implies (`slideFrom`, pure) plus a fade, via `@starting-style`, ≤ `--dur-quick`. No height animation. Off under reduced motion.
- SSR selects the first tab. The selection is local state, so a spec edit or poll doesn't reset it.

## Credit
Behaviour adapted from Cult UI Direction Aware Tabs (https://github.com/nolly-studio/cult-ui).
Cult UI © Jordan Gilliam, released under the MIT licence: permission is granted to use, copy, modify and distribute it, provided the copyright and permission notice are kept.
What we changed: rebuilt without motion/shadcn on Kiln tokens; WAI-ARIA tabs; CSS `@starting-style`; no height animation.

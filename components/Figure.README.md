# Figure

New part, built from Kiln tokens. It shows a number in tabular figures. When the number changes, it rolls to the new value in `dur-quick` (300 ms at most). It never rolls on first paint.

Why: when a scope or knob changes, the cost visibly updates. A jump on the same line is easy to miss.

Behaviour inspired by React Bits Count Up; our own code (no copied source).

**The consumer provides:**
- `value`;
- `format(n)`, e.g. `formatDollars`;
- `live`: only where the value changes from input (the scope cost).

* The server markup shows the final value, so it reads before any script runs.
* The rolling digits are `aria-hidden`. A visually hidden copy carries the value.
* With `live`, that copy is a polite region in the server markup. It updates once after about 500 ms idle, never on every knob step.
* Without `live`, there's no live region. Use that for the static blueprint cost.
* Under reduced motion the new value appears at once.
* Always put its label beside it. For a cost, that's the estimate note.

## K6b: rolls by digit
- Every digit is an `overflow: hidden` column of 0–9, moved by `translateY(-digit × 10%)`, in `tabular-nums`. Other characters (`$`, `,`, `.`, `/`) are static.
- `digitColumns(prev, next)` aligns from the right: units keep their key when the length changes (999 → 1,000), a new leading column mounts without a roll, and a column that changes kind (digit ↔ separator) gets a new key.
- The server markup already has the final offsets (no clock or window). The roll is a CSS transition on `transform` (`--dur-quick`, ≤ 300 ms), so it never runs on first paint; reduced motion = instant.
- All K5 rules stay: the columns are `aria-hidden`; one sr-only copy; the live region only on the scope cost, debounced; the "estimate" label beside every cost.

### Credit
Digit roll adapted from Cult UI Rolling Number (https://github.com/nolly-studio/cult-ui).
Cult UI © Jordan Gilliam, released under the MIT licence: permission is granted to use, copy, modify and distribute it, provided the copyright and permission notice are kept.
What we changed: rebuilt without motion on Kiln tokens; CSS transforms only.

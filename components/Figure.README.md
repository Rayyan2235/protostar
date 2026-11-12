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

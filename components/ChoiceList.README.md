# ChoiceList

New part, built from Kiln tokens. Pick one of a few options. They show as rows separated by `hairline`, not as identical cards.

Why: Kiln's checklist bans grids of identical cards. Rows also leave room on the right for a fact, such as a cost.

**The consumer provides:**
- `label`;
- `options`, each with a `value` and `title`, plus optional `detail`, `meta` and `marks`;
- `value` and `onChange`;
- optionally `disabled`.

* It is a `radiogroup` of `radio` buttons with `aria-checked`. It has one tab stop, and the arrow keys move and select.
* The selected row is `paper-raised` with an `accent` dot. `aria-checked` carries the same meaning for screen readers.
* Marks are Tags (risk, Recommended). Use three at most.

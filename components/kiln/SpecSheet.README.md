# SpecSheet

Ported from Kiln. Facts laid out like a hardware datasheet:
- a numbered header over a heavy `ink` rule;
- mono labels on the left and values on the right;
- dotted `stone` leaders joining each label to its value.

Why: the blueprint's key facts (scope, model, cost, data level, tests, status) read as engineered, not generated.

**The consumer provides:**
- `number`, e.g. "BLUEPRINT v2";
- `title`;
- `revision`, a date;
- 4 to 8 `rows` of `{ label, value }`;
- optionally `headingLevel` (2 by default, or 3).

* It throws with fewer than 4 or more than 8 rows, so you pick the facts that matter.
* Every value is a fact. Unknowns stay as [PLACEHOLDERS]; never invent one.
* Rows are separated by `hairline`. On phones the label sits above the value, with no leaders.

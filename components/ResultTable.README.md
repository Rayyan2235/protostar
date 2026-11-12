# ResultTable

New part, built from Kiln tokens. It shows rows of results against a few columns, for example the tests against the two models.

Why: the tests screen, the blueprint and the reviewer page all need verdicts that read the same way. A real table keeps the meaning for screen readers.

**The consumer provides:**
- a `caption` (screen readers only);
- the `columns`, each with a `title` and an optional `note` (a model name, "Unavailable");
- the `rows`, each with a `title`, an optional mono `label`, one cell per column (`null` = not run), and optional `actions`.

* Each verdict is a word ("Pass", "Fail", "Error"). Its colour (`success` or `danger` ink) only echoes the word.
* The reason is always visible, inline under the verdict. Never put it in a tooltip.
* Each row is a `tbody` row group: the title on its own line, then the cells side by side, then the actions. It fits 360px without hiding the table semantics.
* Header rule in `ink`, row rules in `hairline`. No boxes and no zebra fills.

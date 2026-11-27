# Tag

Ported from Kiln. A small mono tag in one of three states:
- neutral: on `paper` with a `hairline` border;
- selected: on `accent-fill`;
- live: with a `signal` dot.

Why: short facts (data level, who decided, risk) that you can scan in one line.

**The consumer provides:** the words, plus `selected` or `live` when either is true.

* Use up to three on a row or card.
* Use real case ("Level 3 · High"), not all caps.
* Show a live dot only for a real state that the words explain ("Waiting for review").

## Project override (K6a)
* The tag uses `--radius-control` (4px). Only the live dot stays round (`--radius-pill`), because its shape carries meaning.

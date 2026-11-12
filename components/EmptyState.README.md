# EmptyState

New part, built from Kiln tokens. It is type only: one big Fraunces word as the page heading, one sentence, and one way forward.

Why: Kiln's empty state used a framed backdrop. After K4 there is no art (ADR 0012 addendum), so the type carries the moment.

**The consumer provides:**
- `mark`: the big word, e.g. "Not found.";
- the sentence, as children;
- `action`: exactly one Button or link.

* It is the page's `h1` and the screen's one loud moment.
* No art, no icon and no illustration.
* Sentence case. Say what happened and what to do next. Never blame the visitor.
* Used for a bad review link, a missing session link, and "no run yet" on the tests screen (FE-4a).

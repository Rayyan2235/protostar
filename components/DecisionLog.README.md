# DecisionLog

New part, built from Kiln tokens. It lists who decided what, oldest first, inside a folded `details`. Each row is separated by a `hairline`.

Why: the requester's side panel and the blueprint both show the same log. Hard rule: every decision records who made it.

**The consumer provides:** `log`, an array of `{ who, what }`.

* The decider is named in a mono `label`: requester, tool or reviewer. The colour only echoes the word (accent, ink-muted, ink).
* It is closed by default. The summary shows the count.
* Never put it inside a card. It sits at the end of a section stack.

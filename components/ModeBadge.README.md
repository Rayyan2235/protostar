# ModeBadge

New part, built on the Kiln Tag. It says which model provider answers: the offline script, live models, or a misconfigured setup.

Why: the requester and the reviewer must always know whether real models are answering. The studio and the reviewer page both need the same small badge.

**The consumer provides:** `mode`, the string the API returns (`offline`, `misconfigured…`, or a provider name).

* The mode is always in words. Only live models get the live dot, because that dot stands for a real, explained state.
* Put it in the TopBar, on the right.

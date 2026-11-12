# Notice

New part, built from Kiln tokens. A banner in the flow: `paper-raised`, with a `hairline` border (a full `danger` border for danger). The tone shows in the title's ink.

Why: pushback, change requests, approvals and errors all need one consistent, calm shape.

**The consumer provides:**
- the text (required; it throws without it);
- optionally a `title`;
- optionally a `tone`: `neutral`, `accent`, `success` or `danger`;
- optionally `actions`: the buttons that answer it;
- optionally `live={false}` for history already on the page. It then gets no live role.

* Meaning never rests on colour alone: the title or the text says it in words.
* A `danger` notice is `role="alert"`. The other tones are `role="status"`.
* Don't nest it in a card. Use one Notice, then space.
* No side tab: a thick coloured edge on one side is a well-known tell of AI-made UI.

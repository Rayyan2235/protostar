# TextField

New part, built from Kiln tokens. A labelled input or textarea.

Why: every form in the app needs the same label wiring, error state and focus ring.

**The consumer provides:** `id`, `label`, `value` and `onChange(value)`. Optional:
- `multiline` and `rows`;
- `autosize` and `maxRows` (multiline only; default 6);
- `error` and `hint`;
- `hideLabel`;
- `fieldRef`;
- the usual input attributes.

* The label's `for` always matches the field's `id`. With `hideLabel`, the label stays, for screen readers only.
* `error` does three things:
  * sets `aria-invalid`;
  * links the message with `aria-describedby`;
  * shows the message in words, in `danger` text.
* The border is `ink-muted`, so the field's edge holds 3:1 on `paper-raised`. Don't use `hairline` or `stone` for it.
* Focus: a solid 2px `accent` ring with a 3px offset.
* `autosize`: the textarea grows with its content up to `maxRows`, then scrolls. It has no resize grip. The server renders `rows`, so the first paint is stable. Behaviour inspired by common autosize textareas; our own code.

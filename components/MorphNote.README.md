# MorphNote

One object changes shape: a trigger button morphs into a note panel (a field plus one submit) and back.

## Use
- **Reviewer decision form:** Approve (filled primary) → "Note to the requester (optional)" → "Approve v{n}"; Request changes (outline) → "What should change? (sent to the requester)" → "Request changes", note required, Ctrl/⌘+Enter; Reject (outline, danger) → "Why reject? (sent to the requester)" → "Reject v{n}", note required. While one panel is open the other two decisions are not rendered.
- **Spec panel:** the six named Edit buttons morph into the slot editor (Save, Cancel, Ctrl/⌘+Enter). The interview ledger stays read-only.
- Controlled: the parent owns `open` and the text, so typed text survives a close until it's sent. One open per form.

## Behaviour
- `runMorph(update)`: `document.startViewTransition` + `flushSync`; focus moves after `updateCallbackDone`. Without the API, or under reduced motion: instant.
- One `view-transition-name` per instance, shared by trigger and panel (they never coexist). **Unique on the page:** `morph-edit-<slotKey>`, `morph-decision-<status>`.
- `::view-transition-*` run at `--dur-quick`; `animation: none` under reduced motion (`app/globals.css`).
- Keys (`noteKey`, a pure table): Esc closes (not while an IME composes); plain Enter is a new line; Ctrl/⌘+Enter submits **only with `submitKey`** (spec Edit, Request changes), blocked while empty or busy. Approve and Reject end the review, so they have no shortcut.
- Focus: opening moves to the field; closing returns to the trigger (`triggerId`).
- The Kbd hint reads "Ctrl/⌘ + Enter" (platform-neutral, no hydration risk).
- Server markup: closed.

## Credit
Behaviour adapted from Cult UI Morph Surface (https://github.com/nolly-studio/cult-ui).
Cult UI © Jordan Gilliam, released under the MIT licence: permission is granted to use, copy, modify and distribute it, provided the copyright and permission notice are kept.
What we changed: rebuilt without motion/shadcn on Kiln tokens; the View Transitions API; instant without it.

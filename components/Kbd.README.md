# Kbd

New part, built from Kiln tokens. `Kbd` shows one key in mono. `KeyHint` is a quiet line of the real shortcuts beside a primary action. `submitOnEnter` holds the Enter rules for a field with one target.

Why: the idea and answer fields send on Enter, and people should see that without guessing.

**The consumer provides:**
- `Kbd`: the key in words ("Enter", "Shift + Enter");
- `KeyHint`: pairs of `[keys, what they do]`;
- `submitOnEnter({ empty, busy }, submit)`: an `onKeyDown` handler.

* Use words, not symbols, so the server and client render the same text on every platform.
* Enter submits. Shift+Enter adds a new line. Enter does nothing while IME is composing, and is blocked while the field is empty or busy.
* Only use it on a field with one target. The reviewer note has three decisions, so it gets no shortcut and no hint.
* Show only shortcuts that really work.

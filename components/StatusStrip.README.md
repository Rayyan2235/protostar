# StatusStrip

The one polite region for **transient action results**, in the top bar of every screen.

## Use
- `StatusProvider` wraps each shell (requester `Studio`, reviewer `Shell`). `TopBar` renders the strip.
- `const { say } = useStatus(); say("Saved")`. Words only: `say` has no tone, colour or icon parameter.
- **Closed list** of messages:
  - "Saved" (spec edit saved)
  - "Copied the review link"
  - "Copied for AI Studio"
  - "Downloaded protostar-blueprint-v{n}[-draft].md" / ".json" (the real file name)
  - "Sent v{n} to the reviewer"
  - FE-4a: "Running tests", and WorkingLine's result line ("Ran {n} tests on 2 models · {s} s", "(offline script)" when offline)
- **Never here:** errors (they stay in place as `role="alert"` Notices or field errors) and review decisions (they stay in the state Notices, which already announce state).
- **Rule:** each action's message lands in exactly one live region. The test counts it on rendered markup.
- **Named exceptions** with their own region: the scope `Figure`'s debounced live value, and the interview's loading line until FE-4a's WorkingLine replaces it.

## Behaviour
- Server markup: `<p role="status">`, empty.
- On `say`, the text shows in `ink` over a `paper-sunk` band that grows by `scale-x` (transform, not layout width), ≤ `--dur-quick`. After 3 s it settles to `ink-muted`; **the text stays until the next message** (WCAG 2.2.1).
- The same text twice: clear, then set again after 120 ms, so screen readers announce it again.
- The strip can shrink and truncates, so the top bar never scrolls at 360px.
- Reduced motion: no transition.

## Credit
Behaviour adapted from Cult UI Dynamic Island (https://github.com/nolly-studio/cult-ui).
Cult UI © Jordan Gilliam, released under the MIT licence: permission is granted to use, copy, modify and distribute it, provided the copyright and permission notice are kept.
What we changed: rebuilt without motion/shadcn on Kiln tokens; text only, no island shapes or icons.

# CopyButton

An outline button that copies text. Its copy glyph morphs into a check for 2 s.

## Use
- `<CopyButton label="Copy link" text={() => link} message="Copied the review link" failText="…" />`.
- Used twice: "Copy link" on the review card and "Copy for AI Studio" in the ExportBar.

## Behaviour
- **The visible label and accessible name never change.** The StatusStrip announces the result (`message`, once).
- The glyph is an inline SVG, `aria-hidden`, `currentColor`, sized by `--space-3`. The copy mark fades and shrinks; the check enters with `@starting-style`, ≤ `--dur-quick`. Reduced motion: an instant swap.
- A failed copy (rejection, or no clipboard API) shows an in-place `role="alert"` Notice with `failText`, and no check:
  - review link: "Couldn't copy. Select the text and copy it yourself."
  - AI Studio: "Couldn't copy. Use Download Markdown instead." (there's no text on screen to select)
- `runCopy(clipboard, text, message, say)` is the pure part, tested with a mocked clipboard.

## Credit
Behaviour adapted from Cult UI Copy Button (https://github.com/nolly-studio/cult-ui).
Cult UI © Jordan Gilliam, released under the MIT licence: permission is granted to use, copy, modify and distribute it, provided the copyright and permission notice are kept.
What we changed: rebuilt without motion/shadcn on Kiln tokens; CSS transitions; the label stays fixed.

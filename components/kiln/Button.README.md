# Button

Ported from Kiln. There are three kinds:
- a dark pill with a round arrow chip, for the one main action;
- a quiet outlined pill, for secondary actions and outside links (with a ↗);
- an underlined text link, for ways past.

Why: each screen has one obvious way in, and everything else looks quieter.

**The consumer provides:** a verb label, and either `onClick` or `href`. Optional: `kind` (`primary` by default, `outline` or `link`), `danger`, `external`, `disabled` and `type`.

* One primary pill per screen. Never put two pills side by side.
* `danger` makes the pill `danger`. The label says what is lost ("Reject v2").
* `external` adds:
  * the ↗;
  * "opens in a new tab" for screen readers;
  * `rel="noreferrer"`.
* Focus: a solid 2px `accent` ring with a 3px offset.
* Disabled: `stone` fill, `ink-muted` text and no arrow.
* The button is at least 44px tall (`space-5` + `space-1`).
* Hover widens the gap by `space-1` and nudges the chip. It never changes the button's size.
* Port note: Kiln's preview uses raw px. This port uses tokens only (`calc()` of `--space-*`).

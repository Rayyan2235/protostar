# TopBar

New part, built from Kiln tokens. The app-shell top bar:
- a `paper-raised` bar with a `hairline` under it;
- the product name in the display face, with a mono subtitle;
- a slot on the right for controls.

Why: Kiln's app-shell recipe asks for a top bar. NavPill is meant for marketing pages.

**The consumer provides:** `title`, an optional `subtitle`, and the right-side controls as children (mode badge, MotionSwitch, one action).

* Don't put a call-to-action pill here. The screen's one pill lives in the content.
* The width matches the page (`max-w-6xl`). The gutter is `space-3` on phones and `space-6` on desktop.

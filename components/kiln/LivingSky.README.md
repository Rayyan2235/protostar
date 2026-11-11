# LivingSky

Ported from Kiln. A backdrop that follows the visitor's clock: dawn from 5 to 8, day until 17, dusk until 20, and night after that. It has:
- a sky gradient from the `sky-*` tokens;
- a fixed star field;
- an optional orb (the sun or the moon).

Why: the same screen feels different at 7am and at midnight, and it costs almost nothing.

**The consumer provides:**
- `label`: what the scene shows, for screen readers;
- the art, as children (SVG silhouette layers);
- optionally:
  - `mode` (`auto` by default);
  - `motion` (false keeps it still);
  - `orb` (false when the art brings its own light);
  - a `className` for size and radius.

* The server render and the first client render are always night and still. The clock is read after mount (`useSyncExternalStore`), so hydration matches.
* There is one slow loop: the star field drifts over `dur-drift`. Art children can opt in:
  * `data-anim="breathe"` or `"drift"` to move;
  * `data-layer="night"` to fade during the day.
* It animates only while it is on screen (IntersectionObserver) and motion is allowed. `html[data-motion]` from MotionSwitch decides first; otherwise `prefers-reduced-motion` decides.
* `land`, `glow` and `sky-*` stay inside the art. Never put the sky behind body text or forms.
* Not ported, because nothing here needs them: the sky picker, birds, the storm and its rain canvas, and sound.

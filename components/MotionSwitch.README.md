# MotionSwitch

The visible Motion switch Kiln asks for wherever something moves (KILN-AGENT §10: "A visible Motion switch overrides the system setting both ways"). It was removed in K4, when nothing moved; it came back with the GSAP motion pass (2026-11-19).

**Why:** the system's reduced-motion setting shouldn't be the only control. Example: Windows with "Animation effects" off reports reduced motion to the browser, so without this switch none of the motion would ever play on that machine.

**The consumer provides:** nothing. It sits in the TopBar, after the actions.

## Rules
- A toggle button with `aria-pressed`. Its accessible name stays "Motion" in both states; the visible "on" / "off" word beside it is `aria-hidden`.
- Writes `data-motion="on"` or `"off"` on `<html>`. `motionOk()` in `components/motion/kiln.ts` reads it first, so every GSAP effect obeys it.
- The default comes from `prefers-reduced-motion`.
- The choice is remembered in `localStorage` (try/catch). If storage is blocked, it still works for the current page view.
- The server always renders it as on; it reads storage and the media query only after mount.
- K6a: no pill (`--radius-control`). From `sm` up only: on phones the bar stays one row and the system setting decides.
- Known limit: Tailwind `motion-reduce:` CSS transitions (hover colours, the step underline) still follow the system setting, not this switch.

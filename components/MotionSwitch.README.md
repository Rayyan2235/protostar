# MotionSwitch

New part, built from Kiln tokens. The visible Motion switch that Kiln asks for wherever something moves.

Why: the system's reduced-motion setting shouldn't be the only control. The visitor can turn motion on or off here, overriding the system either way.

**The consumer provides:** nothing. Put it in the TopBar.

* It is a toggle button with `aria-pressed`. Its name stays "Motion" in both states.
* It writes `data-motion="on"` or `"off"` on `<html>`. LivingSky and any CSS animation obey it.
* The default comes from `prefers-reduced-motion`.
* The choice is remembered in `localStorage`, wrapped in try/catch. If storage is blocked, it still works for the current page view.
* The server always renders it as on. It reads storage and the media query only after mount.

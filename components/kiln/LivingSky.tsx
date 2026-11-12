"use client";

import { useEffect, useRef, useState, useSyncExternalStore, type ReactNode } from "react";

/** Kiln LivingSky (KILN-AGENT §7, §8): a backdrop that follows the visitor's clock. */
export type SkyMode = "dawn" | "day" | "dusk" | "night";

export function skyForHour(h: number): SkyMode {
  if (h >= 5 && h < 8) return "dawn";
  if (h >= 8 && h < 17) return "day";
  if (h >= 17 && h < 20) return "dusk";
  return "night";
}

/** Server and first client render use this hour (night), so hydration matches; the real clock follows. */
const SERVER_HOUR = 0;
const subscribeHour = (cb: () => void) => {
  const t = setInterval(cb, 60_000);
  return () => clearInterval(t);
};
const readHour = () => new Date().getHours();
const serverHour = () => SERVER_HOUR;

/*
 * Sky colours come from the sky-* tokens (art only). Animations run only on [data-live]:
 * set after mount, while on screen, with motion allowed. The Motion switch (html[data-motion])
 * overrides the system setting both ways.
 */
const CSS = `
.ks-sky{position:relative;overflow:hidden;isolation:isolate;background:linear-gradient(to bottom,var(--ks-top),var(--ks-low))}
.ks-sky[data-sky=dawn]{--ks-top:var(--sky-dawn-top);--ks-low:var(--sky-dawn-low);--ks-orb:var(--signal);--ks-night:.6}
.ks-sky[data-sky=day]{--ks-top:var(--sky-day-top);--ks-low:var(--sky-day-low);--ks-orb:var(--glow);--ks-night:.3}
.ks-sky[data-sky=dusk]{--ks-top:var(--sky-dusk-top);--ks-low:var(--sky-dusk-low);--ks-orb:color-mix(in oklab,var(--signal),var(--land) 35%);--ks-night:.7}
.ks-sky[data-sky=night]{--ks-top:var(--sky-night-top);--ks-low:var(--sky-night-low);--ks-orb:var(--on-art);--ks-night:1}
.ks-sky [data-layer=night]{opacity:var(--ks-night);transition:opacity var(--dur-mood) var(--ease-inout)}
.ks-sky [data-layer=stars]{opacity:calc(var(--ks-night) * var(--ks-night) * var(--ks-night));transition:opacity var(--dur-mood) var(--ease-inout)}
.ks-sky [data-layer=orb]{fill:var(--ks-orb);transition:fill var(--dur-mood) var(--ease-inout)}
.ks-sky [data-anim]{transform-box:fill-box;transform-origin:center}
.ks-sky[data-live] [data-anim=drift]{animation:ks-drift var(--dur-drift) var(--ease-inout) infinite alternate}
.ks-sky[data-live] [data-anim=breathe]{animation:ks-breathe calc(var(--dur-drift) / 2) var(--ease-inout) infinite alternate}
html[data-motion=off] .ks-sky [data-anim]{animation:none}
@media (prefers-reduced-motion:reduce){html:not([data-motion=on]) .ks-sky [data-anim]{animation:none}}
@keyframes ks-drift{to{transform:translateX(var(--space-4))}}
@keyframes ks-breathe{from{opacity:.7;transform:scale(.94)}to{opacity:1;transform:scale(1.06)}}
`;

/** Fixed star field (no randomness, so server and client agree). viewBox 0 0 100 60. */
const STARS: [number, number, number][] = [
  [6, 8, .35], [14, 22, .25], [22, 6, .3], [31, 15, .2], [38, 4, .35], [47, 19, .25], [55, 9, .3],
  [63, 3, .2], [69, 17, .35], [77, 7, .25], [85, 21, .3], [92, 5, .35], [97, 14, .2], [10, 30, .2],
  [44, 28, .2], [81, 31, .25], [27, 34, .2], [59, 26, .2],
];

/** "auto" follows the visitor's clock; a pinned mode ignores it. */
export function skyFor(mode: "auto" | SkyMode, hour: number): SkyMode {
  return mode === "auto" ? skyForHour(hour) : mode;
}

export function LivingSky({ label, mode = "auto", motion = true, orb = true, className = "", children }: {
  /** What the scene shows, for screen readers. */
  label: string;
  mode?: "auto" | SkyMode;
  /** false: never animate (the art stays still). */
  motion?: boolean;
  /** The sun or moon. Off when the art brings its own light. */
  orb?: boolean;
  className?: string;
  /** Foreground art (SVG silhouette layers). Decorative. */
  children?: ReactNode;
}) {
  const hour = useSyncExternalStore(subscribeHour, readHour, serverHour);
  const sky = skyFor(mode, hour);
  const ref = useRef<HTMLDivElement>(null);
  const [onScreen, setOnScreen] = useState(false);

  // Animate only while visible; loops pause off screen.
  useEffect(() => {
    const el = ref.current;
    if (!el || !motion || typeof IntersectionObserver === "undefined") return;
    const io = new IntersectionObserver(([e]) => setOnScreen(e.isIntersecting));
    io.observe(el);
    return () => io.disconnect();
  }, [motion]);

  return (
    <div ref={ref} role="img" aria-label={label} data-sky={sky} {...(motion && onScreen ? { "data-live": "" } : {})}
      className={`ks-sky ${className}`}>
      <style href="kiln-living-sky" precedence="default">{CSS}</style>
      <svg aria-hidden="true" className="absolute inset-0 size-full" viewBox="0 0 100 60" preserveAspectRatio="xMidYMin slice">
        {/* The one ambient loop: the star field drifts slowly. */}
        <g data-layer="stars" style={{ fill: "var(--on-art)" }}>
          <g data-anim="drift">
            {STARS.map(([x, y, r]) => <circle key={`${x}-${y}`} cx={x} cy={y} r={r} />)}
          </g>
        </g>
        {orb && <circle data-layer="orb" cx="72" cy="14" r="5" />}
      </svg>
      <div aria-hidden="true" className="absolute inset-0">{children}</div>
    </div>
  );
}

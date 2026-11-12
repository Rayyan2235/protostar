"use client";

import { LivingSky } from "./kiln/LivingSky";

/**
 * The Protostar world (ADR 0012): a night sky with a young star forming in its dust cloud,
 * a dark ridge, and one small figure watching. Flat SVG layers on LivingSky; tokens only.
 * Composed for a wide frame: everything sits in the lower 85% so a wide crop never cuts the star.
 */
/** The world is a night sky (Lead, 2026-11-12), so the start scene ignores the clock. Rayyan may flip it to "auto". */
export const START_SKY = "night" as const;

export function StartScene({ className = "" }: { className?: string }) {
  return (
    <LivingSky mode={START_SKY} orb={false} className={`h-[calc(var(--space-8)+var(--space-5))] rounded-(--radius-lg) ${className}`}
      label="A night sky over a dark ridge. A young star is forming inside a cloud of dust, and a small figure on the ridge watches it.">
      <svg className="absolute inset-0 size-full" viewBox="0 0 800 240" preserveAspectRatio="xMidYMax slice">
        {/* Dust cloud the star is forming in. */}
        <g data-layer="night">
          <ellipse cx="560" cy="104" rx="150" ry="36" opacity=".45" style={{ fill: "var(--sky-night-low)" }} />
          <ellipse cx="580" cy="98" rx="84" ry="22" opacity=".4"
            style={{ fill: "color-mix(in oklab, var(--sky-dusk-top), var(--sky-night-low) 55%)" }} />
        </g>
        {/* The protostar: a bright core, its disk, and two faint jets. Breathes slowly. */}
        <g data-layer="night">
          <g data-anim="breathe">
            <line x1="560" y1="66" x2="560" y2="88" strokeWidth="1.2" strokeLinecap="round" opacity=".5" style={{ stroke: "var(--on-art)" }} />
            <line x1="560" y1="112" x2="560" y2="134" strokeWidth="1.2" strokeLinecap="round" opacity=".5" style={{ stroke: "var(--on-art)" }} />
            <circle cx="560" cy="100" r="20" opacity=".22" style={{ fill: "var(--glow)" }} />
            <ellipse cx="560" cy="100" rx="28" ry="5" fill="none" strokeWidth="1.4" opacity=".85" style={{ stroke: "var(--glow)" }} />
            <circle cx="560" cy="100" r="5" style={{ fill: "var(--on-art)" }} />
          </g>
        </g>
        {/* Far ridge, then the near ridge with the watcher. */}
        <path d="M0 186 L70 166 L140 176 L230 156 L320 174 L410 160 L500 180 L620 162 L710 176 L800 164 V240 H0Z"
          style={{ fill: "color-mix(in oklab, var(--land), var(--ks-low) 35%)" }} />
        <path d="M0 218 Q120 196 250 206 T470 202 T800 210 V240 H0Z" style={{ fill: "var(--land)" }} />
        <g style={{ fill: "var(--land)" }}>
          <circle cx="214" cy="184" r="4" />
          <path d="M208 206 L211 191 Q214 187 217 191 L220 206 Z" />
        </g>
      </svg>
    </LivingSky>
  );
}

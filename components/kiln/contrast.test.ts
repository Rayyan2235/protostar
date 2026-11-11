/** WCAG contrast of Kiln's colour pairs in all three themes, read from app/tokens.css (ADR 0012). */
import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { join } from "node:path";

type Theme = Record<string, string>;

function block(css: string, selector: string): Theme {
  const start = css.indexOf(selector);
  assert.ok(start >= 0, `missing ${selector} in app/tokens.css`);
  const body = css.slice(css.indexOf("{", start) + 1, css.indexOf("}", start));
  return Object.fromEntries([...body.matchAll(/--([\w-]+)\s*:\s*([^;]+);/g)].map((m) => [m[1], m[2].trim()]));
}

/** Light is the base; dark and dusk override it on a wrapper, so unlisted tokens inherit. */
export function themes(css: string): Record<"light" | "dark" | "dusk", Theme> {
  const light = block(css, ':root, [data-theme="light"]');
  return {
    light,
    dark: { ...light, ...block(css, '[data-theme="dark"]') },
    dusk: { ...light, ...block(css, '[data-theme="dusk"]') },
  };
}

function luminance(hex: string): number {
  const h = hex.replace("#", "");
  const full = h.length === 3 ? [...h].map((c) => c + c).join("") : h;
  const [r, g, b] = [0, 2, 4].map((i) => parseInt(full.slice(i, i + 2), 16) / 255)
    .map((c) => (c <= 0.03928 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4));
  return 0.2126 * r + 0.7152 * g + 0.0722 * b;
}

export function contrast(a: string, b: string): number {
  const [hi, lo] = [luminance(a), luminance(b)].sort((x, y) => y - x);
  return (hi + 0.05) / (lo + 0.05);
}

/** [foreground, background, minimum ratio]. */
const PAIRS: [string, string, number][] = [
  ...["ink", "ink-soft", "ink-muted"].flatMap((fg) =>
    ["paper", "paper-raised", "paper-sunk"].map((bg) => [fg, bg, 4.5] as [string, string, number])),
  ["accent", "paper", 4.5],
  ["link", "paper", 4.5],
  ["ink", "accent-fill", 4.5],
  ["button-ink", "button-bg", 4.5],
  ["danger", "paper", 4.5],
  ["success", "paper", 4.5],
  ["accent", "paper", 3],          // focus ring
  ["accent", "paper-raised", 3],   // focus ring
  ["ink-muted", "paper-raised", 3], // TextField border
];

const css = readFileSync(join(process.cwd(), "app/tokens.css"), "utf8");

test("contrast math matches WCAG (black on white is 21:1)", () => {
  assert.equal(Math.round(contrast("#000000", "#ffffff")), 21);
});

for (const [name, theme] of Object.entries(themes(css))) {
  test(`${name} theme: every text, link, button and focus pair meets its minimum`, () => {
    const failing = PAIRS
      .map(([fg, bg, min]) => ({ pair: `${fg} on ${bg}`, min, ratio: Math.round(contrast(theme[fg], theme[bg]) * 100) / 100 }))
      .filter((p) => !(p.ratio >= p.min));
    assert.deepEqual(failing, []);
  });
}

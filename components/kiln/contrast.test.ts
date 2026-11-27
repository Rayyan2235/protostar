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

// K6a grain worst case (plan-kiln K6a, Planner B item 7): the grain darkens paper by at most
// opacity x ink share. Every text pair on paper must still pass on paper mixed with that much ink,
// mixed in oklab as the --grain color-mix is.
function toLinear(c: number) { return c <= 0.04045 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4; }
function fromLinear(c: number) { return c <= 0.0031308 ? c * 12.92 : 1.055 * c ** (1 / 2.4) - 0.055; }
function rgb(hex: string): number[] {
  const h = hex.replace("#", "");
  const full = h.length === 3 ? [...h].map((c) => c + c).join("") : h;
  return [0, 2, 4].map((i) => parseInt(full.slice(i, i + 2), 16) / 255);
}
function oklab([r, g, b]: number[]): number[] {
  const [lr, lg, lb] = [r, g, b].map(toLinear);
  const l = Math.cbrt(0.4122214708 * lr + 0.5363325363 * lg + 0.0514459929 * lb);
  const m = Math.cbrt(0.2119034982 * lr + 0.6806995451 * lg + 0.1073969566 * lb);
  const s = Math.cbrt(0.0883024619 * lr + 0.2817188376 * lg + 0.6299787005 * lb);
  return [
    0.2104542553 * l + 0.793617785 * m - 0.0040720468 * s,
    1.9779984951 * l - 2.428592205 * m + 0.4505937099 * s,
    0.0259040371 * l + 0.7827717662 * m - 0.808675766 * s,
  ];
}
function fromOklab([L, a, b]: number[]): number[] {
  const l = (L + 0.3963377774 * a + 0.2158037573 * b) ** 3;
  const m = (L - 0.1055613458 * a - 0.0638541728 * b) ** 3;
  const s = (L - 0.0894841775 * a - 1.291485548 * b) ** 3;
  return [
    4.0767416621 * l - 3.3077115913 * m + 0.2309699292 * s,
    -1.2684380046 * l + 2.6097574011 * m - 0.3413193965 * s,
    -0.0041960863 * l - 0.7034186147 * m + 1.707614701 * s,
  ].map((c) => Math.min(1, Math.max(0, fromLinear(c))));
}
/** `share` of `top` over `base`, in oklab, as a hex colour. */
export function mixOklab(base: string, top: string, share: number): string {
  const [p, q] = [oklab(rgb(base)), oklab(rgb(top))];
  const out = fromOklab(p.map((v, i) => v * (1 - share) + q[i] * share));
  return "#" + out.map((c) => Math.round(c * 255).toString(16).padStart(2, "0")).join("");
}

const over = css.slice(css.indexOf("Project overrides (ADR 0012 addendum 2)"));
const grainOpacity = Number(over.match(/--grain-opacity:\s*([\d.]+);/)?.[1]);
const grainShare = Number(over.match(/--grain-share:\s*([\d.]+)%;/)?.[1]) / 100;
/** The bound itself (0.04), so the test stays a true worst case even if the tokens drop below it. */
const GRAIN_WORST = 0.04;

test("grain tokens exist and stay within the 0.04 bound", () => {
  assert.ok(grainOpacity * grainShare <= GRAIN_WORST + 1e-9, `${grainOpacity} x ${grainShare}`);
});

for (const [name, theme] of Object.entries(themes(css))) {
  test(`${name} theme: every text pair on paper still passes on paper darkened by the grain (4 % ink)`, () => {
    const grained = mixOklab(theme.paper, theme.ink, GRAIN_WORST);
    const failing = PAIRS.filter(([, bg]) => bg === "paper")
      .map(([fg, , min]) => ({ pair: `${fg} on grained paper`, min, ratio: Math.round(contrast(theme[fg], grained) * 100) / 100 }))
      .filter((p) => !(p.ratio >= p.min));
    assert.deepEqual(failing, []);
  });
}

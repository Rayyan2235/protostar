/**
 * The one DOM test helper (ADR 0015 point 3). Import it FIRST in a *.dom.test.tsx file:
 * - registers happy-dom globals (window, document, …) for this test process;
 * - sets IS_REACT_ACT_ENVIRONMENT, so React's act() works without warnings;
 * - registers node:test afterEach(cleanup): Testing Library's auto-cleanup needs a global afterEach,
 *   which node:test doesn't provide, so without it earlier mounts stay in the body (Planner B D-M1);
 * - runs setTokens() before anything can call kilnTiming(), which caches at module level (Planner B L1).
 * DOM tests prove triggers and focus, never frames or layout: the browser pass keeps those.
 */
import { GlobalRegistrator } from "@happy-dom/global-registrator";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { after, afterEach } from "node:test";

if (!("document" in globalThis)) GlobalRegistrator.register({ url: "http://localhost:3002/" });
(globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;

/** The motion and space tokens from app/tokens.css, as a <style> on <head>, so kilnTiming() and space() read real values. */
export function setTokens() {
  if (document.getElementById("kiln-tokens")) return;
  const css = readFileSync(join(__dirname, "..", "..", "app", "tokens.css"), "utf8");
  const vars = [...css.matchAll(/(--(?:dur|ease|space)-[\w-]+)\s*:\s*([^;]+);/g)].map(([, k, v]) => `${k}: ${v.trim()};`);
  const style = document.createElement("style");
  style.id = "kiln-tokens";
  style.textContent = `:root { ${[...new Set(vars)].join(" ")} }`;
  document.head.appendChild(style);
}
setTokens();

/** The visible Motion switch's state, as data-motion on <html> (what motionOk() reads first). */
export function setMotion(state: "on" | "off") {
  document.documentElement.dataset.motion = state;
}

// Testing Library loads after the globals exist (a static import would be hoisted above the
// registration, and its `screen` binds to document.body at load).
// eslint-disable-next-line @typescript-eslint/no-require-imports
const rtl = require("@testing-library/react") as typeof import("@testing-library/react");
afterEach(() => {
  rtl.cleanup();
  delete document.documentElement.dataset.motion;
});

// happy-dom keeps timers and the window alive; close it so the test process can exit.
after(async () => {
  rtl.cleanup();
  await GlobalRegistrator.unregister();
});

export const { render, screen, act, fireEvent, waitFor, cleanup } = rtl;

/** Waits n animation frames (afterPaint needs two). */
export async function frames(n = 2) {
  for (let i = 0; i < n; i++) await act(() => new Promise<void>((r) => requestAnimationFrame(() => r())));
}

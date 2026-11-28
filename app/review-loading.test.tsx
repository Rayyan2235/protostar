/** GAP from TESTER-FE (088e1ce perf pass): /review had CLS 0.1077 on every load when the Suspense fallback (a bare line, no top bar) swapped to the page. The loading state now has the page's own box. */
import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { renderToStaticMarkup } from "react-dom/server";
import { ReviewerLoading } from "./review/[id]/reviewer";

const MAIN = '<main class="mx-auto flex w-full max-w-6xl flex-1 flex-col gap-(--space-5) px-(--space-3) py-(--space-5) sm:px-(--space-6)">';

test("the loading state is the page's shell: the same top bar and main box, then the loading line", () => {
  const html = renderToStaticMarkup(<ReviewerLoading />);
  assert.match(html, /<header/);
  assert.ok(html.includes(MAIN), "same main box as the loaded page");
  assert.match(html, /Loading the blueprint…/);
});

// TESTER-FE 2587147: the CLS left was the scrollbar arriving with the content (centred boxes moved half
// its width). The gutter is always reserved, so nothing moves sideways when a page outgrows the viewport.
test("html reserves the scrollbar gutter, so a page growing past the viewport doesn't shift sideways", () => {
  const css = readFileSync(join(__dirname, "globals.css"), "utf8");
  assert.match(css, /html\s*\{[^}]*scrollbar-gutter:\s*stable/);
});

test("the route's Suspense fallback is that same loading state, not a bare line", () => {
  const page = readFileSync(join(__dirname, "review", "[id]", "page.tsx"), "utf8");
  assert.match(page, /fallback=\{<ReviewerLoading \/>\}/);
});

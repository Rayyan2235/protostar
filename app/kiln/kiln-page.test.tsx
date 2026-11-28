/** /kiln is a server page: it may not hand functions to client components (Next: "Functions cannot be passed directly to Client Components"). Found when :3002 moved to fe/2b-wire for T-2b. */
import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { join } from "node:path";

test("/kiln passes no inline functions as props (format, onClick…); interactive samples live in client previews", () => {
  const page = readFileSync(join(__dirname, "page.tsx"), "utf8");
  assert.doesNotMatch(page, /\w+=\{\s*\([^)]*\)\s*=>/, "an inline arrow function prop on the server page");
});

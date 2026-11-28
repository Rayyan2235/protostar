/** FE-6 test 0: the helper cleans up between tests (the second test sees an empty body), and tokens are readable. */
import { render, screen } from "./dom";
import { test } from "node:test";
import assert from "node:assert/strict";
import { kilnTiming, space } from "@/components/motion/kiln";

test("first test mounts a part", () => {
  render(<p>mounted</p>);
  assert.equal(screen.getByText("mounted").tagName, "P");
});

test("second test sees an empty body (afterEach cleanup ran)", () => {
  assert.equal(document.body.innerHTML, "");
});

test("tokens are set before kilnTiming(): real durations and spaces, not the 0 s fallback", () => {
  const t = kilnTiming();
  assert.ok(t.quick > 0 && t.enter > t.quick, JSON.stringify(t));
  assert.ok(space("--space-2") > 0);
});

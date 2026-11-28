/**
 * FE-6 test 3 (K7, TESTER-FE FAIL 866dcfd): switching motion off mid-effect finishes every running
 * tween at once (tracked ones and any the registry never saw), and data-motion already reads "off"
 * when they finish, so nothing can re-arm. Red on kiln.ts + MotionSwitch.tsx at 866dcfd.
 */
import { act, render, screen, setMotion } from "./test/dom";
import { test } from "node:test";
import assert from "node:assert/strict";
import { gsap, track } from "@/components/motion/kiln";
import { MotionSwitch } from "./MotionSwitch";

test("Motion off mid-effect: every tween (tracked and untracked) jumps to its end, after data-motion is off", async () => {
  localStorage.setItem("protostar-motion", "on");
  setMotion("on");
  render(<MotionSwitch />);
  const seen: string[] = [];
  const done = () => { seen.push(document.documentElement.dataset.motion ?? "unset"); };
  const tracked = { x: 0 };
  const untracked = { x: 0 }; // e.g. a StrictMode duplicate the registry never saw
  track(gsap.to(tracked, { x: 1, duration: 10, onComplete: done }));
  gsap.to(untracked, { x: 1, duration: 10, onComplete: done });

  const button = screen.getByRole("button", { name: /Motion/ });
  assert.equal(button.getAttribute("aria-pressed"), "true");
  await act(async () => { button.click(); });

  assert.equal(tracked.x, 1, "tracked tween finished");
  assert.equal(untracked.x, 1, "untracked tween finished");
  assert.deepEqual(seen, ["off", "off"], "data-motion was already off when they finished");
  localStorage.removeItem("protostar-motion");
});

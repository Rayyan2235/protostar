# FlowRail

New part, built from Kiln tokens. It shows the five requester steps as figure-numbered mono steps: 01 Interview, 02 Scope, 03 Tests, 04 Blueprint, 05 Review.

Why: the requester always knows where they are and what comes next, without a chat transcript or a progress bar.

Behaviour inspired by React Bits Stepper; our own code (no copied source; React Bits is MIT + Commons Clause).

**The consumer provides:**
- `variant`: `top` on every working screen, `margin` only on the start screen;
- `step` (top only): the session's `Step`.

* It is display only, never navigation.
* `top` marks the active step two ways: semibold ink, and an `accent` rule that glides between steps over `dur-quick`. The rule doesn't move under reduced motion.
* `aria-current="step"` sits on the active item. `idea` has no active step, and `done` marks every step complete.
* It has no live region. The focus move to the new question or heading already announces the change.
* `margin` is a quiet list with no active step.

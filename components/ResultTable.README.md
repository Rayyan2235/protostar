# ResultTable

New part, built from Kiln tokens: the K6 ResultRow table. It shows the tests against the two models on the tests screen.

Why: every test's verdict per model has to read the same way in words, and opening a row explains a failure in place.

**The consumer provides:**
- `caption`: the section's accessible name.
- `columns`: one per model. Each has a `role`, a `name` ("Cheap" / "Capable"), a `source` (model or "offline-script"), `passed`, `total`, and a column `state` (pass / fail / model-unavailable).
- `rows`: one per test. Each has an `id` (shown as "T-01"), a `prompt`, one `mark` per column, and optional `actions`.
  - A mark is `{ role, state, reason?, note? }`; `note` is an accepted note.
- `runId`.
- Optional: `arrived` (the run id that just came back in this tab) and `running`.

* **Header:** for each model, the name, the source, "{passed}/{total} passed" in rolling `Figure`s (they roll only when the numbers change), and a column `StatusMark`. The header rule is `ink`.
* **Rows:** one hairline `<details>` per test.
  * The summary has "T-01", the prompt, and a `StatusMark` per model with its name.
  * Inside are each model's reason and accepted note, then the actions.
  * Verdicts are words; colour only echoes them. Never put a reason in a tooltip.
* **Running:** only the two column marks turn. Row marks keep their last state until the run lands.
* **Arrival:** when `arrived === runId` and that id hasn't been animated, the rows rise by `--space-2` with opacity, staggered by `staggerFor(rows, t)`. That function is pure: at most `quick / 4` per row, the whole table within `--dur-enter`, never negative. Each row's marks draw at the row's offset.
  * It plays once per run id (module-level), so remounting or switching tabs never replays it.
  * A reload, a poll or a rewrite never staggers.
* **Opening a row** uses `toggleByHeight` (components/motion/height.ts), the answer list's technique.
* **Motion off:** every row with its final marks, still.

Credit: our own code on GSAP. The row-table structure comes from plan-kiln K6.

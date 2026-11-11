/**
 * Per-step timings for one session, read from the decision log. Used in user tests.
 * Run: npm run report -- <session-id>     (prints a Markdown table to paste into results)
 *
 * Times come from server timestamps on each log entry. In offline mode there's no model
 * latency, so the gaps are the person's own reading, thinking and typing time.
 * The session is created when the idea is submitted, so time on the empty idea box
 * isn't in the log: the facilitator times that with a stopwatch.
 */
import { getSession } from "../lib/store";
import type { Decision } from "../lib/types";

const id = process.argv[2];
if (!id) {
  console.error("Usage: npm run report -- <session-id>   (the ?s= value in the URL)");
  process.exit(1);
}
const s = getSession(id);
if (!s) {
  console.error(`No session ${id} in ${process.env.DATABASE_PATH || "./data/protostar.db"}`);
  process.exit(1);
}

const log = s.log;
const t = (d: Decision) => Date.parse(d.at);
const secs = (ms: number) => `${Math.round(ms / 1000)} s`;
const first = (kind: Decision["kind"], from = 0) => log.findIndex((d, i) => i >= from && d.kind === kind);

/** [started at, step, time taken, what they did]; printed in time order. */
const rows: [number, string, string, string][] = [];

const idea = first("idea");
if (idea >= 0) rows.push([t(log[idea]), "Idea submitted", "stopwatch", `"${log[idea].what}"`]);

// Each question shown → the person's answer.
log.forEach((d, i) => {
  if (d.kind !== "question") return;
  const ans = first("answer", i + 1);
  if (ans >= 0) rows.push([t(d), `Q: ${d.what}`, secs(t(log[ans]) - t(d)), log[ans].what]);
});

// Data block: red card shown → safe option chosen.
const flag = first("flag");
if (flag >= 0) {
  const resolve = first("resolve", flag);
  const keeps = log.slice(flag, resolve < 0 ? undefined : resolve).filter((d) => d.kind === "blocked").length;
  rows.push([
    t(log[flag]),
    "Data block (red card)",
    resolve >= 0 ? secs(t(log[resolve]) - t(log[flag])) : "not resolved",
    `${resolve >= 0 ? log[resolve].what : "—"} · "Keep it anyway" clicks: ${keeps}`,
  ]);
}

// Scope screen: interview done → scope chosen.
const done = first("done");
const scope = first("scope");
if (done >= 0 && scope >= 0) rows.push([t(log[done]), "Scope + cost screen", secs(t(log[scope]) - t(log[done])), log[scope].what]);

const edits = log.filter((d) => d.kind === "edit");
const prefilled = new Set(log.filter((d) => d.kind === "prefill").map((d) => d.what.match(/^Prefilled (\w+)/)?.[1]));
const prefillEdits = edits.filter((d) => prefilled.has(d.what.match(/^Edited (\w+)/)?.[1])).length;
const start = Math.max(idea, 0);
const end = scope >= 0 ? scope : log.length - 1;

console.log(`### Session ${s.id}\n`);
console.log(`- Step reached: **${s.step}** · answers: ${s.asked} · edits: ${edits.length} (of prefilled fields: ${prefillEdits}/${prefilled.size})`);
console.log(`- **Idea submitted → ${scope >= 0 ? "scope chosen" : "last action"}: ${secs(t(log[end]) - t(log[start]))}** (plus the stopwatch time on the empty idea box)\n`);
console.log("| Step | Time | What they did |\n|---|---|---|");
for (const [, step, time, what] of rows.sort((a, b) => a[0] - b[0])) {
  console.log(`| ${step} | ${time} | ${what.replace(/\|/g, "/").slice(0, 140)} |`);
}

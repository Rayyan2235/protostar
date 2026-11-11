"use client";

import { useState } from "react";
import type { Catalog } from "@/lib/engine";
import type { Session } from "@/lib/types";
import {
  PRICE_SOURCE, PRICES_AS_OF, SCOPES, cleanKnobs, estimate, formatDollars, recommendedScope, scopeByKey,
  type Knobs, type ModelRole, type ScopeKey,
} from "@/lib/scoper";

const RISK_STYLE = { Low: "bg-emerald-100 text-emerald-900", Medium: "bg-amber-100 text-amber-900", High: "bg-red-100 text-red-900" };

function cost(catalog: Catalog, role: ModelRole, scope: ScopeKey, knobs: Knobs): string {
  const price = catalog[role].price;
  return price ? formatDollars(estimate(scope, price, knobs).monthlyDollars) : "no list price";
}

export function ScopePicker({ session, catalog, busy, onChoose }: {
  session: Session; catalog: Catalog; busy: boolean;
  onChoose: (scope: ScopeKey, role: ModelRole, knobs: Knobs) => void;
}) {
  const rec = recommendedScope(session.pushback?.choice);
  const [scope, setScope] = useState<ScopeKey>(rec.scope);
  const [role, setRole] = useState<ModelRole>(scopeByKey(rec.scope).model);
  const [raw, setRaw] = useState({ students: String(session.knobs.studentsPerMonth), convs: String(session.knobs.convsPerStudent) });
  const knobs = cleanKnobs({ studentsPerMonth: Number(raw.students), convsPerStudent: Number(raw.convs) });
  const sc = scopeByKey(scope);

  const pick = (k: ScopeKey) => {
    setScope(k);
    setRole(scopeByKey(k).model);
  };

  return (
    <div className="flex flex-col gap-4">
      <div>
        <h2 className="font-semibold text-zinc-900">How wide should the agent be?</h2>
        <p className="text-sm text-zinc-600">Narrower is cheaper and easier to test. You can widen it once the tests pass.</p>
      </div>

      <div role="radiogroup" aria-label="Scope" className="grid gap-2 md:grid-cols-3">
        {SCOPES.map((s) => {
          const selected = s.key === scope;
          return (
            <button key={s.key} role="radio" aria-checked={selected} aria-label={`${s.label}, ${s.risk} risk`} disabled={busy} onClick={() => pick(s.key)}
              className={`flex flex-col gap-1 rounded-lg border p-3 text-left transition-colors ${selected ? "border-indigo-500 bg-indigo-50/60 ring-2 ring-indigo-100" : "border-zinc-300 bg-white hover:border-zinc-400"}`}>
              <span className="flex flex-wrap items-center gap-1.5">
                <span className="font-medium text-zinc-900">{s.label}</span>
                <span className={`rounded px-1.5 py-0.5 text-xs font-medium ${RISK_STYLE[s.risk]}`}>{s.risk} risk</span>
                {s.key === rec.scope && <span className="rounded bg-indigo-600 px-1.5 py-0.5 text-xs font-medium text-white">Recommended</span>}
              </span>
              <span className="text-sm text-zinc-600">{s.desc}</span>
              <span className="mt-auto pt-1 text-sm font-medium text-zinc-900">
                ≈ {cost(catalog, s.model, s.key, knobs)}<span className="font-normal text-zinc-500">/month on {catalog[s.model].price?.name ?? catalog[s.model].model}</span>
              </span>
            </button>
          );
        })}
      </div>
      {scope === rec.scope && <p className="-mt-2 text-xs text-zinc-500">Why recommended: {rec.why}</p>}

      <fieldset className="flex flex-col gap-2">
        <legend className="mb-1 text-sm font-medium text-zinc-900">Model for “{sc.label}”</legend>
        <div className="grid gap-2 sm:grid-cols-2">
          {(["cheap", "capable"] as const).map((r) => (
            <label key={r} className={`flex cursor-pointer items-center justify-between gap-2 rounded-lg border p-2.5 text-sm ${role === r ? "border-indigo-500 bg-indigo-50/60" : "border-zinc-300 bg-white"}`}>
              <span className="flex items-center gap-2">
                <input type="radio" name="model" value={r} aria-label={catalog[r].price?.name ?? catalog[r].model}
                  checked={role === r} onChange={() => setRole(r)} className="accent-indigo-600" />
                <span>
                  <span className="block font-medium text-zinc-900">{catalog[r].price?.name ?? catalog[r].model}</span>
                  <span className="block text-xs text-zinc-500">{r === "cheap" ? "Faster, cheaper" : "Stronger reasoning"}</span>
                </span>
              </span>
              <span className="font-medium text-zinc-900">{cost(catalog, r, scope, knobs)}<span className="text-xs font-normal text-zinc-500">/mo</span></span>
            </label>
          ))}
        </div>
        <p className="text-xs text-zinc-500">The test run (next step) shows how each model actually does on your questions, so you can see whether the cheaper one is good enough.</p>
      </fieldset>

      <div className="grid gap-3 sm:grid-cols-2">
        <label className="flex flex-col gap-1 text-sm">
          <span className="font-medium text-zinc-900">Students per month</span>
          <input type="number" inputMode="numeric" min={1} max={1000000} value={raw.students}
            onChange={(e) => setRaw({ ...raw, students: e.target.value })}
            className="rounded-lg border border-zinc-300 p-2 text-zinc-900 outline-none focus:border-indigo-500 focus:ring-2 focus:ring-indigo-100" />
        </label>
        <label className="flex flex-col gap-1 text-sm">
          <span className="font-medium text-zinc-900">Conversations per student</span>
          <input type="number" inputMode="decimal" min={0.1} max={100} step={0.5} value={raw.convs}
            onChange={(e) => setRaw({ ...raw, convs: e.target.value })}
            className="rounded-lg border border-zinc-300 p-2 text-zinc-900 outline-none focus:border-indigo-500 focus:ring-2 focus:ring-indigo-100" />
        </label>
      </div>

      <div className="flex flex-wrap items-center justify-between gap-3 rounded-lg bg-zinc-50 p-3">
        <div className="text-sm">
          <span className="text-zinc-600">Estimated monthly cost: </span>
          <span className="text-lg font-semibold text-zinc-900">{cost(catalog, role, scope, knobs)}</span>
          <span className="block text-xs text-zinc-500">
            Estimate from {PRICE_SOURCE}, {PRICES_AS_OF}. Assumes ~{sc.inTok.toLocaleString("en-US")} input and ~{sc.outTok.toLocaleString("en-US")} output tokens per conversation.
          </span>
        </div>
        <button disabled={busy} onClick={() => onChoose(scope, role, knobs)} className="rounded-lg bg-indigo-600 px-4 py-2 font-medium text-white disabled:opacity-40">
          {busy ? "Saving…" : "Use this scope"}
        </button>
      </div>
    </div>
  );
}

export function ScopeSummary({ session }: { session: Session }) {
  const sc = scopeByKey(session.scope!);
  const e = session.estimate;
  return (
    <div className="rounded-xl border border-zinc-200 bg-white p-4">
      <h2 className="mb-3 text-sm font-semibold uppercase tracking-wide text-zinc-500">Scope &amp; cost</h2>
      <p className="text-sm font-medium text-zinc-900">{sc.label} <span className={`ml-1 rounded px-1.5 py-0.5 text-xs font-medium ${RISK_STYLE[sc.risk]}`}>{sc.risk} risk</span></p>
      <p className="mt-1 text-sm text-zinc-600">Model: {e?.model ?? session.model?.name}</p>
      {e ? (
        <p className="mt-1 text-sm text-zinc-900">
          ≈ <span className="font-semibold">{formatDollars(e.monthlyDollars)}</span>/month
          <span className="block text-xs text-zinc-500">
            {session.knobs.studentsPerMonth.toLocaleString("en-US")} students × {session.knobs.convsPerStudent} conversations · {e.tokensPerStudent.toLocaleString("en-US")} tokens per student · list prices {e.pricesAsOf}
          </span>
        </p>
      ) : (
        <p className="mt-1 text-sm text-zinc-500">No list price on file for this model, so no estimate.</p>
      )}
    </div>
  );
}

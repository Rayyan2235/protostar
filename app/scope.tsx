"use client";

import { useState } from "react";
import type { Catalog } from "@/lib/engine";
import type { Session } from "@/lib/types";
import {
  PRICE_SOURCE, PRICES_AS_OF, SCOPES, cleanKnobs, estimate, formatDollars, recommendedScope, scopeByKey,
  type Knobs, type ModelRole, type ScopeKey,
} from "@/lib/scoper";
import { Button } from "@/components/kiln/Button";
import { SpecSheet } from "@/components/kiln/SpecSheet";
import { Tag } from "@/components/kiln/Tag";
import { ChoiceList } from "@/components/ChoiceList";
import { TextField } from "@/components/TextField";

function cost(catalog: Catalog, role: ModelRole, scope: ScopeKey, knobs: Knobs): string {
  const price = catalog[role].price;
  return price ? formatDollars(estimate(scope, price, knobs).monthlyDollars) : "no list price";
}

const modelName = (catalog: Catalog, r: ModelRole) => catalog[r].price?.name ?? catalog[r].model;

/** Scope step: options as ChoiceList rows (not identical cards), then the knobs, then the cost as a small SpecSheet. */
export function ScopePicker({ session, catalog, busy, onChoose }: {
  session: Session; catalog: Catalog; busy: boolean;
  onChoose: (scope: ScopeKey, role: ModelRole, knobs: Knobs) => void;
}) {
  const rec = recommendedScope(session.pushback?.choice);
  // A reopened scope starts from what the requester chose before, not the recommendation.
  const [scope, setScope] = useState<ScopeKey>(session.scope ?? rec.scope);
  const [role, setRole] = useState<ModelRole>(session.model?.role ?? scopeByKey(session.scope ?? rec.scope).model);
  const [raw, setRaw] = useState({ students: String(session.knobs.studentsPerMonth), convs: String(session.knobs.convsPerStudent) });
  const knobs = cleanKnobs({ studentsPerMonth: Number(raw.students), convsPerStudent: Number(raw.convs) });
  const sc = scopeByKey(scope);

  const pick = (k: ScopeKey) => {
    setScope(k);
    setRole(scopeByKey(k).model);
  };

  return (
    <div id="scope-picker" className="flex flex-col gap-(--space-4)">
      <div className="flex flex-col gap-(--space-1)">
        <h2 className="title text-ink">How wide should the agent be?</h2>
        <p className="body text-ink-soft">Narrower is cheaper and easier to test. You can widen it once the tests pass.</p>
      </div>

      <div className="flex flex-col gap-(--space-2)">
        <ChoiceList label="Scope" value={scope} onChange={pick} disabled={busy}
          options={SCOPES.map((s) => ({
            value: s.key,
            title: s.label,
            detail: s.desc,
            marks: <>
              <Tag>{s.risk} risk</Tag>
              {s.key === rec.scope && <Tag selected>Recommended</Tag>}
            </>,
            meta: <>≈ {cost(catalog, s.model, s.key, knobs)}<span className="block font-normal text-ink-muted">/month on {modelName(catalog, s.model)}</span></>,
          }))} />
        {scope === rec.scope && <p className="small font-normal text-ink-muted">Why recommended: {rec.why}</p>}
      </div>

      <div className="flex flex-col gap-(--space-2)">
        <p className="small text-ink">Model for “{sc.label}”</p>
        <ChoiceList label={`Model for “${sc.label}”`} value={role} onChange={setRole} disabled={busy}
          options={(["cheap", "capable"] as const).map((r) => ({
            value: r,
            title: modelName(catalog, r),
            detail: r === "cheap" ? "Faster, cheaper" : "Stronger reasoning",
            meta: <>{cost(catalog, r, scope, knobs)}<span className="font-normal text-ink-muted">/mo</span></>,
          }))} />
        <p className="small font-normal text-ink-muted">The test run (next step) shows how each model actually does on your questions, so you can see whether the cheaper one is good enough.</p>
      </div>

      <div className="grid gap-(--space-3) sm:grid-cols-2">
        <TextField id="students" label="Students per month" type="number" inputMode="numeric" min={1} max={1000000}
          value={raw.students} onChange={(v) => setRaw({ ...raw, students: v })} />
        <TextField id="convs" label="Conversations per student" type="number" inputMode="decimal" min={0.1} max={100} step={0.5}
          value={raw.convs} onChange={(v) => setRaw({ ...raw, convs: v })} />
      </div>

      <SpecSheet number="Est." title="Monthly cost" revision={`prices ${PRICES_AS_OF}`} headingLevel={3}
        rows={[
          { label: "Scope", value: sc.label },
          { label: "Model", value: modelName(catalog, role) },
          { label: "Conversations", value: `${knobs.studentsPerMonth.toLocaleString("en-US")} students × ${knobs.convsPerStudent} each` },
          {
            label: "Est. cost / month",
            value: (
              <span className="flex flex-col gap-(--space-1) sm:items-end">
                <span className="title">{cost(catalog, role, scope, knobs)}</span>
                <span className="text-ink-muted">
                  Estimate from {PRICE_SOURCE}, {PRICES_AS_OF}. Assumes ~{sc.inTok.toLocaleString("en-US")} input and ~{sc.outTok.toLocaleString("en-US")} output tokens per conversation.
                </span>
              </span>
            ),
          },
        ]} />

      <div>
        <Button disabled={busy} onClick={() => onChoose(scope, role, knobs)}>{busy ? "Saving…" : "Use this scope"}</Button>
      </div>
    </div>
  );
}

/** The chosen scope in the side panel: label, risk, model and the estimate with its source date. */
export function ScopeSummary({ session }: { session: Session }) {
  const sc = scopeByKey(session.scope!);
  const e = session.estimate;
  return (
    <section className="flex flex-col gap-(--space-2) border-t border-hairline pt-(--space-3)">
      <h2 className="label uppercase text-ink-muted">Scope &amp; cost</h2>
      <p className="flex flex-wrap items-center gap-(--space-2)">
        <span className="small text-ink">{sc.label}</span>
        <Tag>{sc.risk} risk</Tag>
      </p>
      <p className="small font-normal text-ink-soft">Model: {e?.model ?? session.model?.name}</p>
      {e ? (
        <p className="small font-normal text-ink">
          ≈ <span className="font-semibold">{formatDollars(e.monthlyDollars)}</span>/month
          <span className="label mt-(--space-1) block text-ink-muted">
            {session.knobs.studentsPerMonth.toLocaleString("en-US")} students × {session.knobs.convsPerStudent} conversations · {e.tokensPerStudent.toLocaleString("en-US")} tokens per student · estimate from list prices {e.pricesAsOf}
          </span>
        </p>
      ) : (
        <p className="small font-normal text-ink-muted">No list price on file for this model, so no estimate.</p>
      )}
    </section>
  );
}

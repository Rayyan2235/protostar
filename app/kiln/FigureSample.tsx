"use client";

import { Figure } from "@/components/Figure";

/** The /kiln Figure sample. Client-side, because `format` is a function and the page is a server component. */
export function FigureSample() {
  return (
    <p className="title text-ink">≈ <Figure value={112} format={(n) => `$${Math.round(n)}`} /> <span className="small font-normal text-ink-muted">[ESTIMATE NOTE]</span></p>
  );
}

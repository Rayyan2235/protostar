// Behaviour adapted from Cult UI Copy Button. Cult UI © Jordan Gilliam, MIT licence.
// Rebuilt without motion/shadcn on Kiln tokens: CSS transitions, the label never changes.
"use client";

import { useEffect, useRef, useState } from "react";
import { Button } from "@/components/kiln/Button";
import { Notice } from "@/components/Notice";
import { useStatus, type Say } from "@/components/StatusStrip";

export type CopyState = "idle" | "copied" | "failed";
/** How long the check shows before the glyph turns back into the copy mark. */
export const CHECK_MS = 2000;

/** Writes to the clipboard; on success says `message` once. A rejection or a missing API is "failed". */
export async function runCopy(
  clipboard: Pick<Clipboard, "writeText"> | undefined, text: string, message: string, say: Say,
): Promise<Exclude<CopyState, "idle">> {
  try {
    if (!clipboard) throw new Error("no clipboard");
    await clipboard.writeText(text);
  } catch {
    return "failed";
  }
  say(message);
  return "copied";
}

/** Copy mark and check stacked in one box; the active one is shown. aria-hidden, currentColor. */
function Glyph({ copied }: { copied: boolean }) {
  const layer = "absolute inset-0 transition-[opacity,transform] duration-(--dur-quick) ease-out motion-reduce:transition-none";
  return (
    <span aria-hidden="true" className="relative inline-block size-(--space-3) shrink-0">
      <svg aria-hidden="true" data-glyph="copy" viewBox="0 0 16 16" className={`${layer} ${copied ? "scale-50 opacity-0" : "scale-100 opacity-100"}`}>
        <rect x="5.5" y="5.5" width="8" height="8" rx="1" fill="none" stroke="currentColor" strokeWidth="1.4" />
        <path d="M10.5 3.5v-1h-8v8h1" fill="none" stroke="currentColor" strokeWidth="1.4" />
      </svg>
      {copied && (
        <svg aria-hidden="true" data-glyph="check" viewBox="0 0 16 16" className={`${layer} scale-100 opacity-100 starting:scale-50 starting:opacity-0`}>
          <path d="M3 8.5l3 3 7-7" fill="none" stroke="currentColor" strokeWidth="1.6" />
        </svg>
      )}
    </span>
  );
}

/** The button as a function of its state. Its visible label and accessible name never change. */
export function CopyButtonView({ id, label, state, failText, onCopy, describedBy }: {
  id?: string; label: string; state: CopyState; failText: string; onCopy: () => void; describedBy?: string;
}) {
  return (
    <>
      <Button id={id} kind="outline" onClick={onCopy} aria-describedby={describedBy}>
        <span className="inline-flex items-center gap-(--space-2)">
          <Glyph copied={state === "copied"} />
          {label}
        </span>
      </Button>
      {state === "failed" && <Notice tone="danger">{failText}</Notice>}
    </>
  );
}

/**
 * A copy button whose glyph morphs to a check for 2 s. The StatusStrip announces the result;
 * a failed copy shows an alert in place and no check.
 */
export function CopyButton({ id, label, text, message, failText, describedBy }: {
  id?: string; label: string; text: () => string; message: string; failText: string; describedBy?: string;
}) {
  const { say } = useStatus();
  const [state, setState] = useState<CopyState>("idle");
  const timer = useRef<ReturnType<typeof setTimeout> | undefined>(undefined);
  useEffect(() => () => clearTimeout(timer.current), []);
  const onCopy = async () => {
    clearTimeout(timer.current);
    const r = await runCopy(navigator.clipboard, text(), message, say);
    setState(r);
    if (r === "copied") timer.current = setTimeout(() => setState("idle"), CHECK_MS);
  };
  return <CopyButtonView id={id} label={label} state={state} failText={failText} onCopy={onCopy} describedBy={describedBy} />;
}

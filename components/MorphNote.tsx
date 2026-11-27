// Behaviour adapted from Cult UI Morph Surface. Cult UI © Jordan Gilliam, MIT licence.
// Rebuilt without motion/shadcn on Kiln tokens: the View Transitions API, instant without it.
"use client";

import { flushSync } from "react-dom";
import type { KeyboardEvent, ReactNode } from "react";
import { Button } from "@/components/kiln/Button";
import { KeyHint } from "@/components/Kbd";
import { TextField } from "@/components/TextField";

export type NoteKeyResult = "close" | "submit" | "block" | "pass";

/**
 * What a key does in a MorphNote field. Esc closes (not while an IME composes). Plain Enter is a
 * new line. Ctrl/⌘+Enter submits only when the panel opts in with `submitKey` (never on a terminal
 * decision), and is blocked while empty or busy. Pure, so it's tested as a table.
 */
export function noteKey(
  e: { key: string; ctrlKey: boolean; metaKey: boolean; isComposing: boolean },
  s: { submitKey: boolean; empty: boolean; busy: boolean },
): NoteKeyResult {
  if (e.isComposing) return "pass";
  if (e.key === "Escape") return "close";
  if (e.key !== "Enter" || !(e.ctrlKey || e.metaKey) || !s.submitKey) return "pass";
  return s.empty || s.busy ? "block" : "submit";
}

export interface MorphEnv {
  reduced: boolean;
  start?: (update: () => void) => { updateCallbackDone: Promise<unknown> };
}

/** The browser's View Transitions API and motion preference, read at call time (never in render). */
function browserEnv(): MorphEnv {
  const reduced = window.matchMedia("(prefers-reduced-motion: reduce)").matches;
  const doc = document as Document & { startViewTransition?: (cb: () => void) => { updateCallbackDone: Promise<unknown> } };
  return { reduced, start: doc.startViewTransition ? (cb) => doc.startViewTransition!(cb) : undefined };
}

/**
 * Runs a state change as one morph. The update is flushed synchronously inside the transition, so
 * the promise resolves once the new DOM exists (move focus then). No API or reduced motion: instant.
 */
export function runMorph(update: () => void, env: MorphEnv = browserEnv()): Promise<void> {
  const commit = () => { flushSync(update); };
  if (env.reduced || !env.start) {
    commit();
    return Promise.resolve();
  }
  return env.start(commit).updateCallbackDone.then(() => undefined, () => undefined);
}

/**
 * One object that changes shape: a trigger button morphs into a panel (a field plus one submit)
 * and back. Trigger and panel share one view-transition-name and never coexist. Controlled: the
 * parent owns `open` and the text, so typed text survives a close until it's sent.
 * Focus: opening moves to the field (`id`); closing returns to the trigger (`triggerId`).
 */
export function MorphNote({
  id, triggerId = `${id}-btn`, name, open, onOpenChange, trigger, triggerKind = "outline", triggerDanger, triggerClassName, disabled,
  prompt, hidePrompt, value, onChange, error, rows = 3, maxLength,
  submitLabel, submitKind = "primary", submitDanger, submitKey = false, required = false, busy, onSubmit,
}: {
  /** The field's id. */
  id: string;
  /** Defaults to `${id}-btn`. Set it when several notes share one field id (only one is open). */
  triggerId?: string;
  /** Unique on the page, e.g. morph-edit-<slotKey>, morph-decision-<status>. */
  name: string;
  open: boolean;
  onOpenChange: (open: boolean) => void;
  trigger: ReactNode;
  triggerKind?: "primary" | "outline" | "link";
  triggerDanger?: boolean;
  triggerClassName?: string;
  disabled?: boolean;
  prompt: string;
  /** Keep the prompt for screen readers only, when the context already shows it (the spec row). */
  hidePrompt?: boolean;
  value: string;
  onChange: (v: string) => void;
  error?: string;
  rows?: number;
  maxLength?: number;
  submitLabel: ReactNode;
  submitKind?: "primary" | "outline";
  submitDanger?: boolean;
  /** Ctrl/⌘+Enter submits. Only for non-terminal panels (spec Edit, Request changes). */
  submitKey?: boolean;
  /** For the Ctrl/⌘+Enter guard only; the submit handler still validates and says why. */
  required?: boolean;
  busy: boolean;
  onSubmit: () => void;
}) {
  const show = () => runMorph(() => onOpenChange(true)).then(() => document.getElementById(id)?.focus());
  const hide = () => runMorph(() => onOpenChange(false)).then(() => document.getElementById(triggerId)?.focus());
  const style = { viewTransitionName: name };

  if (!open) {
    return (
      <Button id={triggerId} kind={triggerKind} danger={triggerDanger} disabled={disabled} className={triggerClassName}
        style={style} onClick={show}>
        {trigger}
      </Button>
    );
  }

  const onKeyDown = (e: KeyboardEvent<HTMLElement>) => {
    // keyCode 229: Safari reports IME composition this way.
    const r = noteKey({ key: e.key, ctrlKey: e.ctrlKey, metaKey: e.metaKey, isComposing: e.nativeEvent.isComposing || e.keyCode === 229 },
      { submitKey, empty: required && !value.trim(), busy });
    if (r === "pass") return;
    e.preventDefault();
    if (r === "close") hide();
    if (r === "submit") onSubmit();
  };

  return (
    <form style={style} className="flex w-full flex-col gap-(--space-2)" onSubmit={(e) => { e.preventDefault(); onSubmit(); }}>
      <TextField id={id} label={prompt} hideLabel={hidePrompt} multiline autosize rows={rows} maxLength={maxLength}
        value={value} onChange={onChange} error={error} onKeyDown={onKeyDown}
        onFocus={(e) => { const end = e.currentTarget.value.length; e.currentTarget.setSelectionRange(end, end); }} />
      <div className="flex flex-wrap items-center gap-(--space-3)">
        <Button type="submit" kind={submitKind} danger={submitDanger} disabled={busy}>{submitLabel}</Button>
        <Button kind="link" onClick={hide}>Cancel</Button>
        {submitKey && <KeyHint items={[["Ctrl/⌘ + Enter", "to send"]]} />}
      </div>
    </form>
  );
}

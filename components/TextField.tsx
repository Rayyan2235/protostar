"use client";

import { useLayoutEffect, type ChangeEvent, type FocusEvent, type KeyboardEvent, type Ref } from "react";

type FieldEl = HTMLInputElement & HTMLTextAreaElement;

/**
 * Height for an autosizing textarea: its content height, up to maxRows lines; past that it
 * scrolls. `scrollHeight` includes padding but not the border (border-box sizing).
 */
export function fitHeight(scrollHeight: number, box: { lineHeight: number; padding: number; border: number }, maxRows: number) {
  const max = box.lineHeight * maxRows + box.padding + box.border;
  const h = scrollHeight + box.border;
  return { height: Math.min(h, max), scroll: h > max };
}

function resize(el: HTMLTextAreaElement, maxRows: number) {
  const cs = getComputedStyle(el);
  const px = (v: string) => parseFloat(v) || 0;
  el.style.height = "auto";
  const { height, scroll } = fitHeight(el.scrollHeight, {
    lineHeight: px(cs.lineHeight),
    padding: px(cs.paddingTop) + px(cs.paddingBottom),
    border: px(cs.borderTopWidth) + px(cs.borderBottomWidth),
  }, maxRows);
  el.style.height = `${height}px`;
  el.style.overflowY = scroll ? "auto" : "hidden";
}

/**
 * A labelled text input or textarea from Kiln tokens. The border is ink-muted so it holds 3:1;
 * errors and hints are wired with aria-describedby.
 */
export function TextField({
  id, label, value, onChange, multiline, rows = 3, autosize, maxRows = 6, error, hint, hideLabel, className = "", fieldRef,
  type = "text", placeholder, maxLength, disabled, readOnly, autoFocus, onKeyDown, onFocus, inputMode, min, max, step,
}: {
  id: string;
  label: string;
  value: string;
  onChange?: (value: string) => void;
  multiline?: boolean;
  /** Lines shown before any input (server render too). */
  rows?: number;
  /** Multiline only: grows with its content up to maxRows, then scrolls. No resize grip. */
  autosize?: boolean;
  maxRows?: number;
  error?: string;
  hint?: string;
  /** Keeps the label for screen readers only. Use when the context already names the field. */
  hideLabel?: boolean;
  className?: string;
  fieldRef?: Ref<FieldEl>;
  type?: "text" | "number" | "url";
  placeholder?: string;
  maxLength?: number;
  disabled?: boolean;
  readOnly?: boolean;
  autoFocus?: boolean;
  onKeyDown?: (e: KeyboardEvent<FieldEl>) => void;
  onFocus?: (e: FocusEvent<FieldEl>) => void;
  inputMode?: "text" | "numeric" | "decimal";
  min?: number;
  max?: number;
  step?: number;
}) {
  const describedBy = [error && `${id}-error`, hint && `${id}-hint`].filter(Boolean).join(" ") || undefined;
  const grow = Boolean(multiline && autosize);
  // Runs after every value change, typed or set from outside (a chip, a reset). Found by id so a
  // consumer's fieldRef stays untouched.
  useLayoutEffect(() => {
    const el = grow ? document.getElementById(id) : null;
    if (el instanceof HTMLTextAreaElement) resize(el, maxRows);
  }, [grow, id, value, maxRows]);
  const field = {
    id, value, placeholder, maxLength, disabled, readOnly, autoFocus, onKeyDown, onFocus, ref: fieldRef,
    onChange: onChange ? (e: ChangeEvent<FieldEl>) => onChange(e.target.value) : undefined,
    "aria-invalid": error ? true : undefined,
    "aria-describedby": describedBy,
    className: (grow ? "resize-none " : "") + "w-full rounded-(--radius-control) border border-ink-muted bg-paper-raised px-(--space-2) py-(--space-2) body text-ink placeholder:text-ink-muted outline-none focus-visible:outline-2 focus-visible:outline-offset-3 focus-visible:outline-accent aria-invalid:border-danger disabled:bg-paper-sunk disabled:text-ink-muted read-only:bg-paper-sunk",
  };
  return (
    <div className={`flex flex-col gap-(--space-1) ${className}`}>
      <label htmlFor={id} className={hideLabel ? "sr-only" : "small text-ink"}>{label}</label>
      {multiline
        ? <textarea {...field} rows={rows} />
        : <input {...field} type={type} inputMode={inputMode} min={min} max={max} step={step} />}
      {hint && <p id={`${id}-hint`} className="small font-normal text-ink-muted">{hint}</p>}
      {error && <p id={`${id}-error`} role="alert" className="small text-danger">{error}</p>}
    </div>
  );
}

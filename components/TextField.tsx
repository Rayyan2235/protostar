import type { ChangeEvent, FocusEvent, KeyboardEvent, Ref } from "react";

type FieldEl = HTMLInputElement & HTMLTextAreaElement;

/**
 * A labelled text input or textarea from Kiln tokens. The border is ink-muted so it holds 3:1;
 * errors and hints are wired with aria-describedby.
 */
export function TextField({
  id, label, value, onChange, multiline, rows = 3, error, hint, hideLabel, className = "", fieldRef,
  type = "text", placeholder, maxLength, disabled, readOnly, autoFocus, onKeyDown, onFocus, inputMode, min, max, step,
}: {
  id: string;
  label: string;
  value: string;
  onChange?: (value: string) => void;
  multiline?: boolean;
  rows?: number;
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
  const field = {
    id, value, placeholder, maxLength, disabled, readOnly, autoFocus, onKeyDown, onFocus, ref: fieldRef,
    onChange: onChange ? (e: ChangeEvent<FieldEl>) => onChange(e.target.value) : undefined,
    "aria-invalid": error ? true : undefined,
    "aria-describedby": describedBy,
    className: "w-full rounded-(--radius-sm) border border-ink-muted bg-paper-raised px-(--space-2) py-(--space-2) body text-ink placeholder:text-ink-muted outline-none focus-visible:outline-2 focus-visible:outline-offset-3 focus-visible:outline-accent aria-invalid:border-danger disabled:bg-paper-sunk disabled:text-ink-muted read-only:bg-paper-sunk",
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

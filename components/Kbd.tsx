import type { KeyboardEvent, ReactNode } from "react";

/** One key or chord, in platform-neutral words ("Enter", "Shift + Enter"). */
export function Kbd({ children }: { children: ReactNode }) {
  return (
    <kbd className="label rounded-(--radius-control) border border-hairline bg-paper-raised px-(--space-1) text-ink-soft">{children}</kbd>
  );
}

/** A quiet line of real shortcuts beside a primary action: [keys, what they do]. */
export function KeyHint({ items }: { items: [keys: string, action: string][] }) {
  return (
    <p className="small flex flex-wrap items-center gap-x-(--space-2) gap-y-(--space-1) font-normal text-ink-muted">
      {items.map(([keys, action], i) => (
        <span key={keys} className="inline-flex items-center gap-(--space-1)">
          {i > 0 && <span aria-hidden="true">·</span>}
          <Kbd>{keys}</Kbd> {action}
        </span>
      ))}
    </p>
  );
}

export type EnterResult = "submit" | "block" | "pass";

/**
 * What Enter does in a single-target field: submit, or block (empty or busy), or pass through
 * (Shift+Enter for a new line, IME composing, any other key). Pure, so it's tested as a table.
 */
export function enterAction(
  e: { key: string; shiftKey: boolean; isComposing: boolean },
  s: { empty: boolean; busy: boolean },
): EnterResult {
  if (e.key !== "Enter" || e.shiftKey || e.isComposing) return "pass";
  return s.empty || s.busy ? "block" : "submit";
}

/** onKeyDown for a field whose Enter sends the form. Never use it on a field with several targets. */
export function submitOnEnter(s: { empty: boolean; busy: boolean }, submit: () => void) {
  return (e: KeyboardEvent<HTMLElement>) => {
    // keyCode 229: Safari reports IME composition this way.
    const r = enterAction({ key: e.key, shiftKey: e.shiftKey, isComposing: e.nativeEvent.isComposing || e.keyCode === 229 }, s);
    if (r === "pass") return;
    e.preventDefault();
    if (r === "submit") submit();
  };
}

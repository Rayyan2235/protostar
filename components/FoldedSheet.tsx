// Behaviour adapted from Cult UI Folded Card. Cult UI © Jordan Gilliam, MIT licence.
// Rebuilt without motion/shadcn on Kiln tokens: a clip-path corner and a stone fold, static.
import type { ReactNode } from "react";

/**
 * A submitted blueprint as a sheet with its top-right corner folded: clip-path cut by --space-4
 * and a stone triangle for the fold (app/globals.css .folded-sheet). The padding (--space-4)
 * clears the corner, so the SpecSheet's v{n} is never clipped. No shadow, no motion; no clip
 * and no triangle under forced colours and in print.
 */
export function FoldedSheet({ children }: { children: ReactNode }) {
  return <div className="folded-sheet bg-paper-raised p-(--space-4)">{children}</div>;
}

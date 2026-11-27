import { Tag } from "@/components/kiln/Tag";

/**
 * Which model provider is answering, in words. Live models get Tag's live dot: a real, explained
 * state. Offline and misconfigured say so in the text; neither gets a dot.
 */
export function ModeBadge({ mode }: { mode: string }) {
  // Phones get the short word so the top bar stays one row; the full words return from sm up.
  if (mode === "offline") return <Tag><span className="hidden sm:inline">Offline script · no model calls</span><span className="sm:hidden">Offline</span></Tag>;
  if (mode.startsWith("misconfigured")) return <Tag>{mode}</Tag>;
  return <Tag live>Live models · {mode}</Tag>;
}

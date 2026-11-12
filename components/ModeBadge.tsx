import { Tag } from "@/components/kiln/Tag";

/**
 * Which model provider is answering, in words. Live models get Tag's live dot: a real, explained
 * state. Offline and misconfigured say so in the text; neither gets a dot.
 */
export function ModeBadge({ mode }: { mode: string }) {
  if (mode === "offline") return <Tag>Offline script · no model calls</Tag>;
  if (mode.startsWith("misconfigured")) return <Tag>{mode}</Tag>;
  return <Tag live>Live models · {mode}</Tag>;
}

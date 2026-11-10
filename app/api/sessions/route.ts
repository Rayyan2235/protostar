import { startSession, mode } from "@/lib/engine";

export async function POST(req: Request) {
  const body = (await req.json().catch(() => ({}))) as { idea?: unknown };
  const idea = typeof body.idea === "string" ? body.idea.trim() : "";
  if (!idea) return Response.json({ error: "Describe the agent in a sentence first." }, { status: 400 });
  if (idea.length > 1000) return Response.json({ error: "Keep the idea under 1,000 characters." }, { status: 400 });
  const result = await startSession(idea);
  return Response.json({ ...result, mode: mode() });
}

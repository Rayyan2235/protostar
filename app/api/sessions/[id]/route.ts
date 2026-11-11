import type { NextRequest } from "next/server";
import { ClientActionSchema } from "@/lib/api";
import { act, blueprintFor, meta } from "@/lib/engine";
import { getSession } from "@/lib/store";

export async function GET(_req: NextRequest, ctx: RouteContext<"/api/sessions/[id]">) {
  const { id } = await ctx.params;
  const session = getSession(id);
  if (!session) return Response.json({ error: "Session not found." }, { status: 404 });
  return Response.json({ session, blueprint: blueprintFor(session), ...meta() });
}

export async function POST(req: NextRequest, ctx: RouteContext<"/api/sessions/[id]">) {
  const { id } = await ctx.params;
  const parsed = ClientActionSchema.safeParse(await req.json().catch(() => undefined));
  if (!parsed.success) return Response.json({ error: "Invalid action." }, { status: 400 });
  const result = await act(id, parsed.data);
  if (!result) return Response.json({ error: "Session not found." }, { status: 404 });
  return Response.json({ ...result, ...meta() });
}

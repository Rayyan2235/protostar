/** Reviewer API. The id is the review link token, never the session id (ADR 0011). */
import type { NextRequest } from "next/server";
import { mode, reviewAct, reviewView } from "@/lib/engine";

/** No side effects: opening the page is a separate POST { type: "open" }. */
export async function GET(_req: NextRequest, ctx: RouteContext<"/api/review/[id]">) {
  const { id } = await ctx.params;
  const review = reviewView(id);
  if (!review) return Response.json({ error: "This review link doesn't exist.", mode: mode() }, { status: 404 });
  return Response.json({ review, mode: mode() });
}

export async function POST(req: NextRequest, ctx: RouteContext<"/api/review/[id]">) {
  const { id } = await ctx.params;
  const { status, body } = await reviewAct(id, await req.json().catch(() => undefined));
  return Response.json({ ...body, mode: mode() }, { status });
}

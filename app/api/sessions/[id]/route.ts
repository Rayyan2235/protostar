import type { NextRequest } from "next/server";
import { act, meta, type ClientAction } from "@/lib/engine";
import { getSession } from "@/lib/store";
import type { SlotKey } from "@/lib/types";

const SLOTS = ["users", "top", "never", "examples", "sources", "handoff"];

function parse(body: unknown): ClientAction | undefined {
  if (!body || typeof body !== "object") return undefined;
  const b = body as Record<string, unknown>;
  const text = (v: unknown) => (typeof v === "string" && v.trim() && v.length <= 2000 ? v : undefined);
  switch (b.type) {
    case "answer": return text(b.value) ? { type: "answer", value: b.value as string } : undefined;
    case "edit": return text(b.value) && SLOTS.includes(b.key as string) ? { type: "edit", key: b.key as SlotKey, value: b.value as string } : undefined;
    case "resolve": return ["selfreport", "route", "keep"].includes(b.choice as string) ? { type: "resolve", choice: b.choice as "selfreport" | "route" | "keep" } : undefined;
    case "choose_scope": {
      const k = (b.knobs ?? {}) as Record<string, unknown>;
      if (!["faq", "guided", "open"].includes(b.scope as string) || !["cheap", "capable"].includes(b.role as string)) return undefined;
      return {
        type: "choose_scope", scope: b.scope as "faq" | "guided" | "open", role: b.role as "cheap" | "capable",
        knobs: { studentsPerMonth: Number(k.studentsPerMonth), convsPerStudent: Number(k.convsPerStudent) },
      };
    }
    case "retry": return { type: "retry" };
    case "reset": return { type: "reset" };
  }
  return undefined;
}

export async function GET(_req: NextRequest, ctx: RouteContext<"/api/sessions/[id]">) {
  const { id } = await ctx.params;
  const session = getSession(id);
  if (!session) return Response.json({ error: "Session not found." }, { status: 404 });
  return Response.json({ session, ...meta() });
}

export async function POST(req: NextRequest, ctx: RouteContext<"/api/sessions/[id]">) {
  const { id } = await ctx.params;
  const action = parse(await req.json().catch(() => undefined));
  if (!action) return Response.json({ error: "Invalid action." }, { status: 400 });
  const result = await act(id, action);
  if (!result) return Response.json({ error: "Session not found." }, { status: 404 });
  return Response.json({ ...result, ...meta() });
}

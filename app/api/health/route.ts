import { connection } from "next/server";
import { health } from "@/lib/health";

/** Deploy health check (App Service → Health check path). Runs per request, never prerendered. */
export async function GET() {
  await connection();
  const { status, body } = health();
  return Response.json(body, { status, headers: { "Cache-Control": "no-store" } });
}

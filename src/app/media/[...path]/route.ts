import { NextResponse } from "next/server";
import { readMedia } from "@/lib/services/media";

export async function GET(_req: Request, ctx: { params: Promise<{ path: string[] }> }) {
  const { path } = await ctx.params;
  const m = readMedia(path.join("/"));
  if (!m) return new NextResponse("Not found", { status: 404 });
  return new NextResponse(new Uint8Array(m.buffer), { headers: { "Content-Type": m.mime, "Cache-Control": "public, max-age=31536000, immutable" } });
}

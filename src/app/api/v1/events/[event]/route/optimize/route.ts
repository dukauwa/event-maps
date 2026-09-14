import { z } from "zod";
import { notFound, ok, optionsResponse, parseBody, withApi } from "@/lib/api/http";
import { db } from "@/lib/db";
import { findEventBySlugOrId, getViewerBundle } from "@/lib/bundle";
import { buildGraph, optimizeRoute } from "@/lib/routing";
import { parseEndpoint } from "../route";

export const OPTIONS = () => optionsResponse();
/** Public: `{ start: "booth:A101", stops: ["booth:B205", ...], accessible?, returnToStart? }` → best visiting order + legs. */
export const POST = withApi(async (req: Request, ctx: { params: Promise<{ event: string }> }) => {
  const event = findEventBySlugOrId(db(), (await ctx.params).event);
  if (!event) throw notFound("event");
  const bundle = getViewerBundle(db(), event.id, false) ?? getViewerBundle(db(), event.id, true);
  if (!bundle) throw notFound("floor plan");
  const { start, stops, accessible, returnToStart } = await parseBody(req, z.object({ start: z.string(), stops: z.array(z.string()).min(1).max(25), accessible: z.boolean().optional(), returnToStart: z.boolean().optional() }));
  const levels = bundle.levels.map((l) => ({ id: l.id, shortName: l.shortName }));
  return ok(optimizeRoute(bundle, buildGraph(bundle), parseEndpoint(start, levels), stops.map((s) => parseEndpoint(s, levels)), { accessible, returnToStart }));
});

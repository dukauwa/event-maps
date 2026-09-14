import { badRequest, notFound, ok, optionsResponse, withApi } from "@/lib/api/http";
import { db } from "@/lib/db";
import { findEventBySlugOrId, getViewerBundle } from "@/lib/bundle";
import { buildGraph, findRoute } from "@/lib/routing";
import type { RouteEndpoint } from "@/lib/domain/types";

export const OPTIONS = () => optionsResponse();

/** Parse "booth:A101", "exhibitor:slug", "element:id", "node:id", "point:L1:x,y", or a bare booth label. */
export function parseEndpoint(raw: string, levelIds: { id: string; shortName: string }[]): RouteEndpoint {
  const [kind, ...rest] = raw.split(":");
  const val = rest.join(":");
  switch (kind) {
    case "booth": return { type: "booth", id: val };
    case "exhibitor": return { type: "exhibitor", id: val };
    case "element": return { type: "element", id: val };
    case "node": return { type: "node", id: val };
    case "point": {
      const [lvl, xy] = val.split(":");
      const [x, y] = (xy ?? "").split(",").map(Number);
      const level = levelIds.find((l) => l.id === lvl || l.shortName === lvl);
      if (!level || Number.isNaN(x) || Number.isNaN(y)) throw badRequest(`Bad point endpoint '${raw}'`);
      return { type: "point", levelId: level.id, x, y };
    }
    default: return { type: "booth", id: raw };
  }
}

/** Public server-side routing: `?from=booth:A101&to=booth:B205&accessible=1&via=booth:C301`. Uses the published plan. */
export const GET = withApi(async (req: Request, ctx: { params: Promise<{ event: string }> }) => {
  const event = findEventBySlugOrId(db(), (await ctx.params).event);
  if (!event) throw notFound("event");
  const bundle = getViewerBundle(db(), event.id, false) ?? getViewerBundle(db(), event.id, true);
  if (!bundle) throw notFound("floor plan");
  const q = new URL(req.url).searchParams;
  const from = q.get("from"), to = q.get("to");
  if (!from || !to) throw badRequest("from and to are required");
  const levels = bundle.levels.map((l) => ({ id: l.id, shortName: l.shortName }));
  const via = q.getAll("via").map((v) => parseEndpoint(v, levels));
  const result = findRoute(bundle, buildGraph(bundle), parseEndpoint(from, levels), parseEndpoint(to, levels), { accessible: q.get("accessible") === "1", via });
  return ok(result);
});

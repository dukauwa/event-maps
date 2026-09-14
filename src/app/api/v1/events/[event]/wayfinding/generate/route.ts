import { z } from "zod";
import { badRequest, ok, optionsResponse, parseBody, requireEvent, withApi } from "@/lib/api/http";
import { buildBundle } from "@/lib/bundle";
import { db } from "@/lib/db";
import { generateWayfindingGraph } from "@/lib/routing";
import { replaceLevelGraph } from "@/lib/services/wayfinding";

export const OPTIONS = () => optionsResponse();
/** Auto-generate an aisle network for a level from booth/wall geometry. `apply: true` saves it (replacing the level's network). */
export const POST = withApi(async (req: Request, ctx: { params: Promise<{ event: string }> }) => {
  const { event } = await requireEvent(req, (await ctx.params).event, "write");
  const { levelId, cellSize, clearance, apply } = await parseBody(req, z.object({ levelId: z.string(), cellSize: z.number().min(0.25).max(5).optional(), clearance: z.number().min(0).max(5).optional(), apply: z.boolean().optional() }));
  const bundle = buildBundle(db(), event.id)!;
  const level = bundle.levels.find((l) => l.id === levelId);
  if (!level) throw badRequest("Unknown levelId");
  const graph = generateWayfindingGraph(level, bundle.booths.filter((b) => b.levelId === levelId), { cellSize, clearance });
  if (apply) return ok(replaceLevelGraph(event.id, { levelId, nodes: graph.nodes.map((n) => ({ id: n.id, x: n.x, y: n.y })), edges: graph.edges.map((e) => ({ from: e.from, to: e.to, accessible: e.accessible, oneWay: e.oneWay, virtual: e.virtual, weight: e.weight })) }));
  return ok(graph);
});

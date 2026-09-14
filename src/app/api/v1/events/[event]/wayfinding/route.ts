import { ok, optionsResponse, parseBody, requireEvent, withApi } from "@/lib/api/http";
import { getWayfinding, graphInput, replaceLevelGraph } from "@/lib/services/wayfinding";

type Ctx = { params: Promise<{ event: string }> };
export const OPTIONS = () => optionsResponse();
/** GET `?levelId=` returns nodes/edges/transitions. PUT `{ levelId, nodes, edges }` replaces a level's network. */
export const GET = withApi(async (req: Request, ctx: Ctx) => { const { event } = await requireEvent(req, (await ctx.params).event); return ok(getWayfinding(event.id, new URL(req.url).searchParams.get("levelId") ?? undefined)); });
export const PUT = withApi(async (req: Request, ctx: Ctx) => { const { event } = await requireEvent(req, (await ctx.params).event, "write"); return ok(replaceLevelGraph(event.id, await parseBody(req, graphInput))); });

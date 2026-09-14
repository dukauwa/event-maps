import { ok, optionsResponse, parseBody, requireEvent, withApi } from "@/lib/api/http";
import { createLevel, levelInput, listLevels } from "@/lib/services/levels";

type Ctx = { params: Promise<{ event: string }> };
export const OPTIONS = () => optionsResponse();
export const GET = withApi(async (req: Request, ctx: Ctx) => { const { event } = await requireEvent(req, (await ctx.params).event); return ok(listLevels(event.id)); });
export const POST = withApi(async (req: Request, ctx: Ctx) => { const { event } = await requireEvent(req, (await ctx.params).event, "write"); return ok(createLevel(event.id, await parseBody(req, levelInput)), { status: 201 }); });

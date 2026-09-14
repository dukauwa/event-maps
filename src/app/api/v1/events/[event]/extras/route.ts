import { ok, optionsResponse, parseBody, requireEvent, withApi } from "@/lib/api/http";
import { createExtra, extraInput, listExtras } from "@/lib/services/extras";

type Ctx = { params: Promise<{ event: string }> };
export const OPTIONS = () => optionsResponse();
export const GET = withApi(async (req: Request, ctx: Ctx) => { const { event } = await requireEvent(req, (await ctx.params).event); return ok(listExtras(event.id)); });
export const POST = withApi(async (req: Request, ctx: Ctx) => { const { event } = await requireEvent(req, (await ctx.params).event, "write"); return ok(createExtra(event, await parseBody(req, extraInput)), { status: 201 }); });

import { ok, optionsResponse, parseBody, requireEvent, withApi } from "@/lib/api/http";
import { createTransition, listTransitions, transitionInput } from "@/lib/services/wayfinding";

type Ctx = { params: Promise<{ event: string }> };
export const OPTIONS = () => optionsResponse();
export const GET = withApi(async (req: Request, ctx: Ctx) => { const { event } = await requireEvent(req, (await ctx.params).event); return ok(listTransitions(event.id)); });
export const POST = withApi(async (req: Request, ctx: Ctx) => { const { event } = await requireEvent(req, (await ctx.params).event, "write"); return ok(createTransition(event.id, await parseBody(req, transitionInput)), { status: 201 }); });

import { ok, optionsResponse, parseBody, requireEvent, withApi } from "@/lib/api/http";
import { deleteExtra, extraInput, updateExtra } from "@/lib/services/extras";

type Ctx = { params: Promise<{ event: string; id: string }> };
export const OPTIONS = () => optionsResponse();
export const PATCH = withApi(async (req: Request, ctx: Ctx) => { const p = await ctx.params; const { event } = await requireEvent(req, p.event, "write"); return ok(updateExtra(event.id, p.id, await parseBody(req, extraInput.partial()))); });
export const DELETE = withApi(async (req: Request, ctx: Ctx) => { const p = await ctx.params; const { event } = await requireEvent(req, p.event, "write"); deleteExtra(event.id, p.id); return ok({ deleted: true }); });

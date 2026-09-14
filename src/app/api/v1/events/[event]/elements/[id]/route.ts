import { notFound, ok, optionsResponse, parseBody, requireEvent, withApi } from "@/lib/api/http";
import { deleteElement, elementInput, getElement, updateElement } from "@/lib/services/elements";

type Ctx = { params: Promise<{ event: string; id: string }> };
export const OPTIONS = () => optionsResponse();
export const GET = withApi(async (req: Request, ctx: Ctx) => { const p = await ctx.params; const { event } = await requireEvent(req, p.event); const e = getElement(event.id, p.id); if (!e) throw notFound("element"); return ok(e); });
export const PATCH = withApi(async (req: Request, ctx: Ctx) => { const p = await ctx.params; const { event } = await requireEvent(req, p.event, "write"); return ok(updateElement(event.id, p.id, await parseBody(req, elementInput.partial()))); });
export const DELETE = withApi(async (req: Request, ctx: Ctx) => { const p = await ctx.params; const { event } = await requireEvent(req, p.event, "write"); deleteElement(event.id, p.id); return ok({ deleted: true }); });

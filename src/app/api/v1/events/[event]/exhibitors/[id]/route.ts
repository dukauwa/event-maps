import { notFound, ok, optionsResponse, parseBody, requireEvent, withApi } from "@/lib/api/http";
import { deleteExhibitor, exhibitorPatch, getExhibitor, updateExhibitor } from "@/lib/services/exhibitors";

type Ctx = { params: Promise<{ event: string; id: string }> };
export const OPTIONS = () => optionsResponse();
/** `id` may be the exhibitor id, slug or externalId. */
export const GET = withApi(async (req: Request, ctx: Ctx) => { const p = await ctx.params; const { event } = await requireEvent(req, p.event); const e = getExhibitor(event.id, p.id); if (!e) throw notFound("exhibitor"); return ok(e); });
export const PATCH = withApi(async (req: Request, ctx: Ctx) => { const p = await ctx.params; const { event } = await requireEvent(req, p.event, "write"); const e = getExhibitor(event.id, p.id); if (!e) throw notFound("exhibitor"); return ok(updateExhibitor(event, e.id, await parseBody(req, exhibitorPatch))); });
export const DELETE = withApi(async (req: Request, ctx: Ctx) => { const p = await ctx.params; const { event } = await requireEvent(req, p.event, "write"); deleteExhibitor(event, p.id); return ok({ deleted: true }); });

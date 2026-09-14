import { notFound, ok, optionsResponse, parseBody, requireEvent, withApi } from "@/lib/api/http";
import { boothPatch, deleteBooth, getBooth, updateBooth } from "@/lib/services/booths";

type Ctx = { params: Promise<{ event: string; id: string }> };
export const OPTIONS = () => optionsResponse();
/** `id` may be the booth id, its label, or its externalId. */
export const GET = withApi(async (req: Request, ctx: Ctx) => { const p = await ctx.params; const { event } = await requireEvent(req, p.event); const b = getBooth(event.id, p.id); if (!b) throw notFound("booth"); return ok(b); });
export const PATCH = withApi(async (req: Request, ctx: Ctx) => { const p = await ctx.params; const { event } = await requireEvent(req, p.event, "write"); const b = getBooth(event.id, p.id); if (!b) throw notFound("booth"); return ok(updateBooth(event, b.id, await parseBody(req, boothPatch))); });
export const DELETE = withApi(async (req: Request, ctx: Ctx) => { const p = await ctx.params; const { event } = await requireEvent(req, p.event, "write"); deleteBooth(event, p.id); return ok({ deleted: true }); });

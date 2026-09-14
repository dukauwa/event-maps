import { notFound, ok, optionsResponse, parseBody, requireEvent, withApi } from "@/lib/api/http";
import { deleteLevel, getLevel, levelInput, updateLevel } from "@/lib/services/levels";

type Ctx = { params: Promise<{ event: string; id: string }> };
export const OPTIONS = () => optionsResponse();
export const GET = withApi(async (req: Request, ctx: Ctx) => { const p = await ctx.params; const { event } = await requireEvent(req, p.event); const l = getLevel(event.id, p.id); if (!l) throw notFound("level"); return ok(l); });
export const PATCH = withApi(async (req: Request, ctx: Ctx) => { const p = await ctx.params; const { event } = await requireEvent(req, p.event, "write"); return ok(updateLevel(event.id, p.id, await parseBody(req, levelInput.partial()))); });
export const DELETE = withApi(async (req: Request, ctx: Ctx) => { const p = await ctx.params; const { event } = await requireEvent(req, p.event, "write"); deleteLevel(event.id, p.id); return ok({ deleted: true }); });

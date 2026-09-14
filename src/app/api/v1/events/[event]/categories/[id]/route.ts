import { notFound, ok, optionsResponse, parseBody, requireEvent, withApi } from "@/lib/api/http";
import { categoryInput, deleteCategory, getCategory, updateCategory } from "@/lib/services/categories";

type Ctx = { params: Promise<{ event: string; id: string }> };
export const OPTIONS = () => optionsResponse();
export const GET = withApi(async (req: Request, ctx: Ctx) => { const p = await ctx.params; const { event } = await requireEvent(req, p.event); const c = getCategory(event.id, p.id); if (!c) throw notFound("category"); return ok(c); });
export const PATCH = withApi(async (req: Request, ctx: Ctx) => { const p = await ctx.params; const { event } = await requireEvent(req, p.event, "write"); return ok(updateCategory(event.id, p.id, await parseBody(req, categoryInput.partial()))); });
export const DELETE = withApi(async (req: Request, ctx: Ctx) => { const p = await ctx.params; const { event } = await requireEvent(req, p.event, "write"); deleteCategory(event.id, p.id); return ok({ deleted: true }); });

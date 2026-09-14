import { ok, optionsResponse, parseBody, requireEvent, withApi } from "@/lib/api/http";
import { categoryInput, createCategory, listCategories } from "@/lib/services/categories";

type Ctx = { params: Promise<{ event: string }> };
export const OPTIONS = () => optionsResponse();
export const GET = withApi(async (req: Request, ctx: Ctx) => { const { event } = await requireEvent(req, (await ctx.params).event); return ok(listCategories(event.id)); });
export const POST = withApi(async (req: Request, ctx: Ctx) => { const { event } = await requireEvent(req, (await ctx.params).event, "write"); return ok(createCategory(event.id, await parseBody(req, categoryInput)), { status: 201 }); });

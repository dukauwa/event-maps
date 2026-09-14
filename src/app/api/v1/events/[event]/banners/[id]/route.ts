import { ok, optionsResponse, parseBody, requireEvent, withApi } from "@/lib/api/http";
import { bannerInput, deleteBanner, updateBanner } from "@/lib/services/banners";

type Ctx = { params: Promise<{ event: string; id: string }> };
export const OPTIONS = () => optionsResponse();
export const PATCH = withApi(async (req: Request, ctx: Ctx) => { const p = await ctx.params; const { event } = await requireEvent(req, p.event, "write"); return ok(updateBanner(event.id, p.id, await parseBody(req, bannerInput.partial()))); });
export const DELETE = withApi(async (req: Request, ctx: Ctx) => { const p = await ctx.params; const { event } = await requireEvent(req, p.event, "write"); deleteBanner(event.id, p.id); return ok({ deleted: true }); });

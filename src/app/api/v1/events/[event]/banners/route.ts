import { ok, optionsResponse, parseBody, requireEvent, withApi } from "@/lib/api/http";
import { bannerInput, createBanner, listBanners } from "@/lib/services/banners";

type Ctx = { params: Promise<{ event: string }> };
export const OPTIONS = () => optionsResponse();
export const GET = withApi(async (req: Request, ctx: Ctx) => { const { event } = await requireEvent(req, (await ctx.params).event); return ok(listBanners(event.id)); });
export const POST = withApi(async (req: Request, ctx: Ctx) => { const { event } = await requireEvent(req, (await ctx.params).event, "write"); return ok(createBanner(event.id, await parseBody(req, bannerInput)), { status: 201 }); });

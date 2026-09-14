import { ok, optionsResponse, requireEvent, withApi } from "@/lib/api/http";
import { salesSummary } from "@/lib/services/orders";

export const OPTIONS = () => optionsResponse();
export const GET = withApi(async (req: Request, ctx: { params: Promise<{ event: string }> }) => { const { event } = await requireEvent(req, (await ctx.params).event); return ok(salesSummary(event)); });

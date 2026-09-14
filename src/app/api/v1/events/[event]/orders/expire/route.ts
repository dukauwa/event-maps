import { ok, optionsResponse, requireEvent, withApi } from "@/lib/api/http";
import { expireOrders } from "@/lib/services/orders";

export const OPTIONS = () => optionsResponse();
export const POST = withApi(async (req: Request, ctx: { params: Promise<{ event: string }> }) => { const { event } = await requireEvent(req, (await ctx.params).event, "write"); return ok({ expired: expireOrders(event) }); });

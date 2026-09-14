import { ok, optionsResponse, requireEvent, withApi } from "@/lib/api/http";
import { refundOrder } from "@/lib/services/orders";

export const OPTIONS = () => optionsResponse();
export const POST = withApi(async (req: Request, ctx: { params: Promise<{ event: string; id: string }> }) => {
  const p = await ctx.params; const { event } = await requireEvent(req, p.event, "write");
  return ok(refundOrder(event, p.id));
});

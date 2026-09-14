import { ok, optionsResponse, requireEvent, withApi } from "@/lib/api/http";
import { markOrderPaid } from "@/lib/services/orders";

export const OPTIONS = () => optionsResponse();
export const POST = withApi(async (req: Request, ctx: { params: Promise<{ event: string; id: string }> }) => {
  const p = await ctx.params; const { event } = await requireEvent(req, p.event, "write");
  const body = (await req.json().catch(() => ({}))) as { providerRef?: string; reason?: string };
  return ok(markOrderPaid(event, p.id, body.providerRef ?? null));
});

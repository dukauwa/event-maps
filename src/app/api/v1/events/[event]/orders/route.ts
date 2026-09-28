import { ok, optionsResponse, paginate, requireEvent, withApi } from "@/lib/api/http";
import { expireOrders, listOrders } from "@/lib/services/orders";

export const OPTIONS = () => optionsResponse();
export const GET = withApi(async (req: Request, ctx: { params: Promise<{ event: string }> }) => {
  const { event } = await requireEvent(req, (await ctx.params).event);
  await expireOrders(event);
  const q = new URL(req.url).searchParams;
  const { data, meta } = paginate(await listOrders(event.id, { status: q.get("status") ?? undefined, boothId: q.get("boothId") ?? undefined, exhibitorId: q.get("exhibitorId") ?? undefined }), req);
  return ok(data, { meta });
});

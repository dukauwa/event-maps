import { badRequest, notFound, ok, optionsResponse, withApi } from "@/lib/api/http";
import { db } from "@/lib/db";
import { findEventBySlugOrId } from "@/lib/bundle";
import { getOrder, markOrderPaid } from "@/lib/services/orders";

export const OPTIONS = () => optionsResponse();
/** Public, mock provider only: simulates a successful payment (used by the built-in test checkout page). */
export const POST = withApi(async (_req: Request, ctx: { params: Promise<{ event: string; id: string }> }) => {
  const p = await ctx.params;
  const event = findEventBySlugOrId(db(), p.event); if (!event) throw notFound("event");
  const order = getOrder(event.id, p.id); if (!order) throw notFound("order");
  if (event.settings.sales.provider !== "mock" && process.env.NODE_ENV === "production") throw badRequest("Mock payments are disabled");
  return ok(markOrderPaid(event, order.id, `mock_${Date.now()}`));
});

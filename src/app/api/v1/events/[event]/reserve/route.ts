import { notFound, ok, optionsResponse, parseBody, withApi } from "@/lib/api/http";
import { db } from "@/lib/db";
import { findEventBySlugOrId } from "@/lib/bundle";
import { reserveBooth, reserveInput } from "@/lib/services/orders";
import { requestOrigin } from "@/lib/auth/session";

export const OPTIONS = () => optionsResponse();
/** Public: reserve/buy a booth from the viewer. Returns the order and, in buy mode, a checkout URL. */
export const POST = withApi(async (req: Request, ctx: { params: Promise<{ event: string }> }) => {
  const event = findEventBySlugOrId(db(), (await ctx.params).event);
  if (!event) throw notFound("event");
  const input = await parseBody(req, reserveInput);
  const { order, checkoutUrl } = reserveBooth(event, input, await requestOrigin());
  const { providerRef: _p, ...safe } = order; void _p;
  return ok({ order: safe, checkoutUrl }, { status: 201 });
});

import { NextResponse } from "next/server";
import { notFound, optionsResponse, withApi } from "@/lib/api/http";
import { db } from "@/lib/db";
import { findEventBySlugOrId } from "@/lib/bundle";
import { createStripeCheckoutSession, getOrder } from "@/lib/services/orders";
import { requestOrigin } from "@/lib/auth/session";

export const OPTIONS = () => optionsResponse();
/** Public: creates the Stripe Checkout Session for a held order and redirects to it. */
export const GET = withApi(async (_req: Request, ctx: { params: Promise<{ event: string; id: string }> }) => {
  const p = await ctx.params;
  const event = findEventBySlugOrId(db(), p.event); if (!event) throw notFound("event");
  const order = getOrder(event.id, p.id); if (!order || order.status !== "hold") throw notFound("order");
  const url = await createStripeCheckoutSession(event, order, await requestOrigin());
  return NextResponse.redirect(url, 303);
});

import { and, eq, desc } from "drizzle-orm";
import { z } from "zod";
import { db, schema } from "@/lib/db";
import { newId } from "@/lib/ids";
import { resolveBoothPrice } from "@/lib/pricing";
import { badRequest, conflict, notFound } from "@/lib/api/http";
import { emitWebhook } from "./webhooks";
import { getBooth, releaseExpiredHolds, setBoothStatus, assignExhibitor } from "./booths";
import { listPricingRules } from "./pricing-rules";
import { createExhibitor, getExhibitor } from "./exhibitors";
import { assignExtra, getExtra } from "./extras";
import type { Event, Order } from "@/lib/db/schema";

export const reserveInput = z.object({
  boothId: z.string(),
  exhibitorId: z.string().nullish(),
  company: z.string().min(1).max(200),
  contactName: z.string().min(1).max(120),
  contactEmail: z.string().email().max(200),
  notes: z.string().max(2000).nullish(),
  extras: z.array(z.object({ extraId: z.string(), quantity: z.number().int().positive() })).optional(),
});
export type ReserveInput = z.infer<typeof reserveInput>;

export async function listOrders(eventId: string, filter: { status?: string; boothId?: string; exhibitorId?: string } = {}) {
  let rows = await db().select().from(schema.orders).where(eq(schema.orders.eventId, eventId)).orderBy(desc(schema.orders.createdAt)).all();
  if (filter.status) rows = rows.filter((o) => o.status === filter.status);
  if (filter.boothId) rows = rows.filter((o) => o.boothId === filter.boothId);
  if (filter.exhibitorId) rows = rows.filter((o) => o.exhibitorId === filter.exhibitorId);
  return rows;
}

export async function getOrder(eventId: string, id: string) {
  return (await db().select().from(schema.orders).where(and(eq(schema.orders.eventId, eventId), eq(schema.orders.id, id))).get()) ?? null;
}

export async function quoteBooth(ev: Event, boothId: string) {
  const booth = await getBooth(ev.id, boothId);
  if (!booth) throw notFound("booth");
  const price = resolveBoothPrice(booth, await listPricingRules(ev.id), ev.settings);
  const taxCents = price ? Math.round((price.priceCents * ev.settings.sales.taxPercent) / 100) : 0;
  return { booth, price, taxCents, totalCents: (price?.priceCents ?? 0) + taxCents, currency: price?.currency ?? ev.settings.sales.currency };
}

/**
 * Public reservation: place a hold on an available booth and create an order.
 * Mode 'reserve' → order stays 'pending_payment' (organiser confirms); 'buy' → checkout URL; 'inquiry' → no hold, just a lead.
 */
export async function reserveBooth(ev: Event, input: ReserveInput, origin: string): Promise<{ order: Order; checkoutUrl: string | null }> {
  // `features.allowReservation` only decides whether the attendee map shows a Reserve button; the booking view and portal always can.
  if (!ev.settings.sales.enabled) throw badRequest("Booth sales are not enabled for this event");
  await releaseExpiredHolds(ev);
  const { booth, price, taxCents, currency } = await quoteBooth(ev, input.boothId);
  const mode = ev.settings.sales.mode;
  if (mode !== "inquiry" && booth.status !== "available") throw conflict(`Booth ${booth.label} is ${booth.status}`);

  let exhibitorId = input.exhibitorId ?? null;
  if (exhibitorId && !(await getExhibitor(ev.id, exhibitorId))) exhibitorId = null;
  if (!exhibitorId) {
    const existing = await db().select().from(schema.exhibitors).where(and(eq(schema.exhibitors.eventId, ev.id), eq(schema.exhibitors.email, input.contactEmail))).get();
    exhibitorId = existing?.id ?? (await createExhibitor(ev, { name: input.company, email: input.contactEmail, contactName: input.contactName })).id;
  }

  // Add-ons: assign to the exhibitor (limits enforced) and add to the order total.
  let extrasCents = 0;
  const extraNotes: string[] = [];
  for (const x of input.extras ?? []) {
    const extra = await getExtra(ev.id, x.extraId);
    if (!extra || !extra.reserveOrBuyAllowed) continue;
    await assignExtra(ev, exhibitorId, extra.id, x.quantity, booth.id);
    extrasCents += (extra.priceCents ?? 0) * x.quantity;
    extraNotes.push(`${x.quantity}× ${extra.name}`);
  }
  const holdMinutes = ev.settings.sales.holdMinutes || 30;
  const expiresAt = new Date(Date.now() + holdMinutes * 60e3).toISOString();
  const id = newId("or");
  const status = mode === "buy" ? "hold" : mode === "reserve" ? "pending_payment" : "hold";
  const extrasTax = Math.round((extrasCents * ev.settings.sales.taxPercent) / 100);
  await db().insert(schema.orders).values({
            id, eventId: ev.id, boothId: booth.id, exhibitorId, status, amountCents: (price?.priceCents ?? 0) + extrasCents, taxCents: taxCents + extrasTax, currency,
            provider: ev.settings.sales.provider, expiresAt: mode === "reserve" ? null : expiresAt, company: input.company, contactName: input.contactName, contactEmail: input.contactEmail, notes: [input.notes, extraNotes.length ? `Add-ons: ${extraNotes.join(", ")}` : null].filter(Boolean).join("\n") || null,
          }).run();
  if (mode === "reserve") {
    await setBoothStatus(ev, booth.id, "reserved");
    await assignExhibitor(ev, booth.id, exhibitorId);
  } else if (mode === "buy") {
    await setBoothStatus(ev, booth.id, "held", expiresAt);
  }
  let order = (await getOrder(ev.id, id))!;
  await emitWebhook(ev.orgId, ev.id, "order.created", order);
  let checkoutUrl: string | null = null;
  if (mode === "buy") {
    checkoutUrl = createCheckout(ev, order, origin);
    await db().update(schema.orders).set({ checkoutUrl }).where(eq(schema.orders.id, id)).run();
    order = (await getOrder(ev.id, id))!;
  }
  return { order, checkoutUrl };
}

/** Build a checkout URL: Stripe Checkout when configured, otherwise the built-in mock checkout page. */
function createCheckout(ev: Event, order: Order, origin: string): string {
  const provider = ev.settings.sales.provider;
  const successUrl = `${origin}/e/${ev.slug}/reserve/${order.boothId}/done?order=${order.id}`;
  if (provider === "stripe" && process.env.STRIPE_SECRET_KEY) {
    // Created lazily by the /api/v1/orders/{id}/checkout route (async). Return the route that creates + redirects.
    return `${origin}/api/v1/events/${ev.slug}/orders/${order.id}/checkout`;
  }
  if (provider === "invoice") return `${origin}/e/${ev.slug}/reserve/${order.boothId}/invoice?order=${order.id}`;
  return `${origin}/e/${ev.slug}/reserve/${order.boothId}/pay?order=${order.id}&success=${encodeURIComponent(successUrl)}`;
}

/** Stripe Checkout Session via REST (no SDK). Returns the hosted URL. */
export async function createStripeCheckoutSession(ev: Event, order: Order, origin: string): Promise<string> {
  const key = process.env.STRIPE_SECRET_KEY;
  if (!key) throw badRequest("Stripe is not configured (STRIPE_SECRET_KEY)");
  const booth = (await getBooth(ev.id, order.boothId))!;
  const params = new URLSearchParams();
  params.set("mode", "payment");
  params.set("success_url", `${origin}/e/${ev.slug}/reserve/${order.boothId}/done?order=${order.id}&session_id={CHECKOUT_SESSION_ID}`);
  params.set("cancel_url", `${origin}/e/${ev.slug}/reserve/${order.boothId}?cancelled=1`);
  params.set("client_reference_id", order.id);
  params.set("customer_email", order.contactEmail ?? "");
  params.set("metadata[orderId]", order.id);
  params.set("metadata[eventId]", ev.id);
  params.set("line_items[0][quantity]", "1");
  params.set("line_items[0][price_data][currency]", order.currency.toLowerCase());
  params.set("line_items[0][price_data][unit_amount]", String(order.amountCents + order.taxCents));
  params.set("line_items[0][price_data][product_data][name]", `${ev.name} · ${ev.settings.terms.booth} ${booth.label}`);
  if (order.expiresAt) params.set("expires_at", String(Math.max(Math.floor(Date.now() / 1000) + 1800, Math.floor(new Date(order.expiresAt).getTime() / 1000))));
  const res = await fetch("https://api.stripe.com/v1/checkout/sessions", { method: "POST", headers: { Authorization: `Bearer ${key}`, "Content-Type": "application/x-www-form-urlencoded" }, body: params });
  const json = (await res.json()) as { url?: string; id?: string; error?: { message: string } };
  if (!res.ok || !json.url) throw badRequest(`Stripe error: ${json.error?.message ?? res.status}`);
  await db().update(schema.orders).set({ providerRef: json.id ?? null, checkoutUrl: json.url, provider: "stripe" }).where(eq(schema.orders.id, order.id)).run();
  return json.url;
}

export async function markOrderPaid(ev: Event, id: string, providerRef?: string | null) {
  const order = await getOrder(ev.id, id);
  if (!order) throw notFound("order");
  if (order.status === "paid") return order;
  if (order.status === "cancelled" || order.status === "expired") throw conflict(`Order is ${order.status}`);
  const now = new Date().toISOString();
  await db().update(schema.orders).set({ status: "paid", paidAt: now, providerRef: providerRef ?? order.providerRef, updatedAt: now }).where(eq(schema.orders.id, id)).run();
  await setBoothStatus(ev, order.boothId, "sold");
  if (order.exhibitorId) await assignExhibitor(ev, order.boothId, order.exhibitorId);
  const after = (await getOrder(ev.id, id))!;
  await emitWebhook(ev.orgId, ev.id, "order.paid", after);
  return after;
}

export async function markOrderInvoiced(ev: Event, id: string) {
  const order = await getOrder(ev.id, id);
  if (!order) throw notFound("order");
  const now = new Date().toISOString();
  await db().update(schema.orders).set({ status: "invoiced", provider: "invoice", expiresAt: null, updatedAt: now }).where(eq(schema.orders.id, id)).run();
  await setBoothStatus(ev, order.boothId, "reserved");
  if (order.exhibitorId) await assignExhibitor(ev, order.boothId, order.exhibitorId);
  return (await getOrder(ev.id, id))!;
}

export async function cancelOrder(ev: Event, id: string, reason?: string) {
  const order = await getOrder(ev.id, id);
  if (!order) throw notFound("order");
  if (order.status === "paid") throw conflict("Refund paid orders instead of cancelling");
  const now = new Date().toISOString();
  await db().update(schema.orders).set({ status: "cancelled", notes: reason ? `${order.notes ?? ""}\nCancelled: ${reason}`.trim() : order.notes, updatedAt: now }).where(eq(schema.orders.id, id)).run();
  const booth = await getBooth(ev.id, order.boothId);
  if (booth && (booth.status === "held" || booth.status === "reserved")) await setBoothStatus(ev, booth.id, "available");
  const after = (await getOrder(ev.id, id))!;
  await emitWebhook(ev.orgId, ev.id, "order.cancelled", after);
  return after;
}

export async function refundOrder(ev: Event, id: string) {
  const order = await getOrder(ev.id, id);
  if (!order) throw notFound("order");
  const now = new Date().toISOString();
  await db().update(schema.orders).set({ status: "refunded", updatedAt: now }).where(eq(schema.orders.id, id)).run();
  await setBoothStatus(ev, order.boothId, "available");
  return (await getOrder(ev.id, id))!;
}

/** Expire holds/pending orders whose timer ran out. Returns the number expired. */
export async function expireOrders(ev: Event) {
  const now = new Date().toISOString();
  const rows = (await db().select().from(schema.orders).where(and(eq(schema.orders.eventId, ev.id), eq(schema.orders.status, "hold"))).all()).filter((o) => o.expiresAt && o.expiresAt < now);
  for (const o of rows) {
    await db().update(schema.orders).set({ status: "expired", updatedAt: now }).where(eq(schema.orders.id, o.id)).run();
    const booth = await getBooth(ev.id, o.boothId);
    if (booth?.status === "held") await setBoothStatus(ev, booth.id, "available");
    await emitWebhook(ev.orgId, ev.id, "order.expired", { ...o, status: "expired" });
  }
  await releaseExpiredHolds(ev);
  return rows.length;
}

export async function salesSummary(ev: Event) {
  const booths = await db().select().from(schema.booths).where(eq(schema.booths.eventId, ev.id)).all();
  const orders = await listOrders(ev.id);
  const rules = await listPricingRules(ev.id);
  const byStatus: Record<string, number> = {};
  let inventoryValueCents = 0, soldValueCents = 0, areaTotal = 0, areaSold = 0;
  for (const b of booths) {
    byStatus[b.status] = (byStatus[b.status] ?? 0) + 1;
    const p = resolveBoothPrice(b, rules, ev.settings)?.priceCents ?? 0;
    inventoryValueCents += p;
    areaTotal += b.areaM2;
    if (b.status === "sold") { soldValueCents += p; areaSold += b.areaM2; }
  }
  const paidCents = orders.filter((o) => o.status === "paid").reduce((s, o) => s + o.amountCents, 0);
  const pendingCents = orders.filter((o) => o.status === "pending_payment" || o.status === "invoiced" || o.status === "hold").reduce((s, o) => s + o.amountCents, 0);
  return { booths: booths.length, byStatus, inventoryValueCents, soldValueCents, paidCents, pendingCents, areaTotal, areaSold, currency: ev.settings.sales.currency, orders: orders.length };
}

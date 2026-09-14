import { createHmac, timingSafeEqual } from "node:crypto";
import { NextResponse } from "next/server";
import { db } from "@/lib/db";
import { findEventBySlugOrId } from "@/lib/bundle";
import { markOrderPaid } from "@/lib/services/orders";

/** Verify Stripe-Signature (t=,v1=) with STRIPE_WEBHOOK_SECRET. */
function verify(raw: string, header: string | null, secret: string): boolean {
  if (!header) return false;
  const parts = Object.fromEntries(header.split(",").map((kv) => kv.split("=") as [string, string]));
  const expected = createHmac("sha256", secret).update(`${parts.t}.${raw}`).digest("hex");
  const given = Buffer.from(parts.v1 ?? "", "hex");
  const exp = Buffer.from(expected, "hex");
  return given.length === exp.length && timingSafeEqual(given, exp) && Math.abs(Date.now() / 1000 - Number(parts.t)) < 600;
}

export async function POST(req: Request) {
  const secret = process.env.STRIPE_WEBHOOK_SECRET;
  const raw = await req.text();
  if (!secret || !verify(raw, req.headers.get("stripe-signature"), secret)) return NextResponse.json({ error: "bad_signature" }, { status: 400 });
  const evt = JSON.parse(raw) as { type: string; data: { object: { id: string; client_reference_id?: string; metadata?: { orderId?: string; eventId?: string } } } };
  if (evt.type === "checkout.session.completed" || evt.type === "checkout.session.async_payment_succeeded") {
    const s = evt.data.object;
    const orderId = s.metadata?.orderId ?? s.client_reference_id;
    const event = s.metadata?.eventId ? findEventBySlugOrId(db(), s.metadata.eventId) : null;
    if (event && orderId) markOrderPaid(event, orderId, s.id);
  }
  return NextResponse.json({ received: true });
}

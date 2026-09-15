import type { Metadata } from "next";
import { listPricingRules } from "@/lib/services/pricing-rules";
import { listExtras } from "@/lib/services/extras";
import { listOrders, salesSummary } from "@/lib/services/orders";
import { listBooths } from "@/lib/services/booths";
import { listExhibitors } from "@/lib/services/exhibitors";
import { SalesManager } from "@/components/admin/sales-manager";
import { loadEvent } from "../../../_lib";

export const metadata: Metadata = { title: "Sales" };

export default async function SalesPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const { event } = await loadEvent(id);
  const boothLabel = new Map(listBooths(event.id).map((b) => [b.id, b.label]));
  const exName = new Map(listExhibitors(event.id).map((e) => [e.id, e.name]));
  const orders = listOrders(event.id).map((o) => ({
    id: o.id, boothId: o.boothId, boothLabel: boothLabel.get(o.boothId) ?? o.boothId, exhibitorId: o.exhibitorId, exhibitorName: o.exhibitorId ? exName.get(o.exhibitorId) ?? null : null, status: o.status, amountCents: o.amountCents, taxCents: o.taxCents,
    currency: o.currency, provider: o.provider, company: o.company, contactName: o.contactName, contactEmail: o.contactEmail, expiresAt: o.expiresAt, paidAt: o.paidAt, createdAt: o.createdAt, notes: o.notes,
  }));
  const t = event.settings.terms;
  return (
    <SalesManager
      event={{ id: event.id, name: event.name, slug: event.slug, timezone: event.timezone, sales: event.settings.sales, terms: { booth: t.booth, booths: t.booths, exhibitor: t.exhibitor } }}
      rules={listPricingRules(event.id)}
      extras={listExtras(event.id)}
      orders={orders}
      summary={salesSummary(event)}
      stripeConfigured={!!process.env.STRIPE_SECRET_KEY}
    />
  );
}

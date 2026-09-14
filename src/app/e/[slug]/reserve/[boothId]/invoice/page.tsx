import { notFound } from "next/navigation";
import Link from "next/link";
import { db } from "@/lib/db";
import { findEventBySlugOrId } from "@/lib/bundle";
import { getOrder, markOrderInvoiced } from "@/lib/services/orders";
import { formatMoney } from "@/lib/pricing";

export default async function InvoicePage({ params, searchParams }: { params: Promise<{ slug: string; boothId: string }>; searchParams: Promise<Record<string, string | undefined>> }) {
  const { slug, boothId } = await params;
  const { order: orderId } = await searchParams;
  const event = findEventBySlugOrId(db(), slug);
  if (!event || !orderId) notFound();
  let order = getOrder(event.id, orderId);
  if (!order || order.boothId !== boothId) notFound();
  if (order.status === "hold") order = markOrderInvoiced(event, order.id);
  return (
    <main className="mx-auto max-w-lg px-4 py-16">
      <h1 className="text-xl font-semibold">Thanks, we&apos;ll invoice you</h1>
      <p className="mt-2 text-sm text-gray-600">Your {event.settings.terms.booth.toLowerCase()} is reserved. An invoice for {formatMoney(order.amountCents + order.taxCents, order.currency)} will be sent to {order.contactEmail}.</p>
      <p className="mt-4 text-xs text-gray-500">Order reference: {order.id}</p>
      <Link href={`/e/${event.slug}?booth=${boothId}`} className="mt-6 inline-block text-primary underline">Back to the map</Link>
    </main>
  );
}

import { notFound } from "next/navigation";
import Link from "next/link";
import { db } from "@/lib/db";
import { findEventBySlugOrId } from "@/lib/bundle";
import { getOrder, expireOrders } from "@/lib/services/orders";
import { getBooth } from "@/lib/services/booths";
import { formatMoney } from "@/lib/pricing";
import { MockCheckout } from "@/components/portal/mock-checkout";

export default async function PayPage({ params, searchParams }: { params: Promise<{ slug: string; boothId: string }>; searchParams: Promise<Record<string, string | undefined>> }) {
  const { slug, boothId } = await params;
  const { order: orderId } = await searchParams;
  const event = findEventBySlugOrId(db(), slug);
  if (!event || !orderId) notFound();
  expireOrders(event);
  const order = getOrder(event.id, orderId);
  const booth = getBooth(event.id, boothId);
  if (!order || !booth || order.boothId !== booth.id) notFound();
  if (order.status === "paid") return <Redirect to={`/e/${event.slug}/reserve/${booth.id}/done?order=${order.id}`} />;
  if (order.status !== "hold") return (
    <main className="mx-auto max-w-lg px-4 py-16 text-center">
      <h1 className="text-xl font-semibold">This checkout has {order.status === "expired" ? "expired" : "been closed"}</h1>
      <p className="mt-2 text-sm text-gray-600">The hold on {event.settings.terms.booth.toLowerCase()} {booth.label} was released.</p>
      <Link href={`/e/${event.slug}/reserve/${booth.id}`} className="mt-6 inline-block text-primary underline">Try again</Link>
    </main>
  );
  return (
    <main className="mx-auto max-w-lg px-4 py-10" style={{ ["--primary" as string]: event.settings.branding.primaryColor }}>
      <div className="mb-4 rounded-lg border border-yellow-300 bg-yellow-50 px-3 py-2 text-xs text-yellow-900">Test mode: this is Tessera&apos;s built-in mock checkout. Connect Stripe in Sales settings for real payments.</div>
      <h1 className="text-xl font-semibold">Checkout · {event.settings.terms.booth} {booth.label}</h1>
      <dl className="mt-4 space-y-1 rounded-xl border border-border bg-surface p-4 text-sm">
        <div className="flex justify-between"><dt>{booth.label} ({booth.areaM2} m²)</dt><dd>{formatMoney(order.amountCents, order.currency)}</dd></div>
        {order.taxCents > 0 && <div className="flex justify-between"><dt>Tax</dt><dd>{formatMoney(order.taxCents, order.currency)}</dd></div>}
        <div className="flex justify-between border-t border-border pt-2 font-semibold"><dt>Total</dt><dd>{formatMoney(order.amountCents + order.taxCents, order.currency)}</dd></div>
      </dl>
      <MockCheckout eventSlug={event.slug} orderId={order.id} boothId={booth.id} expiresAt={order.expiresAt} />
    </main>
  );
}

function Redirect({ to }: { to: string }) {
  return <meta httpEquiv="refresh" content={`0;url=${to}`} />;
}

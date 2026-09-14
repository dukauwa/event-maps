import { notFound } from "next/navigation";
import Link from "next/link";
import { db } from "@/lib/db";
import { findEventBySlugOrId } from "@/lib/bundle";
import { getOrder } from "@/lib/services/orders";
import { getBooth } from "@/lib/services/booths";
import { getExhibitor } from "@/lib/services/exhibitors";
import { formatMoney } from "@/lib/pricing";
import { Badge, statusTone } from "@/components/ui";

export default async function DonePage({ params, searchParams }: { params: Promise<{ slug: string; boothId: string }>; searchParams: Promise<Record<string, string | undefined>> }) {
  const { slug, boothId } = await params;
  const { order: orderId } = await searchParams;
  const event = findEventBySlugOrId(db(), slug);
  if (!event || !orderId) notFound();
  const order = getOrder(event.id, orderId);
  const booth = getBooth(event.id, boothId);
  if (!order || !booth) notFound();
  const exhibitor = order.exhibitorId ? getExhibitor(event.id, order.exhibitorId) : null;
  const paid = order.status === "paid";
  return (
    <main className="mx-auto max-w-lg px-4 py-16" style={{ ["--primary" as string]: event.settings.branding.primaryColor }}>
      <div className="rounded-2xl border border-border bg-surface p-6">
        <Badge tone={statusTone[order.status]}>{order.status.replace("_", " ")}</Badge>
        <h1 className="mt-3 text-2xl font-semibold">{paid ? `${event.settings.terms.booth} ${booth.label} is yours` : `${event.settings.terms.booth} ${booth.label}`}</h1>
        <p className="mt-2 text-sm text-gray-600">{paid ? `Payment of ${formatMoney(order.amountCents + order.taxCents, order.currency)} received. A confirmation was sent to ${order.contactEmail}.` : `Status: ${order.status}. Reference ${order.id}.`}</p>
        {exhibitor && (
          <div className="mt-6 rounded-xl bg-gray-50 p-4 text-sm">
            <p className="font-medium">Manage your listing</p>
            <p className="mt-1 text-gray-600">Add your logo, description and team so attendees find you. This link is private to {exhibitor.name}.</p>
            <Link href={`/x/${exhibitor.portalToken}`} className="mt-3 inline-flex h-10 items-center rounded-lg bg-primary px-4 text-sm font-medium text-white">Open exhibitor portal</Link>
          </div>
        )}
        <div className="mt-6 flex gap-4 text-sm">
          <Link href={`/e/${event.slug}?booth=${encodeURIComponent(booth.label)}`} className="text-primary underline">See it on the map</Link>
          {event.settings.websiteUrl && <a href={event.settings.websiteUrl} className="text-gray-600 underline">Event website</a>}
        </div>
      </div>
    </main>
  );
}

import { notFound } from "next/navigation";
import Link from "next/link";
import { db } from "@/lib/db";
import { findEventBySlugOrId, getViewerBundle } from "@/lib/bundle";
import { getBooth, releaseExpiredHolds } from "@/lib/services/booths";
import { quoteBooth } from "@/lib/services/orders";
import { formatMoney } from "@/lib/pricing";
import { BoothPreview } from "@/lib/portal/booth-preview";
import { ReserveForm } from "@/components/portal/reserve-form";
import { Badge, statusTone } from "@/components/ui";

export default async function ReservePage({ params, searchParams }: { params: Promise<{ slug: string; boothId: string }>; searchParams: Promise<Record<string, string | undefined>> }) {
  const { slug, boothId } = await params;
  const sp = await searchParams;
  const event = findEventBySlugOrId(db(), slug);
  if (!event) notFound();
  releaseExpiredHolds(event);
  const booth = getBooth(event.id, boothId);
  const bundle = getViewerBundle(db(), event.id, false) ?? getViewerBundle(db(), event.id, true);
  if (!booth || !bundle) notFound();
  const level = bundle.levels.find((l) => l.id === booth.levelId);
  const q = quoteBooth(event, booth.id);
  const s = event.settings;
  const canReserve = s.sales.enabled && s.features.allowReservation && (booth.status === "available" || s.sales.mode === "inquiry");
  const extras = bundle.extras.filter((x) => x.reserveOrBuyAllowed);
  return (
    <main className="mx-auto max-w-5xl px-4 py-8" style={{ ["--primary" as string]: s.branding.primaryColor }}>
      <div className="mb-6 flex items-center justify-between">
        <div>
          <p className="text-sm text-gray-500">{event.name}</p>
          <h1 className="text-2xl font-semibold">{s.terms.booth} {booth.label}{level ? <span className="ml-2 text-base font-normal text-gray-500">· {level.name}</span> : null}</h1>
        </div>
        <Link href={`/e/${event.slug}?booth=${encodeURIComponent(booth.label)}`} className="text-sm text-primary underline">View on the map</Link>
      </div>
      {sp.cancelled && <p className="mb-4 rounded-lg bg-yellow-50 p-3 text-sm text-yellow-800">Checkout was cancelled. Your hold is kept until it expires.</p>}
      <div className="grid gap-8 md:grid-cols-[minmax(0,1fr)_360px]">
        <div className="space-y-6">
          <div className="rounded-xl border border-border bg-surface p-5">
            <div className="flex flex-wrap items-center gap-3">
              <Badge tone={statusTone[booth.status]}>{booth.status}</Badge>
              <span className="text-sm text-gray-600">{booth.widthM && booth.heightM ? `${booth.widthM} × ${booth.heightM} m · ` : ""}{booth.areaM2} m² · {booth.boothType}</span>
            </div>
            <dl className="mt-4 grid grid-cols-2 gap-3 text-sm">
              <div><dt className="text-gray-500">Price</dt><dd className="text-lg font-semibold">{q.price ? formatMoney(q.price.priceCents, q.currency) : "On request"}</dd></div>
              {q.taxCents > 0 && <div><dt className="text-gray-500">Tax ({s.sales.taxPercent}%)</dt><dd>{formatMoney(q.taxCents, q.currency)}</dd></div>}
              {q.price && <div><dt className="text-gray-500">Total</dt><dd className="font-semibold">{formatMoney(q.totalCents, q.currency)}</dd></div>}
              <div><dt className="text-gray-500">Mode</dt><dd>{s.sales.mode === "buy" ? `Buy online (${s.sales.holdMinutes}-minute hold during checkout)` : s.sales.mode === "reserve" ? "Reserve now, the organiser confirms" : "Send an inquiry"}</dd></div>
            </dl>
            {s.sales.reserveInstructions && <p className="mt-4 text-sm text-gray-600">{s.sales.reserveInstructions}</p>}
          </div>
          {canReserve ? (
            <ReserveForm eventSlug={event.slug} boothId={booth.id} boothLabel={booth.label} mode={s.sales.mode} extras={extras.map((x) => ({ id: x.id, name: x.name, priceCents: x.priceCents ?? null, currency: x.currency, kind: x.kind }))} termsUrl={s.sales.termsUrl ?? null} defaults={{ company: sp.company ?? "", contactName: sp.name ?? "", contactEmail: sp.email ?? "" }} exhibitorId={sp.exhibitorId ?? null} />
          ) : (
            <div className="rounded-xl border border-border bg-surface p-5 text-sm text-gray-700">
              {booth.status !== "available" ? <p>This {s.terms.booth.toLowerCase()} is currently <strong>{booth.status}</strong>. Pick another one on the <Link className="text-primary underline" href={`/e/${event.slug}`}>map</Link>.</p> : <p>Online reservations are not enabled for this event. Contact the organiser{s.websiteUrl ? <> via <a className="text-primary underline" href={s.websiteUrl}>{s.websiteUrl}</a></> : null}.</p>}
            </div>
          )}
        </div>
        <aside className="space-y-3">
          <BoothPreview bundle={bundle} boothId={booth.id} size={360} accent={s.branding.primaryColor} />
          <p className="text-xs text-gray-500">Neighbouring {s.terms.booths.toLowerCase()} in grey; green ones are still available.</p>
        </aside>
      </div>
    </main>
  );
}

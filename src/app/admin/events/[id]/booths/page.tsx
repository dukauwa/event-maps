import type { Metadata } from "next";
import { db } from "@/lib/db";
import { buildBundle } from "@/lib/bundle";
import { listBooths } from "@/lib/services/booths";
import { listLevels } from "@/lib/services/levels";
import { listExhibitors } from "@/lib/services/exhibitors";
import { BoothsTable, type BoothRow } from "@/components/admin/booths-table";
import { loadEvent } from "../../../_lib";

export const metadata: Metadata = { title: "Booths" };

export default async function BoothsPage({ params, searchParams }: { params: Promise<{ id: string }>; searchParams: Promise<{ q?: string | string[] }> }) {
  const { id } = await params;
  const sp = await searchParams;
  const initialQuery = (Array.isArray(sp.q) ? sp.q[0] : sp.q) ?? "";
  const { event } = await loadEvent(id);
  const bundle = buildBundle(db(), event.id);
  const price = new Map((bundle?.booths ?? []).map((b) => [b.id, { priceCents: b.priceCents ?? null, currency: b.currency ?? null }]));
  const booths: BoothRow[] = listBooths(event.id).map((b) => ({
    id: b.id, label: b.label, levelId: b.levelId, boothType: b.boothType, status: b.status, priceCents: b.priceCents, currency: b.currency,
    resolvedPriceCents: price.get(b.id)?.priceCents ?? null, resolvedCurrency: price.get(b.id)?.currency ?? null,
    areaM2: b.areaM2, widthM: b.widthM, heightM: b.heightM, notes: b.notes, metadata: b.metadata ?? {}, labelHidden: b.labelHidden, exhibitorIds: b.exhibitorIds, holdUntil: b.holdUntil, externalId: b.externalId,
  }));
  const levels = listLevels(event.id).map((l) => ({ id: l.id, name: l.name, shortName: l.shortName }));
  const exhibitors = listExhibitors(event.id).map((e) => ({ id: e.id, name: e.name, boothLabels: e.boothLabels }));
  const t = event.settings.terms;
  return <BoothsTable event={{ id: event.id, name: event.name, currency: event.settings.sales.currency, timezone: event.timezone, terms: { booth: t.booth, booths: t.booths, exhibitor: t.exhibitor, exhibitors: t.exhibitors, level: t.level } }} booths={booths} levels={levels} exhibitors={exhibitors} initialQuery={initialQuery} />;
}

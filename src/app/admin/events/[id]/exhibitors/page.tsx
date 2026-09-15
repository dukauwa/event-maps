import type { Metadata } from "next";
import { listExhibitors } from "@/lib/services/exhibitors";
import { listCategories } from "@/lib/services/categories";
import { listBooths } from "@/lib/services/booths";
import { listLevels } from "@/lib/services/levels";
import { listExtras } from "@/lib/services/extras";
import { ExhibitorsTable, type ExhibitorRow } from "@/components/admin/exhibitors-table";
import { loadEvent } from "../../../_lib";

export const metadata: Metadata = { title: "Exhibitors" };

export default async function ExhibitorsPage({ params, searchParams }: { params: Promise<{ id: string }>; searchParams: Promise<{ q?: string | string[] }> }) {
  const { id } = await params;
  const sp = await searchParams;
  const initialQuery = (Array.isArray(sp.q) ? sp.q[0] : sp.q) ?? "";
  const { event } = await loadEvent(id);
  const exhibitors: ExhibitorRow[] = listExhibitors(event.id).map((e) => ({
    id: e.id, name: e.name, slug: e.slug, externalId: e.externalId, gripId: e.gripId, logoUrl: e.logoUrl, gallery: e.gallery ?? [], description: e.description, website: e.website, email: e.email, phone: e.phone,
    country: e.country, address: e.address, city: e.city, zip: e.zip, featured: e.featured, sponsorLevel: e.sponsorLevel ?? null, customButtonTitle: e.customButtonTitle, customButtonUrl: e.customButtonUrl, videoUrl: e.videoUrl,
    leadingImageUrl: e.leadingImageUrl, logoInBooth: e.logoInBooth, metadata: e.metadata ?? {}, socials: e.socials ?? {}, tags: e.tags ?? [], contactName: e.contactName, categoryIds: e.categoryIds, boothIds: e.boothIds, boothLabels: e.boothLabels,
  }));
  const t = event.settings.terms;
  return (
    <ExhibitorsTable
      event={{ id: event.id, name: event.name, terms: { booth: t.booth, booths: t.booths, exhibitor: t.exhibitor, exhibitors: t.exhibitors, level: t.level } }}
      exhibitors={exhibitors}
      initialQuery={initialQuery}
      categories={listCategories(event.id).map((c) => ({ id: c.id, name: c.name, color: c.color }))}
      booths={listBooths(event.id).map((b) => ({ id: b.id, label: b.label, levelId: b.levelId, status: b.status }))}
      levels={listLevels(event.id).map((l) => ({ id: l.id, name: l.name, shortName: l.shortName }))}
      extras={listExtras(event.id).map((x) => ({ id: x.id, name: x.name, kind: x.kind, priceCents: x.priceCents, currency: x.currency, limitPerExhibitor: x.limitPerExhibitor }))}
    />
  );
}

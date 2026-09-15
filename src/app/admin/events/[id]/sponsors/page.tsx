import type { Metadata } from "next";
import { listBanners } from "@/lib/services/banners";
import { listExhibitors } from "@/lib/services/exhibitors";
import { SponsorsManager } from "@/components/admin/sponsors-manager";
import { loadEvent } from "../../../_lib";

export const metadata: Metadata = { title: "Sponsorship & ads" };

export default async function SponsorsPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const { event } = await loadEvent(id);
  return (
    <SponsorsManager
      event={{ id: event.id, name: event.name, timezone: event.timezone, exhibitors: event.settings.terms.exhibitors }}
      banners={listBanners(event.id)}
      exhibitors={listExhibitors(event.id).map((e) => ({ id: e.id, name: e.name, logoUrl: e.logoUrl, featured: e.featured, sponsorLevel: e.sponsorLevel ?? null, boothLabels: e.boothLabels }))}
    />
  );
}

import type { Metadata } from "next";
import { db } from "@/lib/db";
import { buildBundle } from "@/lib/bundle";
import { analyticsSummary } from "@/lib/services/analytics";
import { AnalyticsView, type HeatLevel } from "@/components/admin/analytics-view";
import { loadEvent } from "../../../_lib";

export const metadata: Metadata = { title: "Analytics" };

export default async function AnalyticsPage({ params, searchParams }: { params: Promise<{ id: string }>; searchParams: Promise<{ from?: string | string[]; to?: string | string[] }> }) {
  const { id } = await params;
  const sp = await searchParams;
  const { event } = await loadEvent(id);
  const one = (v: string | string[] | undefined) => (Array.isArray(v) ? v[0] : v) ?? "";
  const valid = (v: string) => /^\d{4}-\d{2}-\d{2}$/.test(v) && !Number.isNaN(Date.parse(v));
  const toStr = valid(one(sp.to)) ? one(sp.to) : new Date().toISOString().slice(0, 10);
  const fromStr = valid(one(sp.from)) ? one(sp.from) : new Date(Date.parse(toStr) - 30 * 86400e3).toISOString().slice(0, 10);
  const summary = analyticsSummary(event.id, `${fromStr}T00:00:00.000Z`, `${toStr}T23:59:59.999Z`);
  const bundle = buildBundle(db(), event.id);
  const levels: HeatLevel[] = (bundle?.levels ?? []).map((l) => ({
    id: l.id, name: l.name, shortName: l.shortName, widthM: l.widthM, heightM: l.heightM,
    booths: (bundle?.booths ?? []).filter((b) => b.levelId === l.id).map((b) => ({ id: b.id, label: b.label, polygon: b.polygon, status: b.status })),
    outline: l.elements.filter((e) => e.kind === "wall" && e.geometry.type === "polyline").map((e) => (e.geometry.type === "polyline" ? e.geometry.points : [])),
  }));
  const bc = event.settings.branding.boothColors;
  return <AnalyticsView event={{ id: event.id, name: event.name, slug: event.slug, timezone: event.timezone, boothColors: { available: bc.available, held: bc.held, reserved: bc.reserved, sold: bc.sold, unavailable: bc.unavailable } }} summary={summary} levels={levels} from={fromStr} to={toStr} />;
}

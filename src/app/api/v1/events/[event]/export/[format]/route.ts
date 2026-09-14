import { NextResponse } from "next/server";
import { CORS_HEADERS, badRequest, optionsResponse, requireEvent, withApi } from "@/lib/api/http";
import { buildBundle, getPublishedBundle } from "@/lib/bundle";
import { db } from "@/lib/db";
import { toExpoFpData } from "@/lib/export/expofp";
import { bundleToGeoJson, exportBoothsCsv, exportExhibitorsCsv } from "@/lib/services/import-export";

export const OPTIONS = () => optionsResponse();
/**
 * Exports: `expofp` (ExpoFP-compatible data.json), `geojson`, `booths.csv`, `exhibitors.csv`,
 * `offline` (self-contained JSON bundle with version for offline/mobile use), `bundle`.
 */
export const GET = withApi(async (req: Request, ctx: { params: Promise<{ event: string; format: string }> }) => {
  const { event: slug, format } = await ctx.params;
  const { event } = await requireEvent(req, slug);
  const bundle = getPublishedBundle(db(), event.id) ?? buildBundle(db(), event.id)!;
  const file = (body: string, type: string, name: string) => new NextResponse(body, { headers: { ...CORS_HEADERS, "Content-Type": type, "Content-Disposition": `attachment; filename="${event.slug}-${name}"` } });
  switch (format) {
    case "expofp": return NextResponse.json(toExpoFpData(bundle), { headers: CORS_HEADERS });
    case "geojson": return file(JSON.stringify(bundleToGeoJson(bundle)), "application/geo+json", "floorplan.geojson");
    case "booths.csv": return file(exportBoothsCsv(event), "text/csv; charset=utf-8", "booths.csv");
    case "exhibitors.csv": return file(exportExhibitorsCsv(event), "text/csv; charset=utf-8", "exhibitors.csv");
    case "bundle": return NextResponse.json(bundle, { headers: CORS_HEADERS });
    case "offline": return file(JSON.stringify({ format: "tessera.offline", version: bundle.version, generatedAt: new Date().toISOString(), viewerUrl: `/e/${event.slug}`, bundle }), "application/json", `offline-v${bundle.version}.json`);
    default: throw badRequest(`Unknown export format '${format}'. Use expofp, geojson, booths.csv, exhibitors.csv, bundle or offline.`);
  }
});

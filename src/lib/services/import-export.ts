import { z } from "zod";
import { db, schema } from "@/lib/db";
import { eq } from "drizzle-orm";
import { rectPolygon } from "@/lib/domain/geometry";
import { planToLngLat, syntheticGeoref } from "@/lib/domain/geometry";
import { BOOTH_STATUSES, BOOTH_TYPES, type BoothStatus, type BoothType, type PlanBundle } from "@/lib/domain/types";
import { parseCsv, toCsv, col } from "./csv";
import { bulkUpsertBooths, listBooths, type BoothInput } from "./booths";
import { bulkUpsertExhibitors, listExhibitors, type ExhibitorInput } from "./exhibitors";
import { ensureCategory } from "./categories";
import { bulkUpsertSessions, type SessionInput } from "./sessions";
import type { Event } from "@/lib/db/schema";

/** CSV columns: label|booth|name, level (shortName), x, y, width|w, height|h, type, status, price, external_id, notes. */
export function importBoothsCsv(ev: Event, csvText: string) {
  const rows = parseCsv(csvText);
  const levels = db().select().from(schema.levels).where(eq(schema.levels.eventId, ev.id)).all();
  const items: BoothInput[] = [];
  const errors: { index: number; error: string }[] = [];
  rows.forEach((r, index) => {
    const label = col(r, "label", "booth", "name", "stand", "booth_number");
    const lvl = col(r, "level", "floor", "hall");
    const level = lvl ? levels.find((l) => l.shortName.toLowerCase() === lvl.toLowerCase() || l.name.toLowerCase() === lvl.toLowerCase()) : levels[0];
    const x = Number(col(r, "x", "left")), y = Number(col(r, "y", "top")), w = Number(col(r, "width", "w") ?? 3), h = Number(col(r, "height", "h", "depth") ?? 3);
    if (!label || !level || Number.isNaN(x) || Number.isNaN(y)) { errors.push({ index, error: "Missing label/level/x/y" }); return; }
    const type = (col(r, "type", "booth_type") ?? "standard").toLowerCase() as BoothType;
    const status = (col(r, "status") ?? "available").toLowerCase() as BoothStatus;
    const priceRaw = col(r, "price", "price_cents");
    items.push({
      label, levelId: level.id, externalId: col(r, "external_id", "externalid", "id") ?? null,
      polygon: rectPolygon(x, y, w, h, Number(col(r, "rotation") ?? 0)),
      boothType: BOOTH_TYPES.includes(type) ? type : "standard", status: BOOTH_STATUSES.includes(status) ? status : "available",
      priceCents: priceRaw ? Math.round(Number(priceRaw.replace(/[^0-9.]/g, "")) * (r.price_cents ? 1 : 100)) : null, notes: col(r, "notes", "admin_notes") ?? null,
    });
  });
  const result = bulkUpsertBooths(ev, items);
  return { ...result, errors: [...errors, ...result.errors], parsed: rows.length };
}

/** ExpoFP-compatible exhibitor template: Exhibitor ID, name, description, address, booth(s), category, phone, email, website, socials, contact, logo URL, tags, featured. */
export function importExhibitorsCsv(ev: Event, csvText: string) {
  const rows = parseCsv(csvText);
  const items: ExhibitorInput[] = [];
  const errors: { index: number; error: string }[] = [];
  rows.forEach((r, index) => {
    const name = col(r, "name", "company", "exhibitor", "exhibitor_name");
    if (!name) { errors.push({ index, error: "Missing name" }); return; }
    const cats = (col(r, "category", "categories") ?? "").split(/[;,|]/).map((s) => s.trim()).filter(Boolean).map((c) => ensureCategory(ev.id, c));
    const booths = (col(r, "booth", "booths", "stand", "booth_s") ?? "").split(/[;,|]/).map((s) => s.trim()).filter(Boolean);
    const socials: Record<string, string> = {};
    for (const k of ["facebook", "instagram", "linkedin", "twitter", "x", "youtube", "tiktok"]) if (r[k]) socials[k === "twitter" ? "x" : k] = r[k];
    items.push({
      name, externalId: col(r, "exhibitor_id", "external_id", "id") ?? null, gripId: col(r, "grip_id") ?? null, description: col(r, "description") ?? null,
      address: col(r, "address") ?? null, city: col(r, "city") ?? null, country: col(r, "country") ?? null, zip: col(r, "zip", "postcode", "postal_code") ?? null,
      phone: col(r, "phone") ?? null, email: col(r, "email") ?? null, website: col(r, "website", "url") ?? null, logoUrl: col(r, "logo", "logo_url") ?? null,
      contactName: col(r, "contact_name", "contact") ?? null, featured: /^(1|true|yes)$/i.test(col(r, "featured") ?? ""), tags: (col(r, "tags") ?? "").split(/[;,|]/).map((s) => s.trim()).filter(Boolean),
      videoUrl: col(r, "video", "video_url") ?? null, socials, categoryIds: cats, boothLabels: booths,
    });
  });
  const result = bulkUpsertExhibitors(ev, items);
  return { ...result, errors: [...errors, ...result.errors], parsed: rows.length };
}

export function importSessionsCsv(ev: Event, csvText: string) {
  const rows = parseCsv(csvText);
  const items: SessionInput[] = [];
  const errors: { index: number; error: string }[] = [];
  rows.forEach((r, index) => {
    const title = col(r, "title", "name", "session");
    const startsAt = col(r, "starts_at", "start", "start_date", "startdate"), endsAt = col(r, "ends_at", "end", "end_date", "enddate");
    if (!title || !startsAt || !endsAt) { errors.push({ index, error: "Missing title/start/end" }); return; }
    items.push({ title, startsAt, endsAt, externalId: col(r, "external_id", "id") ?? null, description: col(r, "description") ?? null, track: col(r, "track") ?? null, boothLabel: col(r, "booth") ?? null, locationName: col(r, "location", "room", "stage") ?? null, url: col(r, "url") ?? null, speakers: (col(r, "speakers") ?? "").split(/[;|]/).map((s) => s.trim()).filter(Boolean).map((name) => ({ name })) });
  });
  const result = bulkUpsertSessions(ev, items);
  return { ...result, errors: [...errors, ...result.errors], parsed: rows.length };
}

export function exportBoothsCsv(ev: Event) {
  const levels = new Map(db().select().from(schema.levels).where(eq(schema.levels.eventId, ev.id)).all().map((l) => [l.id, l.shortName]));
  const exNames = new Map(db().select({ id: schema.exhibitors.id, name: schema.exhibitors.name }).from(schema.exhibitors).where(eq(schema.exhibitors.eventId, ev.id)).all().map((e) => [e.id, e.name]));
  return toCsv(listBooths(ev.id).map((b) => ({
    label: b.label, level: levels.get(b.levelId), external_id: b.externalId, type: b.boothType, status: b.status, x: b.polygon[0][0], y: b.polygon[0][1], width: b.widthM, height: b.heightM, area_m2: b.areaM2,
    price: b.priceCents != null ? b.priceCents / 100 : "", currency: b.currency, exhibitors: b.exhibitorIds.map((id) => exNames.get(id)).join("; "), notes: b.notes,
  })), ["label", "level", "external_id", "type", "status", "x", "y", "width", "height", "area_m2", "price", "currency", "exhibitors", "notes"]);
}

export function exportExhibitorsCsv(ev: Event) {
  const cats = new Map(db().select().from(schema.categories).where(eq(schema.categories.eventId, ev.id)).all().map((c) => [c.id, c.name]));
  return toCsv(listExhibitors(ev.id).map((e) => ({
    exhibitor_id: e.externalId, grip_id: e.gripId, name: e.name, booths: e.boothLabels.join("; "), categories: e.categoryIds.map((c) => cats.get(c)).join("; "), description: e.description, address: e.address, city: e.city, zip: e.zip, country: e.country,
    phone: e.phone, email: e.email, website: e.website, contact_name: e.contactName, featured: e.featured, sponsor_level: e.sponsorLevel, tags: e.tags.join("; "), logo_url: e.logoUrl?.startsWith("data:") ? "(inline)" : e.logoUrl, linkedin: e.socials.linkedin, x: e.socials.x, portal_link: `/x/${e.portalToken}`,
  })));
}

/** GeoJSON export: booths, elements and wayfinding as features in WGS84 (synthetic georef when the level has none). */
export function bundleToGeoJson(bundle: PlanBundle) {
  const features: unknown[] = [];
  for (const level of bundle.levels) {
    const g = level.georef ?? syntheticGeoref();
    const toLL = (p: [number, number]) => planToLngLat(p, g);
    for (const b of bundle.booths.filter((x) => x.levelId === level.id)) {
      const ex = b.exhibitorIds.map((id) => bundle.exhibitors.find((e) => e.id === id)?.name).filter(Boolean);
      features.push({ type: "Feature", id: b.id, geometry: { type: "Polygon", coordinates: [[...b.polygon.map(toLL), toLL(b.polygon[0])]] }, properties: { kind: "booth", id: b.id, label: b.label, level: level.shortName, levelId: level.id, status: b.status, boothType: b.boothType, areaM2: b.areaM2, exhibitors: ex, priceCents: b.priceCents, currency: b.currency } });
    }
    for (const el of level.elements) {
      const geom = el.geometry.type === "point" ? { type: "Point", coordinates: toLL(el.geometry.point) } : el.geometry.type === "polyline" ? { type: "LineString", coordinates: el.geometry.points.map(toLL) } : { type: "Polygon", coordinates: [[...el.geometry.points.map(toLL), toLL(el.geometry.points[0])]] };
      features.push({ type: "Feature", id: el.id, geometry: geom, properties: { kind: el.kind, level: level.shortName, levelId: level.id, ...el.props } });
    }
    const nodes = new Map(bundle.wayfinding.nodes.filter((n) => n.levelId === level.id).map((n) => [n.id, n]));
    for (const e of bundle.wayfinding.edges) {
      const a = nodes.get(e.from), b = nodes.get(e.to);
      if (!a || !b) continue;
      features.push({ type: "Feature", id: e.id, geometry: { type: "LineString", coordinates: [toLL([a.x, a.y]), toLL([b.x, b.y])] }, properties: { kind: "way", level: level.shortName, levelId: level.id, accessible: e.accessible, oneWay: e.oneWay, virtual: e.virtual, weight: e.weight } });
    }
  }
  return { type: "FeatureCollection", features };
}

export const csvImportInput = z.object({ csv: z.string().min(1).max(20_000_000) });

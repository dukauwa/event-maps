import { eq, asc, desc } from "drizzle-orm";
import type { DB } from "@/lib/db";
import * as schema from "@/lib/db/schema";
import { newId } from "@/lib/ids";
import { polygonArea, polygonCentroid, round } from "@/lib/domain/geometry";
import { resolveBoothPrice } from "@/lib/pricing";
import type { BundleBooth, BundleExhibitor, EventSettings, PlanBundle } from "@/lib/domain/types";

/** Settings safe to expose publicly (strips integration secrets and internal notification addresses). */
export function publicSettings(s: EventSettings): EventSettings {
  const { grip, sales, ...rest } = s;
  const { notifyEmail: _n, ...publicSales } = sales;
  void _n; void grip;
  return { ...rest, sales: publicSales } as EventSettings;
}

/** Build the live bundle straight from the database (what the editor and preview use). */
export function buildBundle(d: DB, eventId: string): PlanBundle | null {
  const ev = d.select().from(schema.events).where(eq(schema.events.id, eventId)).get();
  if (!ev) return null;

  const levels = d.select().from(schema.levels).where(eq(schema.levels.eventId, eventId)).orderBy(asc(schema.levels.sortIndex)).all();
  const elements = d.select().from(schema.elements).where(eq(schema.elements.eventId, eventId)).orderBy(asc(schema.elements.sortIndex)).all();
  const booths = d.select().from(schema.booths).where(eq(schema.booths.eventId, eventId)).orderBy(asc(schema.booths.sortIndex), asc(schema.booths.label)).all();
  const exhibitors = d.select().from(schema.exhibitors).where(eq(schema.exhibitors.eventId, eventId)).orderBy(asc(schema.exhibitors.name)).all();
  const categories = d.select().from(schema.categories).where(eq(schema.categories.eventId, eventId)).orderBy(asc(schema.categories.sortIndex), asc(schema.categories.name)).all();
  const sessions = d.select().from(schema.sessions).where(eq(schema.sessions.eventId, eventId)).orderBy(asc(schema.sessions.startsAt)).all();
  const nodes = d.select().from(schema.wayNodes).where(eq(schema.wayNodes.eventId, eventId)).all();
  const edges = d.select().from(schema.wayEdges).where(eq(schema.wayEdges.eventId, eventId)).all();
  const transitions = d.select().from(schema.transitions).where(eq(schema.transitions.eventId, eventId)).all();
  const banners = d.select().from(schema.banners).where(eq(schema.banners.eventId, eventId)).all();
  const rules = d.select().from(schema.pricingRules).where(eq(schema.pricingRules.eventId, eventId)).all();

  const boothIds = new Set(booths.map((b) => b.id));
  const exIds = new Set(exhibitors.map((e) => e.id));
  const be = d.select().from(schema.boothExhibitors).all().filter((r) => boothIds.has(r.boothId) && exIds.has(r.exhibitorId));
  const ec = d.select().from(schema.exhibitorCategories).all().filter((r) => exIds.has(r.exhibitorId));

  const boothToEx = new Map<string, string[]>();
  const exToBooth = new Map<string, string[]>();
  for (const r of be.sort((a, b) => a.sortIndex - b.sortIndex)) {
    boothToEx.set(r.boothId, [...(boothToEx.get(r.boothId) ?? []), r.exhibitorId]);
    exToBooth.set(r.exhibitorId, [...(exToBooth.get(r.exhibitorId) ?? []), r.boothId]);
  }
  const exToCat = new Map<string, string[]>();
  for (const r of ec) exToCat.set(r.exhibitorId, [...(exToCat.get(r.exhibitorId) ?? []), r.categoryId]);
  const boothLabel = new Map(booths.map((b) => [b.id, b.label]));

  const settings = ev.settings;
  const bundleBooths: BundleBooth[] = booths.map((b) => {
    const area = b.areaM2 || round(polygonArea(b.polygon), 2);
    const price = settings.features.showPrices || settings.sales.enabled ? resolveBoothPrice({ ...b, areaM2: area }, rules, settings) : null;
    return {
      id: b.id,
      levelId: b.levelId,
      label: b.label,
      externalId: b.externalId,
      polygon: b.polygon,
      center: polygonCentroid(b.polygon).map((n) => round(n, 3)) as [number, number],
      boothType: b.boothType,
      status: b.status,
      priceCents: price?.priceCents ?? null,
      currency: price?.currency ?? null,
      areaM2: area,
      widthM: b.widthM,
      heightM: b.heightM,
      rotationDeg: b.rotationDeg,
      colors: b.colors ?? null,
      labelHidden: b.labelHidden,
      exhibitorIds: boothToEx.get(b.id) ?? [],
      height3d: b.height3d,
    };
  });

  const bundleExhibitors: BundleExhibitor[] = exhibitors.map((e) => {
    const bIds = exToBooth.get(e.id) ?? [];
    return {
      id: e.id,
      externalId: e.externalId,
      gripId: e.gripId,
      name: e.name,
      slug: e.slug,
      logoUrl: e.logoUrl,
      gallery: e.gallery ?? [],
      description: e.description,
      website: e.website,
      email: e.email,
      phone: e.phone,
      country: e.country,
      address: e.address,
      city: e.city,
      zip: e.zip,
      featured: e.featured,
      sponsorLevel: e.sponsorLevel ?? null,
      customButtonTitle: e.customButtonTitle,
      customButtonUrl: e.customButtonUrl,
      videoUrl: e.videoUrl,
      socials: e.socials ?? {},
      tags: e.tags ?? [],
      categoryIds: exToCat.get(e.id) ?? [],
      boothIds: bIds,
      boothLabels: bIds.map((id) => boothLabel.get(id)!).filter(Boolean),
    };
  });

  return {
    format: "tessera.bundle",
    formatVersion: 1,
    version: ev.publishedVersion,
    generatedAt: new Date().toISOString(),
    event: {
      id: ev.id,
      slug: ev.slug,
      name: ev.name,
      subtitle: ev.subtitle,
      description: ev.description,
      startsAt: ev.startsAt,
      endsAt: ev.endsAt,
      timezone: ev.timezone,
      venue: { name: ev.venueName, address: ev.venueAddress, lat: ev.venueLat, lng: ev.venueLng },
      status: ev.status,
      settings: publicSettings(settings),
    },
    levels: levels.map((l) => ({
      id: l.id,
      name: l.name,
      shortName: l.shortName,
      sortIndex: l.sortIndex,
      widthM: l.widthM,
      heightM: l.heightM,
      background: l.background ?? null,
      georef: l.georef ?? null,
      elements: elements.filter((el) => el.levelId === l.id).map((el) => ({
        id: el.id, levelId: el.levelId, kind: el.kind, geometry: el.geometry, props: el.props ?? {}, sortIndex: el.sortIndex,
      })),
    })),
    booths: bundleBooths,
    exhibitors: bundleExhibitors,
    categories: categories.map((c) => ({ id: c.id, name: c.name, color: c.color, parentId: c.parentId, sortIndex: c.sortIndex })),
    sessions: sessions.map((s) => ({
      id: s.id, externalId: s.externalId, title: s.title, description: s.description, startsAt: s.startsAt, endsAt: s.endsAt,
      boothId: s.boothId, elementId: s.elementId, speakers: s.speakers ?? [], track: s.track, url: s.url,
    })),
    wayfinding: {
      nodes: nodes.map((n) => ({ id: n.id, levelId: n.levelId, x: n.x, y: n.y })),
      edges: edges.map((e) => ({ id: e.id, from: e.fromNodeId, to: e.toNodeId, accessible: e.accessible, oneWay: e.oneWay, virtual: e.virtual, weight: e.weight })),
      transitions: transitions.map((t) => ({ id: t.id, name: t.name, kind: t.kind, accessible: t.accessible, nodeIds: t.nodeIds, travelSeconds: t.travelSeconds })),
    },
    banners: banners
      .filter((b) => b.active && (!b.startsAt || b.startsAt <= new Date().toISOString()) && (!b.endsAt || b.endsAt >= new Date().toISOString()))
      .map((b) => ({ id: b.id, exhibitorId: b.exhibitorId, placement: b.placement, title: b.title, imageUrl: b.imageUrl, linkUrl: b.linkUrl, weight: b.weight })),
  };
}

/** Snapshot the live bundle as a new published version. */
export function publishEvent(d: DB, eventId: string, note?: string): { version: number } | null {
  const ev = d.select().from(schema.events).where(eq(schema.events.id, eventId)).get();
  if (!ev) return null;
  const version = ev.publishedVersion + 1;
  const now = new Date().toISOString();
  d.update(schema.events).set({ publishedVersion: version, publishedAt: now, status: "published", updatedAt: now }).where(eq(schema.events.id, eventId)).run();
  const bundle = buildBundle(d, eventId)!;
  bundle.version = version;
  d.insert(schema.floorplanVersions).values({ id: newId("fv"), eventId, version, bundle, note: note ?? null }).run();
  return { version };
}

/** Latest published bundle, or null if never published. */
export function getPublishedBundle(d: DB, eventId: string): PlanBundle | null {
  const row = d.select().from(schema.floorplanVersions).where(eq(schema.floorplanVersions.eventId, eventId)).orderBy(desc(schema.floorplanVersions.version)).get();
  return (row?.bundle as PlanBundle | undefined) ?? null;
}

/** Bundle for the public viewer: published snapshot, or live data when `preview` is set. */
export function getViewerBundle(d: DB, eventId: string, preview = false): PlanBundle | null {
  if (preview) return buildBundle(d, eventId);
  return getPublishedBundle(d, eventId) ?? null;
}

export function findEventBySlugOrId(d: DB, slugOrId: string) {
  return (
    d.select().from(schema.events).where(eq(schema.events.slug, slugOrId)).get() ??
    d.select().from(schema.events).where(eq(schema.events.id, slugOrId)).get() ??
    null
  );
}

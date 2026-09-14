import type { PlanBundle } from "@/lib/domain/types";
import { POI_TYPES } from "@/lib/domain/types";

/** Stable 31-bit integer from a string (FNV-1a), so ExpoFP-style numeric ids are deterministic. */
export function intId(s: string): number {
  let h = 0x811c9dc5;
  for (let i = 0; i < s.length; i++) {
    h ^= s.charCodeAt(i);
    h = Math.imul(h, 0x01000193);
  }
  return (h >>> 0) & 0x7fffffff;
}

/**
 * Export a bundle in the same JSON shape ExpoFP serves at `https://<event>.expofp.com/data/data.json`,
 * so integrations written against ExpoFP keep working (field names verified against the live demo).
 */
export function toExpoFpData(bundle: PlanBundle) {
  const s = bundle.event.settings;
  const levelById = new Map(bundle.levels.map((l) => [l.id, l]));
  const catInt = new Map(bundle.categories.map((c) => [c.id, intId(c.id)]));
  const exInt = new Map(bundle.exhibitors.map((e) => [e.id, intId(e.id)]));
  const boothInt = new Map(bundle.booths.map((b) => [b.id, intId(b.id)]));
  const poiTypes = POI_TYPES.map((p, i) => ({ id: i + 1, name: p.replace(/_/g, " ").replace(/\b\w/g, (m) => m.toUpperCase()) }));

  return {
    title: bundle.event.name,
    subtitle: bundle.event.subtitle ?? "",
    logo: s.branding.logoUrl ?? "",
    reserveInstructions: s.sales.reserveInstructions ?? "",
    boothTerm: s.terms.booth,
    boothTermPlural: s.terms.booths,
    reserveButtonTerm: s.terms.reserveButton,
    levelTerm: s.terms.level,
    registerUrl: s.registerUrl ?? "",
    locale: s.locale,
    trackerUrl: "",
    showCompaniesAndBooths: s.features.exhibitorList,
    showOtherSpaces: true,
    allow3dView: s.features.threeD,
    autoTrackingGps: s.features.gps,
    hide3dMapDefault: true,
    showLevelLabel: bundle.levels.length > 1,
    exhibitorTerm: s.terms.exhibitor,
    exhibitorTermPlural: s.terms.exhibitors,
    enableIPS: false,
    shortLevelName: true,
    exhibitors: bundle.exhibitors.map((e) => ({
      id: exInt.get(e.id)!,
      key: e.id,
      externalId: e.externalId ?? "",
      name: e.name,
      logo: e.logoUrl ?? "",
      gallery: e.gallery,
      description: e.description ?? "",
      featured: e.featured,
      advertise: !!e.sponsorLevel,
      categories: e.categoryIds.map((c) => catInt.get(c)!).filter(Boolean),
      country: e.country ?? "",
      address: e.address ?? "",
      address2: "",
      city: e.city ?? "",
      zip: e.zip ?? "",
      phone1: e.phone ?? "",
      email: e.email ?? "",
      customButtonTitle: e.customButtonTitle ?? "",
      customButtonUrl: e.customButtonUrl ?? "",
      leadingImageUrl: e.leadingImageUrl ?? e.gallery[0] ?? "",
      logoInBooth: e.logoInBooth,
      videoUrl: e.videoUrl ?? "",
      website: e.website ?? "",
      booths: e.boothLabels,
    })),
    booths: bundle.booths.map((b) => ({
      id: boothInt.get(b.id)!,
      key: b.id,
      name: b.label,
      externalId: b.externalId ?? "",
      exhibitors: b.exhibitorIds.map((e) => exInt.get(e)!).filter(Boolean),
      size: b.widthM && b.heightM ? `${trim(b.widthM)}x${trim(b.heightM)}` : `${trim(b.areaM2)} m²`,
      status: b.status,
      level: levelById.get(b.levelId)?.shortName ?? "",
      price: b.priceCents != null ? b.priceCents / 100 : null,
      currency: b.currency ?? null,
    })),
    categories: bundle.categories.map((c) => ({ id: catInt.get(c.id)!, key: c.id, name: c.name })),
    poiTypes,
    events: bundle.sessions.map((se) => ({
      id: intId(se.id),
      key: se.id,
      externalId: se.externalId ?? "",
      boothId: se.boothId ? boothInt.get(se.boothId) ?? null : null,
      name: se.title,
      description: se.description ?? "",
      startDate: se.startsAt,
      endDate: se.endsAt,
    })),
  };
}

function trim(n: number): string {
  return Number.isInteger(n) ? String(n) : n.toFixed(1);
}

import { beforeAll, afterAll, describe, expect, it } from "vitest";
import { openTestDb, setDb, db, schema } from "@/lib/db";
import { seedDemo, DEMO } from "@/lib/seed/demo";
import { buildBundle, publishEvent, getPublishedBundle, findEventBySlugOrId } from "@/lib/bundle";
import { toExpoFpData } from "@/lib/export/expofp";
import { createBooth, getBooth, listBooths, mergeBooths, setBoothStatus, assignExhibitor, releaseExpiredHolds } from "@/lib/services/booths";
import { createExhibitor, getExhibitor, listExhibitors, bulkUpsertExhibitors } from "@/lib/services/exhibitors";
import { reserveBooth, markOrderPaid, cancelOrder, expireOrders, salesSummary, getOrder } from "@/lib/services/orders";
import { importExhibitorsCsv, importBoothsCsv, exportBoothsCsv, bundleToGeoJson } from "@/lib/services/import-export";
import { replaceLevelGraph, getWayfinding } from "@/lib/services/wayfinding";
import { analyticsSummary, ingestAnalytics } from "@/lib/services/analytics";
import { duplicateEvent, updateEvent } from "@/lib/services/events";
import { assignExtra, listExtras } from "@/lib/services/extras";
import { rectPolygon } from "@/lib/domain/geometry";
import { eq } from "drizzle-orm";
import type { Event } from "@/lib/db/schema";

let ev: Event;
beforeAll(() => {
  process.env.AUTO_SEED = "0";
  setDb(openTestDb());
  const r = seedDemo(db());
  publishEvent(db(), r.eventId, "test");
  ev = findEventBySlugOrId(db(), DEMO.eventSlug)!;
});
afterAll(() => setDb(undefined));

describe("bundle", () => {
  it("builds a bundle with all sections", () => {
    const b = buildBundle(db(), ev.id)!;
    expect(b.levels.length).toBe(2);
    expect(b.booths.length).toBeGreaterThan(250);
    expect(b.exhibitors.length).toBeGreaterThan(200);
    expect(b.wayfinding.edges.length).toBeGreaterThan(50);
    expect(b.wayfinding.transitions.length).toBe(2);
    expect(b.extras.length).toBe(4);
    expect(b.booths.every((x) => x.center.length === 2 && x.areaM2 > 0)).toBe(true);
    expect(b.event.settings.sales).not.toHaveProperty("notifyEmail");
    expect(b.event.settings).not.toHaveProperty("grip");
  });
  it("publishes immutable snapshots", () => {
    const before = getPublishedBundle(db(), ev.id)!;
    const booth = listBooths(ev.id, { status: "available" })[0];
    setBoothStatus(ev, booth.id, "unavailable");
    expect(getPublishedBundle(db(), ev.id)!.booths.find((x) => x.id === booth.id)!.status).toBe(before.booths.find((x) => x.id === booth.id)!.status);
    const r = publishEvent(db(), ev.id)!;
    expect(r.version).toBe(2);
    expect(getPublishedBundle(db(), ev.id)!.booths.find((x) => x.id === booth.id)!.status).toBe("unavailable");
    setBoothStatus(ev, booth.id, "available");
  });
  it("exports ExpoFP-compatible data.json", () => {
    const d = toExpoFpData(buildBundle(db(), ev.id)!);
    for (const k of ["title", "boothTerm", "boothTermPlural", "exhibitorTerm", "levelTerm", "locale", "exhibitors", "booths", "categories", "poiTypes", "events"]) expect(d).toHaveProperty(k);
    const ex = d.exhibitors[0];
    for (const k of ["id", "externalId", "name", "logo", "gallery", "description", "featured", "advertise", "categories", "country", "address", "city", "zip", "phone1", "email", "customButtonTitle", "customButtonUrl", "leadingImageUrl", "videoUrl"]) expect(ex).toHaveProperty(k);
    expect(typeof ex.id).toBe("number");
    expect(d.booths[0]).toMatchObject({ id: expect.any(Number), name: expect.any(String), exhibitors: expect.any(Array), size: expect.any(String) });
    expect(d.events[0]).toMatchObject({ name: expect.any(String), startDate: expect.any(String), endDate: expect.any(String) });
  });
  it("exports GeoJSON in WGS84", () => {
    const g = bundleToGeoJson(buildBundle(db(), ev.id)!) as unknown as { features: { geometry: { coordinates: unknown }; properties: { kind: string } }[] };
    expect(g.features.length).toBeGreaterThan(300);
    const poly = g.features.find((f) => f.properties.kind === "booth")!;
    const ring = (poly.geometry.coordinates as number[][][])[0];
    expect(ring[0][0]).toBeCloseTo(0.03, 1);
    expect(ring[0][1]).toBeCloseTo(51.5, 1);
  });
});

describe("booths + exhibitors", () => {
  it("creates, merges and assigns booths", () => {
    const level = buildBundle(db(), ev.id)!.levels[0];
    const a = createBooth(ev, { label: "Z01", levelId: level.id, polygon: rectPolygon(0, 0, 4, 4) });
    const b = createBooth(ev, { label: "Z02", levelId: level.id, polygon: rectPolygon(4, 0, 4, 4) });
    expect(a.areaM2).toBe(16);
    expect(a.widthM).toBe(4);
    expect(() => createBooth(ev, { label: "Z01", levelId: level.id, polygon: rectPolygon(0, 0, 1, 1) })).toThrow(/already exists/);
    const merged = mergeBooths(ev, [a.id, b.id]);
    expect(merged.label).toBe("Z01");
    expect(merged.areaM2).toBe(32);
    expect(getBooth(ev.id, b.id)).toBeNull();
    const ex = createExhibitor(ev, { name: "Test Co", email: "t@example.com", boothLabels: ["Z01"] });
    expect(ex.boothLabels).toEqual(["Z01"]);
    assignExhibitor(ev, merged.id, ex.id, { markSold: true });
    expect(getBooth(ev.id, "Z01")!.status).toBe("sold");
    expect(getExhibitor(ev.id, ex.slug)!.id).toBe(ex.id);
  });
  it("upserts exhibitors by externalId and imports CSV", () => {
    const r1 = bulkUpsertExhibitors(ev, [{ name: "Up Co", externalId: "crm-x1" }, { name: "Up Co renamed", externalId: "crm-x1" }]);
    expect(r1).toMatchObject({ created: 1, updated: 1 });
    expect(getExhibitor(ev.id, "crm-x1")!.name).toBe("Up Co renamed");
    const [l1, l2] = listBooths(ev.id).filter((b) => b.label.startsWith("C")).map((b) => b.label);
    const csv = `Exhibitor ID,Name,Booth(s),Category,Website,Featured\ncsv-1,CSV Corp,${l1}; ${l2},AI & Data; New/Sub,https://csv.example,yes\n`;
    const r2 = importExhibitorsCsv(ev, csv);
    expect(r2.created).toBe(1);
    const e = getExhibitor(ev.id, "csv-1")!;
    expect(e.boothLabels.sort()).toEqual([l1, l2].sort());
    expect(e.categoryIds.length).toBe(2);
    expect(e.featured).toBe(true);
  });
  it("imports booths from CSV and exports them", () => {
    const r = importBoothsCsv(ev, "label,level,x,y,width,height,type,price\nQ1,L2,100,70,2,2,table,1500\n");
    expect(r.created).toBe(1);
    const q = getBooth(ev.id, "Q1")!;
    expect(q.priceCents).toBe(150000);
    expect(exportBoothsCsv(ev)).toContain("Q1,L2");
  });
});

describe("orders", () => {
  it("holds, pays and expires", () => {
    const booth = listBooths(ev.id, { status: "available" }).find((b) => b.boothType === "standard")!;
    const { order, checkoutUrl } = reserveBooth(ev, { boothId: booth.id, company: "Buyer Ltd", contactName: "B", contactEmail: "b@example.com" }, "http://localhost:3000");
    expect(order.status).toBe("hold");
    expect(order.amountCents).toBeGreaterThan(0);
    expect(checkoutUrl).toContain("/reserve/");
    expect(getBooth(ev.id, booth.id)!.status).toBe("held");
    expect(() => reserveBooth(ev, { boothId: booth.id, company: "X", contactName: "X", contactEmail: "x@example.com" }, "http://x")).toThrow(/held/);
    markOrderPaid(ev, order.id, "pi_test");
    const b = getBooth(ev.id, booth.id)!;
    expect(b.status).toBe("sold");
    expect(b.exhibitorIds.length).toBe(1);
    expect(getOrder(ev.id, order.id)!.status).toBe("paid");

    const booth2 = listBooths(ev.id, { status: "available" })[0];
    const { order: o2 } = reserveBooth(ev, { boothId: booth2.id, company: "Slow", contactName: "S", contactEmail: "s@example.com" }, "http://x");
    db().update(schema.orders).set({ expiresAt: new Date(Date.now() - 1000).toISOString() }).where(eq(schema.orders.id, o2.id)).run();
    db().update(schema.booths).set({ holdUntil: new Date(Date.now() - 1000).toISOString() }).where(eq(schema.booths.id, booth2.id)).run();
    expect(expireOrders(ev)).toBe(1);
    expect(getBooth(ev.id, booth2.id)!.status).toBe("available");
    expect(releaseExpiredHolds(ev)).toBe(0);

    const booth3 = listBooths(ev.id, { status: "available" })[0];
    const { order: o3 } = reserveBooth(ev, { boothId: booth3.id, company: "C", contactName: "C", contactEmail: "c@example.com" }, "http://x");
    cancelOrder(ev, o3.id, "changed mind");
    expect(getBooth(ev.id, booth3.id)!.status).toBe("available");
    const s = salesSummary(ev);
    expect(s.paidCents).toBeGreaterThan(0);
    expect(s.byStatus.sold).toBeGreaterThan(100);
  });
  it("reserve mode assigns without payment", () => {
    updateEvent(ev.orgId, ev.id, { settings: { sales: { mode: "reserve" } } });
    const e2 = findEventBySlugOrId(db(), ev.slug)!;
    const booth = listBooths(ev.id, { status: "available" })[0];
    const { order, checkoutUrl } = reserveBooth(e2, { boothId: booth.id, company: "Res Co", contactName: "R", contactEmail: "r@example.com" }, "http://x");
    expect(order.status).toBe("pending_payment");
    expect(checkoutUrl).toBeNull();
    expect(getBooth(ev.id, booth.id)!.status).toBe("reserved");
    updateEvent(ev.orgId, ev.id, { settings: { sales: { mode: "buy" } } });
  });
  it("enforces extra limits", () => {
    const lanyard = listExtras(ev.id).find((x) => x.name.startsWith("Lanyard"))!;
    const ex = listExhibitors(ev.id)[5];
    expect(() => assignExtra(ev, ex.id, lanyard.id, 1)).toThrow(/left/);
  });
});

describe("wayfinding + analytics + duplicate", () => {
  it("duplicates an event's map", () => {
    const copy = duplicateEvent(ev.orgId, ev.id, { name: "Copy 2027" });
    const b = buildBundle(db(), copy.id)!;
    expect(b.levels.length).toBe(2);
    expect(b.booths.length).toBe(buildBundle(db(), ev.id)!.booths.length);
    expect(b.booths.every((x) => x.status === "available")).toBe(true);
    expect(b.exhibitors.length).toBe(0);
    expect(b.wayfinding.transitions.every((t) => t.nodeIds.length === 2)).toBe(true);
  });
  it("replaces a level graph keeping known node ids and pruning transitions", () => {
    const wf = getWayfinding(ev.id);
    const level = wf.nodes[0].levelId;
    const keep = wf.nodes.filter((n) => n.levelId === level).slice(0, 2);
    const r = replaceLevelGraph(ev.id, { levelId: level, nodes: [...keep.map((n) => ({ id: n.id, x: n.x, y: n.y })), { id: "tmp1", x: 1, y: 1 }], edges: [{ from: keep[0].id, to: "tmp1" }, { from: "tmp1", to: keep[1].id }] });
    expect(r.nodes.length).toBe(3);
    expect(r.edges.length).toBe(2);
    expect(r.idMap.tmp1).toMatch(/^wn_/);
    expect(r.idMap[keep[0].id]).toBe(keep[0].id);
    const nodeIds = new Set(getWayfinding(ev.id).nodes.map((n) => n.id));
    expect(getWayfinding(ev.id).transitions.every((t) => t.nodeIds.every((n) => nodeIds.has(n)))).toBe(true);
  });
  it("summarises analytics", () => {
    ingestAnalytics(ev.id, { events: [{ type: "search", query: "nothing", meta: { results: 0 } }, { type: "view" }] }, "Mozilla/5.0 (iPhone)");
    const s = analyticsSummary(ev.id);
    expect(s.totals.view).toBeGreaterThan(100);
    expect(s.topExhibitors.length).toBeGreaterThan(0);
    expect(s.zeroResultSearches[0].query).toBe("nothing");
    expect(s.devices.mobile).toBeGreaterThan(0);
    expect(s.heatmap.length).toBeGreaterThan(0);
  });
});

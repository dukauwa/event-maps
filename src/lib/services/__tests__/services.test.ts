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
beforeAll(async () => {
  process.env.AUTO_SEED = "0";
  setDb(await openTestDb());
  const r = await seedDemo(db());
  await publishEvent(db(), r.eventId, "test");
  ev = (await findEventBySlugOrId(db(), DEMO.eventSlug))!;
});
afterAll(() => setDb(undefined));

describe("bundle", () => {
  it("builds a bundle with all sections", async () => {
    const b = (await buildBundle(db(), ev.id))!;
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
  it("publishes immutable snapshots", async () => {
    const before = (await getPublishedBundle(db(), ev.id))!;
    const booth = (await listBooths(ev.id, { status: "available" }))[0];
    await setBoothStatus(ev, booth.id, "unavailable");
    expect((await getPublishedBundle(db(), ev.id))!.booths.find((x) => x.id === booth.id)!.status).toBe(before.booths.find((x) => x.id === booth.id)!.status);
    const r = (await publishEvent(db(), ev.id))!;
    expect(r.version).toBe(2);
    expect((await getPublishedBundle(db(), ev.id))!.booths.find((x) => x.id === booth.id)!.status).toBe("unavailable");
    await setBoothStatus(ev, booth.id, "available");
  });
  it("exports ExpoFP-compatible data.json", async () => {
    const d = toExpoFpData((await buildBundle(db(), ev.id))!);
    for (const k of ["title", "boothTerm", "boothTermPlural", "exhibitorTerm", "levelTerm", "locale", "exhibitors", "booths", "categories", "poiTypes", "events"]) expect(d).toHaveProperty(k);
    const ex = d.exhibitors[0];
    for (const k of ["id", "externalId", "name", "logo", "gallery", "description", "featured", "advertise", "categories", "country", "address", "city", "zip", "phone1", "email", "customButtonTitle", "customButtonUrl", "leadingImageUrl", "videoUrl"]) expect(ex).toHaveProperty(k);
    expect(typeof ex.id).toBe("number");
    expect(d.booths[0]).toMatchObject({ id: expect.any(Number), name: expect.any(String), exhibitors: expect.any(Array), size: expect.any(String) });
    expect(d.events[0]).toMatchObject({ name: expect.any(String), startDate: expect.any(String), endDate: expect.any(String) });
  });
  it("exports GeoJSON in WGS84", async () => {
    const g = bundleToGeoJson((await buildBundle(db(), ev.id))!) as unknown as { features: { geometry: { coordinates: unknown }; properties: { kind: string } }[] };
    expect(g.features.length).toBeGreaterThan(300);
    const poly = g.features.find((f) => f.properties.kind === "booth")!;
    const ring = (poly.geometry.coordinates as number[][][])[0];
    expect(ring[0][0]).toBeCloseTo(0.03, 1);
    expect(ring[0][1]).toBeCloseTo(51.5, 1);
  });
});

describe("booths + exhibitors", () => {
  it("creates, merges and assigns booths", async () => {
    const level = (await buildBundle(db(), ev.id))!.levels[0];
    const a = await createBooth(ev, { label: "Z01", levelId: level.id, polygon: rectPolygon(0, 0, 4, 4) });
    const b = await createBooth(ev, { label: "Z02", levelId: level.id, polygon: rectPolygon(4, 0, 4, 4) });
    expect(a.areaM2).toBe(16);
    expect(a.widthM).toBe(4);
    await expect(createBooth(ev, { label: "Z01", levelId: level.id, polygon: rectPolygon(0, 0, 1, 1) })).rejects.toThrow(/already exists/);
    const merged = await mergeBooths(ev, [a.id, b.id]);
    expect(merged.label).toBe("Z01");
    expect(merged.areaM2).toBe(32);
    expect(await getBooth(ev.id, b.id)).toBeNull();
    const ex = await createExhibitor(ev, { name: "Test Co", email: "t@example.com", boothLabels: ["Z01"] });
    expect(ex.boothLabels).toEqual(["Z01"]);
    await assignExhibitor(ev, merged.id, ex.id, { markSold: true });
    expect((await getBooth(ev.id, "Z01"))!.status).toBe("sold");
    expect((await getExhibitor(ev.id, ex.slug))!.id).toBe(ex.id);
  });
  it("upserts exhibitors by externalId and imports CSV", async () => {
    const r1 = await bulkUpsertExhibitors(ev, [{ name: "Up Co", externalId: "crm-x1" }, { name: "Up Co renamed", externalId: "crm-x1" }]);
    expect(r1).toMatchObject({ created: 1, updated: 1 });
    expect((await getExhibitor(ev.id, "crm-x1"))!.name).toBe("Up Co renamed");
    const [l1, l2] = (await listBooths(ev.id)).filter((b) => b.label.startsWith("C")).map((b) => b.label);
    const csv = `Exhibitor ID,Name,Booth(s),Category,Website,Featured\ncsv-1,CSV Corp,${l1}; ${l2},AI & Data; New/Sub,https://csv.example,yes\n`;
    const r2 = await importExhibitorsCsv(ev, csv);
    expect(r2.created).toBe(1);
    const e = (await getExhibitor(ev.id, "csv-1"))!;
    expect(e.boothLabels.sort()).toEqual([l1, l2].sort());
    expect(e.categoryIds.length).toBe(2);
    expect(e.featured).toBe(true);
  });
  it("imports booths from CSV and exports them", async () => {
    const r = await importBoothsCsv(ev, "label,level,x,y,width,height,type,price\nQ1,L2,100,70,2,2,table,1500\n");
    expect(r.created).toBe(1);
    const q = (await getBooth(ev.id, "Q1"))!;
    expect(q.priceCents).toBe(150000);
    expect(await exportBoothsCsv(ev)).toContain("Q1,L2");
  });
});

describe("orders", () => {
  it("holds, pays and expires", async () => {
    const booth = (await listBooths(ev.id, { status: "available" })).find((b) => b.boothType === "standard")!;
    const { order, checkoutUrl } = await reserveBooth(ev, { boothId: booth.id, company: "Buyer Ltd", contactName: "B", contactEmail: "b@example.com" }, "http://localhost:3000");
    expect(order.status).toBe("hold");
    expect(order.amountCents).toBeGreaterThan(0);
    expect(checkoutUrl).toContain("/reserve/");
    expect((await getBooth(ev.id, booth.id))!.status).toBe("held");
    await expect(reserveBooth(ev, { boothId: booth.id, company: "X", contactName: "X", contactEmail: "x@example.com" }, "http://x")).rejects.toThrow(/held/);
    await markOrderPaid(ev, order.id, "pi_test");
    const b = (await getBooth(ev.id, booth.id))!;
    expect(b.status).toBe("sold");
    expect(b.exhibitorIds.length).toBe(1);
    expect((await getOrder(ev.id, order.id))!.status).toBe("paid");

    const booth2 = (await listBooths(ev.id, { status: "available" }))[0];
    const { order: o2 } = await reserveBooth(ev, { boothId: booth2.id, company: "Slow", contactName: "S", contactEmail: "s@example.com" }, "http://x");
    await db().update(schema.orders).set({ expiresAt: new Date(Date.now() - 1000).toISOString() }).where(eq(schema.orders.id, o2.id)).run();
    await db().update(schema.booths).set({ holdUntil: new Date(Date.now() - 1000).toISOString() }).where(eq(schema.booths.id, booth2.id)).run();
    expect(await expireOrders(ev)).toBe(1);
    expect((await getBooth(ev.id, booth2.id))!.status).toBe("available");
    expect(await releaseExpiredHolds(ev)).toBe(0);

    const booth3 = (await listBooths(ev.id, { status: "available" }))[0];
    const { order: o3 } = await reserveBooth(ev, { boothId: booth3.id, company: "C", contactName: "C", contactEmail: "c@example.com" }, "http://x");
    await cancelOrder(ev, o3.id, "changed mind");
    expect((await getBooth(ev.id, booth3.id))!.status).toBe("available");
    const s = await salesSummary(ev);
    expect(s.paidCents).toBeGreaterThan(0);
    expect(s.byStatus.sold).toBeGreaterThan(100);
  });
  it("reserve mode assigns without payment", async () => {
    await updateEvent(ev.orgId, ev.id, { settings: { sales: { mode: "reserve" } } });
    const e2 = (await findEventBySlugOrId(db(), ev.slug))!;
    const booth = (await listBooths(ev.id, { status: "available" }))[0];
    const { order, checkoutUrl } = await reserveBooth(e2, { boothId: booth.id, company: "Res Co", contactName: "R", contactEmail: "r@example.com" }, "http://x");
    expect(order.status).toBe("pending_payment");
    expect(checkoutUrl).toBeNull();
    expect((await getBooth(ev.id, booth.id))!.status).toBe("reserved");
    await updateEvent(ev.orgId, ev.id, { settings: { sales: { mode: "buy" } } });
  });
  it("enforces extra limits", async () => {
    const lanyard = (await listExtras(ev.id)).find((x) => x.name.startsWith("Lanyard"))!;
    const ex = (await listExhibitors(ev.id))[5];
    await expect(assignExtra(ev, ex.id, lanyard.id, 1)).rejects.toThrow(/left/);
  });
});

describe("wayfinding + analytics + duplicate", () => {
  it("duplicates an event's map", async () => {
    const copy = await duplicateEvent(ev.orgId, ev.id, { name: "Copy 2027" });
    const b = (await buildBundle(db(), copy.id))!;
    expect(b.levels.length).toBe(2);
    expect(b.booths.length).toBe((await buildBundle(db(), ev.id))!.booths.length);
    expect(b.booths.every((x) => x.status === "available")).toBe(true);
    expect(b.exhibitors.length).toBe(0);
    expect(b.wayfinding.transitions.every((t) => t.nodeIds.length === 2)).toBe(true);
  });
  it("replaces a level graph keeping known node ids and pruning transitions", async () => {
    const wf = await getWayfinding(ev.id);
    const level = wf.nodes[0].levelId;
    const keep = wf.nodes.filter((n) => n.levelId === level).slice(0, 2);
    const r = await replaceLevelGraph(ev.id, { levelId: level, nodes: [...keep.map((n) => ({ id: n.id, x: n.x, y: n.y })), { id: "tmp1", x: 1, y: 1 }], edges: [{ from: keep[0].id, to: "tmp1" }, { from: "tmp1", to: keep[1].id }] });
    expect(r.nodes.length).toBe(3);
    expect(r.edges.length).toBe(2);
    expect(r.idMap.tmp1).toMatch(/^wn_/);
    expect(r.idMap[keep[0].id]).toBe(keep[0].id);
    const nodeIds = new Set((await getWayfinding(ev.id)).nodes.map((n) => n.id));
    expect((await getWayfinding(ev.id)).transitions.every((t) => t.nodeIds.every((n) => nodeIds.has(n)))).toBe(true);
  });
  it("summarises analytics", async () => {
    await ingestAnalytics(ev.id, { events: [{ type: "search", query: "nothing", meta: { results: 0 } }, { type: "view" }] }, "Mozilla/5.0 (iPhone)");
    const s = await analyticsSummary(ev.id);
    expect(s.totals.view).toBeGreaterThan(100);
    expect(s.topExhibitors.length).toBeGreaterThan(0);
    expect(s.zeroResultSearches[0].query).toBe("nothing");
    expect(s.devices.mobile).toBeGreaterThan(0);
    expect(s.heatmap.length).toBeGreaterThan(0);
  });
});

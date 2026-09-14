import { beforeAll, afterAll, describe, expect, it } from "vitest";
import { openTestDb, setDb, db } from "@/lib/db";
import { seedDemo, DEMO } from "@/lib/seed/demo";
import { publishEvent } from "@/lib/bundle";
import { GET as listEvents } from "@/app/api/v1/events/route";
import { GET as listBooths } from "@/app/api/v1/events/[event]/booths/route";
import { POST as reserve } from "@/app/api/v1/events/[event]/reserve/route";
import { GET as route } from "@/app/api/v1/events/[event]/route/route";
import { POST as compat } from "@/app/api/v1/compat/expofp/[...action]/route";
import { GET as dataJson } from "@/app/e/[slug]/data.json/route";
import { GET as expoJson } from "@/app/e/[slug]/data.expofp.json/route";

const KEY = DEMO.apiKey;
const H = { Authorization: `Bearer ${KEY}` };
const json = async (r: Response) => ({ status: r.status, body: await r.json() });
const ctx = <T extends Record<string, unknown>>(p: T) => ({ params: Promise.resolve(p) });

beforeAll(() => {
  process.env.AUTO_SEED = "0";
  setDb(openTestDb());
  const r = seedDemo(db());
  publishEvent(db(), r.eventId);
});
afterAll(() => setDb(undefined));

describe("REST API v1", () => {
  it("rejects missing credentials and accepts an API key", async () => {
    const r1 = await json(await listEvents(new Request("http://t/api/v1/events"), ctx({})));
    expect(r1.status).toBe(401);
    expect(r1.body.error.code).toBe("unauthorized");
    const r2 = await json(await listEvents(new Request("http://t/api/v1/events", { headers: H }), ctx({})));
    expect(r2.status).toBe(200);
    expect(r2.body.data.length).toBe(2);
    expect(r2.body.data[0]).not.toHaveProperty("settings");
  });
  it("lists booths with filters and pagination meta", async () => {
    const r = await json(await listBooths(new Request(`http://t/api/v1/events/${DEMO.eventSlug}/booths?status=available&limit=5`, { headers: H }), ctx({ event: DEMO.eventSlug })));
    expect(r.status).toBe(200);
    expect(r.body.data.length).toBe(5);
    expect(r.body.meta.total).toBeGreaterThan(10);
    expect(r.body.data.every((b: { status: string }) => b.status === "available")).toBe(true);
  });
  it("routes publicly between booths", async () => {
    const r = await json(await route(new Request(`http://t/api/v1/events/${DEMO.eventSlug}/route?from=booth:A101&to=booth:T05&accessible=1`), ctx({ event: DEMO.eventSlug })));
    expect(r.status).toBe(200);
    expect(r.body.data.ok).toBe(true);
    expect(r.body.data.levelIds.length).toBe(2);
    expect(r.body.data.steps.some((s: { transition?: unknown }) => s.transition)).toBe(true);
    expect(r.body.data.distanceM).toBeGreaterThan(100);
  });
  it("reserves a booth publicly and validates input", async () => {
    const booths = await json(await listBooths(new Request(`http://t/api/v1/events/${DEMO.eventSlug}/booths?status=available&limit=1`, { headers: H }), ctx({ event: DEMO.eventSlug })));
    const boothId = booths.body.data[0].id;
    const bad = await json(await reserve(new Request(`http://t/x`, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ boothId }) }), ctx({ event: DEMO.eventSlug })));
    expect(bad.status).toBe(400);
    expect(bad.body.error.code).toBe("validation_error");
    const ok = await json(await reserve(new Request(`http://t/x`, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ boothId, company: "API Co", contactName: "A", contactEmail: "a@example.com" }) }), ctx({ event: DEMO.eventSlug })));
    expect(ok.status).toBe(201);
    expect(ok.body.data.order.status).toBe("hold");
    expect(ok.body.data.checkoutUrl).toContain("/pay?order=");
    expect(ok.body.data.order).not.toHaveProperty("providerRef");
  });
});

describe("ExpoFP compatibility shim", () => {
  const call = async (action: string, body: Record<string, unknown>) => json(await compat(new Request(`http://t/api/v1/compat/expofp/${action}`, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ token: KEY, ...body }) }), ctx({ action: action.split("/") })));
  it("list-events / list-exhibitors / get-booth / categories", async () => {
    const ev = await call("list-events", {});
    expect(ev.status).toBe(200);
    expect(ev.body.find((e: { key: string }) => e.key === DEMO.eventSlug)).toMatchObject({ id: expect.any(String), key: DEMO.eventSlug, name: expect.any(String) });
    const ex = await call("list-exhibitors", { eventId: DEMO.eventSlug });
    expect(ex.body.length).toBeGreaterThan(200);
    expect(ex.body[0]).toHaveProperty("booths");
    const b = await call("get-booth", { eventId: DEMO.eventSlug, name: "A101" });
    expect(b.body).toMatchObject({ name: "A101", isOnHold: false, metadata: expect.any(Array) });
    const c = await call("add-category", { eventId: DEMO.eventSlug, name: "Compat Cat" });
    expect(c.body).toMatchObject({ id: expect.any(String), name: "Compat Cat" });
    const cats = await call("list-categories", { eventId: DEMO.eventSlug });
    expect(cats.body.some((x: { name: string }) => x.name === "Compat Cat")).toBe(true);
  });
  it("add-exhibitor + add-exhibitor-booth + update-booth", async () => {
    const add = await call("add-exhibitor", { eventId: DEMO.eventSlug, name: "Compat Co", externalId: "compat-1", website: "https://c.example" });
    expect(add.body.id).toMatch(/^ex_/);
    const idr = await call("get-exhibitor-id", { eventId: DEMO.eventSlug, externalId: "compat-1" });
    expect(idr.body.id).toBe(add.body.id);
    const avail = await json(await listBooths(new Request(`http://t/api/v1/events/${DEMO.eventSlug}/booths?status=available&limit=1`, { headers: H }), ctx({ event: DEMO.eventSlug })));
    const label = avail.body.data[0].label;
    const assign = await call("add-exhibitor-booth", { eventId: DEMO.eventSlug, boothName: label, exhibitorId: add.body.id });
    expect(assign.status).toBe(200);
    const booth = await call("get-booth", { eventId: DEMO.eventSlug, name: label });
    expect(booth.body.status).toBe("sold");
    expect(booth.body.exhibitors).toContain(add.body.id);
    await call("update-booth", { eventId: DEMO.eventSlug, name: label, adminNotes: "hello", metadata: [{ key: "power", value: "32A" }] });
    const again = await call("get-booth", { eventId: DEMO.eventSlug, name: label });
    expect(again.body.adminNotes).toBe("hello");
    expect(again.body.metadata).toEqual([{ key: "power", value: "32A" }]);
    const bad = await call("nope", {});
    expect(bad.status).toBe(404);
    const noauth = await json(await compat(new Request("http://t/x", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ token: "bad" }) }), ctx({ action: ["list-events"] })));
    expect(noauth.status).toBe(401);
  });
});

describe("public feeds", () => {
  it("serves the published bundle and the ExpoFP-shaped feed", async () => {
    const d = await json(await dataJson(new Request(`http://t/e/${DEMO.eventSlug}/data.json`), ctx({ slug: DEMO.eventSlug })));
    expect(d.status).toBe(200);
    expect(d.body.format).toBe("tessera.bundle");
    expect(d.body.booths.length).toBeGreaterThan(200);
    const e = await json(await expoJson(new Request(`http://t/e/${DEMO.eventSlug}/data.expofp.json`), ctx({ slug: DEMO.eventSlug })));
    expect(e.body.boothTerm).toBe("Booth");
    expect(typeof e.body.exhibitors[0].id).toBe("number");
    const missing = await json(await dataJson(new Request("http://t/e/nope/data.json"), ctx({ slug: "nope" })));
    expect(missing.status).toBe(404);
  });
});

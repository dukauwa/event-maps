/**
 * ExpoFP JSON API v1 compatibility shim. Integrations written against
 * `https://app.expofp.com/api/v1/<action>` (POST, `token` in the body) can point at
 * `/api/v1/compat/expofp/<action>` instead. Ids are our string ids; `eventId`/`expoId` accept slug or id.
 */
import { NextResponse } from "next/server";
import { CORS_HEADERS, optionsResponse } from "@/lib/api/http";
import { principalFromApiKey } from "@/lib/auth/session";
import { db, schema } from "@/lib/db";
import { eq } from "drizzle-orm";
import { findEventBySlugOrId } from "@/lib/bundle";
import { listEvents } from "@/lib/services/events";
import { createExhibitor, deleteExhibitor, getExhibitor, listExhibitors, updateExhibitor, type ExhibitorInput } from "@/lib/services/exhibitors";
import { assignExhibitor, getBooth, listBooths, setBoothStatus, unassignExhibitor, updateBooth } from "@/lib/services/booths";
import { createCategory, deleteCategory, getCategory, listCategories, updateCategory } from "@/lib/services/categories";
import { bulkUpsertSessions, deleteSession, listSessions } from "@/lib/services/sessions";
import { createWebhook, listWebhooks, updateWebhook } from "@/lib/services/webhooks";
import { listExtras, listExhibitorExtras, assignExtra, removeExtra } from "@/lib/services/extras";
import { listPricingRules } from "@/lib/services/pricing-rules";
import { resolveBoothPrice } from "@/lib/pricing";

type Body = Record<string, unknown>;
const str = (v: unknown) => (v == null ? undefined : String(v));
const bad = (msg: string, status = 400) => NextResponse.json({ error: msg }, { status, headers: CORS_HEADERS });

export const OPTIONS = () => optionsResponse();

export async function POST(req: Request, ctx: { params: Promise<{ action: string[] }> }) {
  const { action } = await ctx.params;
  const name = action.join("/");
  let body: Body = {};
  const ct = req.headers.get("content-type") ?? "";
  if (ct.includes("multipart/form-data")) { const f = await req.formData(); f.forEach((v, k) => (body[k] = v)); }
  else body = ((await req.json().catch(() => ({}))) as Body) ?? {};
  const token = str(body.token) ?? req.headers.get("x-api-token") ?? req.headers.get("x-api-key") ?? req.headers.get("authorization")?.replace(/^Bearer /i, "");
  const principal = principalFromApiKey(token);
  if (!principal) return bad("Invalid token", 401);
  const orgId = principal.orgId;
  const ev = () => {
    const key = str(body.eventId) ?? str(body.expoId) ?? str(body.expoKey);
    if (!key) return null;
    const e = findEventBySlugOrId(db(), key);
    return e && e.orgId === orgId ? e : null;
  };
  const okJson = (data: unknown, status = 200) => NextResponse.json(data, { status, headers: CORS_HEADERS });
  const exhibitorFromBody = (b: Body): Partial<ExhibitorInput> => ({
    name: str(b.name), externalId: str(b.externalId) ?? null, description: str(b.description) ?? null, featured: b.featured as boolean | undefined,
    country: str(b.country) ?? null, address: [str(b.address), str(b.address2), str(b.state)].filter(Boolean).join(", ") || null, city: str(b.city) ?? null, zip: str(b.zip) ?? null,
    phone: str(b.phone1) ?? str(b.phone) ?? null, email: str(b.email) ?? null, website: str(b.website) ?? null, logoUrl: str(b.logoUrl) ?? str(b.logo) ?? undefined,
    customButtonTitle: str(b.customButtonTitle) ?? null, customButtonUrl: str(b.customButtonUrl) ?? null, videoUrl: str(b.videoUrl) ?? null, contactName: str(b.contactName) ?? null,
    socials: Object.fromEntries(["facebook", "instagram", "linkedin", "twitter", "youtube", "tiktok"].filter((k) => b[k]).map((k) => [k === "twitter" ? "x" : k, String(b[k])])),
    tags: Array.isArray(b.tags) ? (b.tags as string[]) : undefined,
    boothLabels: Array.isArray(b.booths) ? (b.booths as string[]) : undefined,
  });

  try {
    switch (name) {
      case "list-events": return okJson(listEvents(orgId).map((e) => ({ id: e.id, key: e.slug, name: e.name })));
      case "set-webhook-url": {
        const e = ev(); if (!e) return bad("Unknown eventId");
        const url = str(body.webhookUrl); if (!url) return bad("webhookUrl required");
        const existing = listWebhooks(orgId).find((w) => w.eventId === e.id);
        if (existing) updateWebhook(orgId, existing.id, { url, active: true }); else createWebhook(orgId, { url, eventId: e.id, events: ["*"] });
        return okJson({});
      }
      case "list-exhibitors": {
        const e = ev(); if (!e) return bad("Unknown eventId");
        const cats = new Map(listCategories(e.id).map((c) => [c.id, c.name]));
        const extras = new Map(listExtras(e.id).map((x) => [x.id, x.name]));
        return okJson(listExhibitors(e.id).map((x) => ({ id: x.id, name: x.name, booths: x.boothLabels, categories: x.categoryIds.map((c) => cats.get(c)), tags: x.tags, extras: listExhibitorExtras(e.id, x.id).map((r) => extras.get(r.extraId)) })));
      }
      case "bulk-read-exhibitors": { const e = ev(); if (!e) return bad("Unknown expoId"); return okJson(listExhibitors(e.id)); }
      case "bulk-read-exhibitors-template": return okJson({ id: true, name: true, externalId: true, booths: true, categories: true, description: true, website: true, email: true });
      case "get-exhibitor": {
        const id = str(body.id); if (!id) return bad("id required");
        const row = db().select().from(schema.exhibitors).where(eq(schema.exhibitors.id, id)).get();
        const e = row ? findEventBySlugOrId(db(), row.eventId) : null;
        if (!row || !e || e.orgId !== orgId) return bad("Not found", 404);
        const x = getExhibitor(e.id, id)!;
        return okJson({ ...x, booths: x.boothLabels, images: x.gallery, logoFileUrl: x.logoUrl, phone1: x.phone });
      }
      case "get-exhibitor-id": { const e = ev(); if (!e) return bad("Unknown eventId"); const x = getExhibitor(e.id, String(body.externalId)); return x ? okJson({ id: x.id }) : bad("Not found", 404); }
      case "add-exhibitor": { const e = ev(); if (!e) return bad("Unknown eventId"); const input = exhibitorFromBody(body); if (!input.name) return bad("name required"); const x = createExhibitor(e, input as ExhibitorInput); return okJson({ id: x.id }); }
      case "update-exhibitor": {
        const id = str(body.id); if (!id) return bad("id required");
        const row = db().select().from(schema.exhibitors).where(eq(schema.exhibitors.id, id)).get();
        const e = row ? findEventBySlugOrId(db(), row.eventId) : null;
        if (!row || !e || e.orgId !== orgId) return bad("Not found", 404);
        const patch = Object.fromEntries(Object.entries(exhibitorFromBody(body)).filter(([, v]) => v !== undefined));
        updateExhibitor(e, id, patch);
        return okJson({});
      }
      case "delete-exhibitor": {
        const id = str(body.id); if (!id) return bad("id required");
        const row = db().select().from(schema.exhibitors).where(eq(schema.exhibitors.id, id)).get();
        const e = row ? findEventBySlugOrId(db(), row.eventId) : null;
        if (!row || !e || e.orgId !== orgId) return bad("Not found", 404);
        deleteExhibitor(e, id);
        return okJson({});
      }
      case "set-exhibitor-logo": case "set-exhibitor-leading-image": {
        const id = str(body.exhibitorid) ?? str(body.exhibitorId); if (!id) return bad("exhibitorid required");
        const row = db().select().from(schema.exhibitors).where(eq(schema.exhibitors.id, id)).get();
        const e = row ? findEventBySlugOrId(db(), row.eventId) : null;
        if (!row || !e || e.orgId !== orgId) return bad("Not found", 404);
        const url = str(body.imgUrl) ?? null;
        updateExhibitor(e, id, name === "set-exhibitor-logo" ? { logoUrl: url } : { leadingImageUrl: url });
        return okJson({});
      }
      case "list-booths": {
        const e = ev(); if (!e) return bad("Unknown expoId");
        const exNames = new Map(listExhibitors(e.id).map((x) => [x.id, x.name]));
        return okJson(listBooths(e.id).map((b) => ({ id: b.id, name: b.label, title: b.label, externalId: b.externalId ?? "", isSpecial: false, status: b.status, exhibitors: b.exhibitorIds.map((x) => exNames.get(x)) })));
      }
      case "get-booth": {
        const e = ev(); if (!e) return bad("Unknown eventId");
        const b = getBooth(e.id, String(body.name)); if (!b) return bad("Not found", 404);
        const price = resolveBoothPrice(b, listPricingRules(e.id), e.settings);
        return okJson({ name: b.label, title: b.label, type: b.boothType, size: b.widthM && b.heightM ? `${b.widthM} x ${b.heightM} / ${b.areaM2} m²` : `${b.areaM2} m²`, price: price ? price.priceCents / 100 : null, currency: price?.currency, status: b.status, isOnHold: b.status === "held", adminNotes: b.notes ?? "", exhibitors: b.exhibitorIds, metadata: Object.entries(b.metadata ?? {}).map(([key, value]) => ({ key, value })), isSpecialSection: false });
      }
      case "update-booth": {
        const e = ev(); if (!e) return bad("Unknown eventId");
        const b = getBooth(e.id, String(body.name)); if (!b) return bad("Not found", 404);
        const patch: Body = {};
        if (body.externalId !== undefined) patch.externalId = str(body.externalId);
        if (body.adminNotes !== undefined) patch.notes = str(body.adminNotes);
        if (Array.isArray(body.metadata)) patch.metadata = Object.fromEntries((body.metadata as { key: string; value: string }[]).map((m) => [m.key, m.value]));
        updateBooth(e, b.id, patch);
        if (typeof body.isOnHold === "boolean") setBoothStatus(e, b.id, body.isOnHold ? "held" : b.exhibitorIds.length ? "sold" : "available", body.isOnHold ? new Date(Date.now() + 365 * 86400e3).toISOString() : null);
        return okJson({});
      }
      case "add-exhibitor-booth": { const e = ev(); if (!e) return bad("Unknown eventId"); const b = getBooth(e.id, String(body.boothName)); if (!b) return bad("Unknown booth", 404); assignExhibitor(e, b.id, String(body.exhibitorId), { markSold: true }); return okJson({}); }
      case "remove-exhibitor-booth": { const e = ev(); if (!e) return bad("Unknown eventId"); const b = getBooth(e.id, String(body.boothName)); if (!b) return bad("Unknown booth", 404); unassignExhibitor(e, b.id, String(body.exhibitorId)); return okJson({}); }
      case "list-categories": { const e = ev(); if (!e) return bad("Unknown eventId"); return okJson(listCategories(e.id).map((c) => ({ id: c.id, name: c.name }))); }
      case "add-category": { const e = ev(); if (!e) return bad("Unknown eventId"); const c = createCategory(e.id, { name: String(body.name) }); return okJson({ id: c.id, name: c.name }); }
      case "update-category": {
        const id = str(body.id); if (!id) return bad("id required");
        const row = db().select().from(schema.categories).where(eq(schema.categories.id, id)).get();
        const e = row ? findEventBySlugOrId(db(), row.eventId) : null;
        if (!row || !e || e.orgId !== orgId) return bad("Not found", 404);
        const c = updateCategory(e.id, id, { name: String(body.name) }); return okJson({ id: c.id, name: c.name });
      }
      case "remove-category": {
        const id = str(body.id); if (!id) return bad("id required");
        const row = db().select().from(schema.categories).where(eq(schema.categories.id, id)).get();
        const e = row ? findEventBySlugOrId(db(), row.eventId) : null;
        if (!row || !e || e.orgId !== orgId || !getCategory(e.id, id)) return bad("Not found", 404);
        deleteCategory(e.id, id); return okJson({});
      }
      case "list-extras": { const e = ev(); if (!e) return bad("Unknown eventId"); const all = listExtras(e.id); return okJson({ extras: all.filter((x) => x.kind === "sponsorship"), boothExtras: all.filter((x) => x.kind === "booth_extra") }); }
      case "list-exhibitor-extras": {
        const id = str(body.exhibitorId); if (!id) return bad("exhibitorId required");
        const row = db().select().from(schema.exhibitors).where(eq(schema.exhibitors.id, id)).get();
        const e = row ? findEventBySlugOrId(db(), row.eventId) : null;
        if (!row || !e || e.orgId !== orgId) return bad("Not found", 404);
        return okJson(listExhibitorExtras(e.id, id));
      }
      case "add-exhibitor-extra": case "remove-exhibitor-extra": {
        const id = str(body.exhibitorId); if (!id) return bad("exhibitorId required");
        const row = db().select().from(schema.exhibitors).where(eq(schema.exhibitors.id, id)).get();
        const e = row ? findEventBySlugOrId(db(), row.eventId) : null;
        if (!row || !e || e.orgId !== orgId) return bad("Not found", 404);
        if (name === "add-exhibitor-extra") assignExtra(e, id, String(body.extraId), Number(body.quantity ?? 1)); else removeExtra(e, id, String(body.extraId));
        return okJson({});
      }
      case "sessions/get": { const e = ev(); if (!e) return bad("Unknown expoId"); return okJson(listSessions(e.id).map((s) => ({ id: s.id, expoId: e.id, externalId: s.externalId, name: s.title, description: s.description, startDate: s.startsAt, endDate: s.endsAt, boothId: s.boothId, speakers: s.speakers, track: s.track }))); }
      case "sessions/upsert": {
        const e = ev(); if (!e) return bad("Unknown expoId");
        const items = (Array.isArray(body.sessions) ? body.sessions : []) as Body[];
        const r = bulkUpsertSessions(e, items.map((s) => ({ title: String(s.name ?? s.title ?? ""), externalId: str(s.externalId) ?? null, description: str(s.description) ?? null, startsAt: String(s.startDate ?? s.startsAt), endsAt: String(s.endDate ?? s.endsAt), boothId: str(s.boothId) ?? null, boothLabel: str(s.boothName) ?? null, url: str(s.url) ?? null })));
        return okJson(items.map((s, i) => ({ rowId: s.rowId ?? i, externalId: s.externalId ?? null, success: !r.errors.some((x) => x.index === i), error: r.errors.find((x) => x.index === i)?.error })));
      }
      case "sessions/delete": { const e = ev(); if (!e) return bad("Unknown expoId"); const ids = (body.ids as string[]) ?? []; return okJson(ids.map((id) => { try { deleteSession(e, id); return { id, success: true }; } catch (err) { return { id, success: false, error: String(err) }; } })); }
      default: return bad(`Unknown action '${name}'. Supported: list-events, set-webhook-url, list-exhibitors, bulk-read-exhibitors, get-exhibitor, get-exhibitor-id, add-exhibitor, update-exhibitor, delete-exhibitor, set-exhibitor-logo, set-exhibitor-leading-image, list-booths, get-booth, update-booth, add-exhibitor-booth, remove-exhibitor-booth, list-categories, add-category, update-category, remove-category, list-extras, list-exhibitor-extras, add-exhibitor-extra, remove-exhibitor-extra, sessions/get, sessions/upsert, sessions/delete`, 404);
    }
  } catch (e) {
    const status = (e as { status?: number }).status ?? 500;
    return bad(e instanceof Error ? e.message : "error", status);
  }
}

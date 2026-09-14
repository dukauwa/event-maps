/**
 * Grip integration. Grip's organiser API is private; this adapter pulls companies/exhibitors from a
 * JSON or CSV source URL (Grip export, or any CRM feed) and upserts them by `gripId`/`externalId`.
 * Configure via event settings `grip.eventId` + env GRIP_API_BASE / GRIP_API_KEY, or pass `sourceUrl`.
 * Expected JSON: an array (or `{ data: [...] }`) of objects with any of: id, _id, name, company, description,
 * website, email, phone, country, city, logo/logo_url, categories (names or array), booth/booths/stand, tags.
 */
import { db, schema } from "@/lib/db";
import { eq } from "drizzle-orm";
import { bulkUpsertExhibitors, type ExhibitorInput } from "./exhibitors";
import { ensureCategory } from "./categories";
import { parseCsv } from "./csv";
import { badRequest } from "@/lib/api/http";
import type { Event } from "@/lib/db/schema";

type Raw = Record<string, unknown>;
const s = (v: unknown) => (v == null || v === "" ? undefined : String(v));
const list = (v: unknown): string[] => Array.isArray(v) ? v.map((x) => (typeof x === "object" && x ? String((x as Raw).name ?? (x as Raw).label ?? "") : String(x))).filter(Boolean) : typeof v === "string" ? v.split(/[;,|]/).map((x) => x.trim()).filter(Boolean) : [];

export function mapGripCompany(ev: Event, c: Raw): ExhibitorInput | null {
  const name = s(c.name) ?? s(c.company) ?? s(c.companyName) ?? s(c.title);
  if (!name) return null;
  const socials: Record<string, string> = {};
  for (const k of ["linkedin", "x", "twitter", "facebook", "instagram", "youtube"]) if (s(c[k])) socials[k === "twitter" ? "x" : k] = String(c[k]);
  return {
    name,
    gripId: s(c.gripId) ?? s(c._id) ?? s(c.id) ?? null,
    externalId: s(c.externalId) ?? s(c.external_id) ?? null,
    description: s(c.description) ?? s(c.summary) ?? s(c.headline) ?? null,
    website: s(c.website) ?? s(c.url) ?? null,
    email: s(c.email) ?? null,
    phone: s(c.phone) ?? null,
    country: s(c.country) ?? null,
    city: s(c.city) ?? null,
    logoUrl: s(c.logo) ?? s(c.logo_url) ?? s(c.logoUrl) ?? s(c.picture) ?? s(c.image) ?? null,
    featured: /^(1|true|yes)$/i.test(s(c.featured) ?? "") || undefined,
    tags: list(c.tags),
    socials,
    categoryIds: list(c.categories ?? c.category ?? c.industries ?? c.industry).map((n) => ensureCategory(ev.id, n)),
    boothLabels: list(c.booths ?? c.booth ?? c.stand ?? c.location),
    customButtonTitle: c.gripId || c._id ? "Book a meeting on Grip" : undefined,
    customButtonUrl: s(c.profileUrl) ?? s(c.url_profile) ?? (s(c._id) ? `https://web.grip.events/company/${s(c._id)}` : undefined),
  };
}

export async function syncFromGrip(orgId: string, ev: Event, opts: { sourceUrl?: string; dryRun?: boolean }) {
  const base = process.env.GRIP_API_BASE?.replace(/\/$/, "");
  const key = process.env.GRIP_API_KEY;
  const gripEventId = ev.settings.grip?.eventId;
  const url = opts.sourceUrl ?? (base && gripEventId ? `${base}/events/${encodeURIComponent(gripEventId)}/companies` : null);
  if (!url) throw badRequest("No source: pass sourceUrl, or set GRIP_API_BASE/GRIP_API_KEY and settings.grip.eventId");
  const res = await fetch(url, { headers: key ? { Authorization: `Bearer ${key}`, "X-Api-Key": key } : {} });
  if (!res.ok) throw badRequest(`Source returned HTTP ${res.status}`);
  const ct = res.headers.get("content-type") ?? "";
  let rows: Raw[];
  if (ct.includes("csv") || url.endsWith(".csv")) rows = parseCsv(await res.text());
  else {
    const json = (await res.json()) as unknown;
    rows = Array.isArray(json) ? (json as Raw[]) : Array.isArray((json as Raw)?.data) ? ((json as Raw).data as Raw[]) : Array.isArray((json as Raw)?.items) ? ((json as Raw).items as Raw[]) : [];
  }
  const items = rows.map((r) => mapGripCompany(ev, r)).filter((x): x is ExhibitorInput => !!x);
  if (opts.dryRun) return { dryRun: true, parsed: rows.length, mapped: items.length, sample: items.slice(0, 5) };
  const result = bulkUpsertExhibitors(ev, items);
  db().update(schema.events).set({ settings: { ...ev.settings, grip: { ...(ev.settings.grip ?? {}), lastSyncAt: new Date().toISOString() } } }).where(eq(schema.events.id, ev.id)).run();
  void orgId;
  return { parsed: rows.length, mapped: items.length, ...result };
}

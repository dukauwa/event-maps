import { and, eq, sql } from "drizzle-orm";
import { z } from "zod";
import { db, schema } from "@/lib/db";
import { newId } from "@/lib/ids";
import { BANNER_PLACEMENTS } from "@/lib/domain/types";
import { notFound } from "@/lib/api/http";

export const bannerInput = z.object({
  exhibitorId: z.string().nullish(),
  placement: z.enum(BANNER_PLACEMENTS).optional(),
  title: z.string().max(200).nullish(),
  imageUrl: z.string().max(400000),
  linkUrl: z.string().max(1000).nullish(),
  active: z.boolean().optional(),
  weight: z.number().int().min(0).max(100).optional(),
  startsAt: z.string().nullish(),
  endsAt: z.string().nullish(),
});
export type BannerInput = z.infer<typeof bannerInput>;

export async function listBanners(eventId: string) {
  return await db().select().from(schema.banners).where(eq(schema.banners.eventId, eventId)).all();
}
export async function createBanner(eventId: string, input: BannerInput) {
  const id = newId("ba");
  await db().insert(schema.banners).values({ id, eventId, ...input, placement: input.placement ?? "search_top", active: input.active ?? true, weight: input.weight ?? 1 }).run();
  return (await db().select().from(schema.banners).where(eq(schema.banners.id, id)).get())!;
}
export async function updateBanner(eventId: string, id: string, patch: Partial<BannerInput>) {
  const b = await db().select().from(schema.banners).where(and(eq(schema.banners.id, id), eq(schema.banners.eventId, eventId))).get();
  if (!b) throw notFound("banner");
  await db().update(schema.banners).set(patch).where(eq(schema.banners.id, id)).run();
  return (await db().select().from(schema.banners).where(eq(schema.banners.id, id)).get())!;
}
export async function deleteBanner(eventId: string, id: string) {
  await db().delete(schema.banners).where(and(eq(schema.banners.id, id), eq(schema.banners.eventId, eventId))).run();
}
export async function countBanner(id: string, kind: "impression" | "click") {
  if (kind === "impression") await db().update(schema.banners).set({ impressions: sql`${schema.banners.impressions} + 1` }).where(eq(schema.banners.id, id)).run();
  else await db().update(schema.banners).set({ clicks: sql`${schema.banners.clicks} + 1` }).where(eq(schema.banners.id, id)).run();
}

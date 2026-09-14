import { and, eq, asc } from "drizzle-orm";
import { z } from "zod";
import { db, schema } from "@/lib/db";
import { newId } from "@/lib/ids";
import { BOOTH_TYPES } from "@/lib/domain/types";
import { notFound } from "@/lib/api/http";

export const pricingRuleInput = z.object({
  name: z.string().min(1).max(120),
  boothType: z.enum(BOOTH_TYPES).nullish(),
  minAreaM2: z.number().nonnegative().nullish(),
  maxAreaM2: z.number().nonnegative().nullish(),
  priceCents: z.number().int().nonnegative().nullish(),
  pricePerM2Cents: z.number().int().nonnegative().nullish(),
  currency: z.string().length(3).optional(),
  sortIndex: z.number().int().optional(),
});
export type PricingRuleInput = z.infer<typeof pricingRuleInput>;

export function listPricingRules(eventId: string) {
  return db().select().from(schema.pricingRules).where(eq(schema.pricingRules.eventId, eventId)).orderBy(asc(schema.pricingRules.sortIndex)).all();
}
export function createPricingRule(eventId: string, input: PricingRuleInput, currency: string) {
  const id = newId("pr");
  db().insert(schema.pricingRules).values({ id, eventId, ...input, currency: input.currency ?? currency, sortIndex: input.sortIndex ?? listPricingRules(eventId).length }).run();
  return db().select().from(schema.pricingRules).where(eq(schema.pricingRules.id, id)).get()!;
}
export function updatePricingRule(eventId: string, id: string, patch: Partial<PricingRuleInput>) {
  const r = db().select().from(schema.pricingRules).where(and(eq(schema.pricingRules.id, id), eq(schema.pricingRules.eventId, eventId))).get();
  if (!r) throw notFound("pricing rule");
  db().update(schema.pricingRules).set(patch).where(eq(schema.pricingRules.id, id)).run();
  return db().select().from(schema.pricingRules).where(eq(schema.pricingRules.id, id)).get()!;
}
export function deletePricingRule(eventId: string, id: string) {
  db().delete(schema.pricingRules).where(and(eq(schema.pricingRules.id, id), eq(schema.pricingRules.eventId, eventId))).run();
}

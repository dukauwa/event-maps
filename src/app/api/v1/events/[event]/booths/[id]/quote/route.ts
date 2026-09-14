import { ok, optionsResponse, notFound, withApi } from "@/lib/api/http";
import { db } from "@/lib/db";
import { findEventBySlugOrId } from "@/lib/bundle";
import { getBooth } from "@/lib/services/booths";
import { quoteBooth } from "@/lib/services/orders";

export const OPTIONS = () => optionsResponse();
/** Public price quote for a booth (used by the reservation page). */
export const GET = withApi(async (_req: Request, ctx: { params: Promise<{ event: string; id: string }> }) => {
  const p = await ctx.params;
  const event = findEventBySlugOrId(db(), p.event);
  if (!event) throw notFound("event");
  const b = getBooth(event.id, p.id); if (!b) throw notFound("booth");
  const q = quoteBooth(event, b.id);
  return ok({ booth: { id: b.id, label: b.label, status: b.status, areaM2: b.areaM2, widthM: b.widthM, heightM: b.heightM, boothType: b.boothType, levelId: b.levelId }, priceCents: q.price?.priceCents ?? null, taxCents: q.taxCents, totalCents: q.totalCents, currency: q.currency, mode: event.settings.sales.mode, holdMinutes: event.settings.sales.holdMinutes, terms: event.settings.terms, instructions: event.settings.sales.reserveInstructions ?? null });
});

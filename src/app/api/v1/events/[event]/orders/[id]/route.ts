import { z } from "zod";
import { notFound, ok, optionsResponse, parseBody, requireEvent, withApi } from "@/lib/api/http";
import { getOrder } from "@/lib/services/orders";
import { db, schema } from "@/lib/db";
import { eq } from "drizzle-orm";

type Ctx = { params: Promise<{ event: string; id: string }> };
export const OPTIONS = () => optionsResponse();
export const GET = withApi(async (req: Request, ctx: Ctx) => { const p = await ctx.params; const { event } = await requireEvent(req, p.event); const o = getOrder(event.id, p.id); if (!o) throw notFound("order"); return ok(o); });
export const PATCH = withApi(async (req: Request, ctx: Ctx) => {
  const p = await ctx.params; const { event } = await requireEvent(req, p.event, "write");
  const o = getOrder(event.id, p.id); if (!o) throw notFound("order");
  const patch = await parseBody(req, z.object({ notes: z.string().max(4000).nullish(), company: z.string().max(200).optional(), contactName: z.string().max(120).optional(), contactEmail: z.string().email().optional(), amountCents: z.number().int().nonnegative().optional() }));
  db().update(schema.orders).set({ ...patch, updatedAt: new Date().toISOString() }).where(eq(schema.orders.id, o.id)).run();
  return ok(getOrder(event.id, o.id));
});

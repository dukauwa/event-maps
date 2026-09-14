import { z } from "zod";
import { notFound, ok, optionsResponse, parseBody, requireEvent, withApi } from "@/lib/api/http";
import { getExhibitor } from "@/lib/services/exhibitors";
import { assignExtra, listExhibitorExtras, removeExtra } from "@/lib/services/extras";

type Ctx = { params: Promise<{ event: string; id: string }> };
export const OPTIONS = () => optionsResponse();
export const GET = withApi(async (req: Request, ctx: Ctx) => { const p = await ctx.params; const { event } = await requireEvent(req, p.event); const e = getExhibitor(event.id, p.id); if (!e) throw notFound("exhibitor"); return ok(listExhibitorExtras(event.id, e.id)); });
export const POST = withApi(async (req: Request, ctx: Ctx) => {
  const p = await ctx.params; const { event } = await requireEvent(req, p.event, "write");
  const e = getExhibitor(event.id, p.id); if (!e) throw notFound("exhibitor");
  const { extraId, quantity, boothId } = await parseBody(req, z.object({ extraId: z.string(), quantity: z.number().int().positive().optional(), boothId: z.string().nullish() }));
  return ok(assignExtra(event, e.id, extraId, quantity ?? 1, boothId));
});
export const DELETE = withApi(async (req: Request, ctx: Ctx) => {
  const p = await ctx.params; const { event } = await requireEvent(req, p.event, "write");
  const e = getExhibitor(event.id, p.id); if (!e) throw notFound("exhibitor");
  const { extraId } = await parseBody(req, z.object({ extraId: z.string() }));
  return ok(removeExtra(event, e.id, extraId));
});

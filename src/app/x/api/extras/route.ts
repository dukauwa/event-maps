import { z } from "zod";
import { badRequest, ok, parseBody, withApi } from "@/lib/api/http";
import { assignExtra, getExtra, listExhibitorExtras, removeExtra } from "@/lib/services/extras";
import { requirePortal } from "../_auth";

export const GET = withApi(async () => { const { exhibitor, event } = await requirePortal(); return ok(listExhibitorExtras(event.id, exhibitor.id)); });
export const POST = withApi(async (req: Request) => {
  const { exhibitor, event } = await requirePortal();
  const { extraId, quantity } = await parseBody(req, z.object({ extraId: z.string(), quantity: z.number().int().positive().max(50).optional() }));
  const extra = getExtra(event.id, extraId);
  if (!extra || !extra.reserveOrBuyAllowed) throw badRequest("This add-on cannot be booked online");
  return ok(assignExtra(event, exhibitor.id, extraId, quantity ?? 1, null));
});
export const DELETE = withApi(async (req: Request) => {
  const { exhibitor, event } = await requirePortal();
  const { extraId } = await parseBody(req, z.object({ extraId: z.string() }));
  return ok(removeExtra(event, exhibitor.id, extraId));
});

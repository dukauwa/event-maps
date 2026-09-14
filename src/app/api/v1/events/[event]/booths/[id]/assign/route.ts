import { z } from "zod";
import { notFound, ok, optionsResponse, parseBody, requireEvent, withApi } from "@/lib/api/http";
import { assignExhibitor, getBooth, setBoothExhibitors, unassignExhibitor } from "@/lib/services/booths";

type Ctx = { params: Promise<{ event: string; id: string }> };
export const OPTIONS = () => optionsResponse();
/** POST { exhibitorId, markSold? } adds an exhibitor; PUT { exhibitorIds } replaces; DELETE { exhibitorId } removes. */
export const POST = withApi(async (req: Request, ctx: Ctx) => {
  const p = await ctx.params; const { event } = await requireEvent(req, p.event, "write");
  const b = getBooth(event.id, p.id); if (!b) throw notFound("booth");
  const { exhibitorId, markSold } = await parseBody(req, z.object({ exhibitorId: z.string(), markSold: z.boolean().optional() }));
  return ok(assignExhibitor(event, b.id, exhibitorId, { markSold }));
});
export const PUT = withApi(async (req: Request, ctx: Ctx) => {
  const p = await ctx.params; const { event } = await requireEvent(req, p.event, "write");
  const b = getBooth(event.id, p.id); if (!b) throw notFound("booth");
  const { exhibitorIds } = await parseBody(req, z.object({ exhibitorIds: z.array(z.string()) }));
  return ok(setBoothExhibitors(event, b.id, exhibitorIds));
});
export const DELETE = withApi(async (req: Request, ctx: Ctx) => {
  const p = await ctx.params; const { event } = await requireEvent(req, p.event, "write");
  const b = getBooth(event.id, p.id); if (!b) throw notFound("booth");
  const { exhibitorId } = await parseBody(req, z.object({ exhibitorId: z.string() }));
  return ok(unassignExhibitor(event, b.id, exhibitorId));
});

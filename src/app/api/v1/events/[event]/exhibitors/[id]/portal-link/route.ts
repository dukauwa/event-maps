import { notFound, ok, optionsResponse, requireEvent, withApi } from "@/lib/api/http";
import { getExhibitor, rotatePortalToken } from "@/lib/services/exhibitors";
import { requestOrigin } from "@/lib/auth/session";

type Ctx = { params: Promise<{ event: string; id: string }> };
export const OPTIONS = () => optionsResponse();
/** GET returns the exhibitor's self-service magic link; POST rotates it. */
export const GET = withApi(async (req: Request, ctx: Ctx) => {
  const p = await ctx.params; const { event } = await requireEvent(req, p.event);
  const e = getExhibitor(event.id, p.id); if (!e) throw notFound("exhibitor");
  return ok({ url: `${await requestOrigin()}/x/${e.portalToken}` });
});
export const POST = withApi(async (req: Request, ctx: Ctx) => {
  const p = await ctx.params; const { event } = await requireEvent(req, p.event, "write");
  const e = getExhibitor(event.id, p.id); if (!e) throw notFound("exhibitor");
  const token = rotatePortalToken(event.id, e.id);
  return ok({ url: `${await requestOrigin()}/x/${token}` });
});

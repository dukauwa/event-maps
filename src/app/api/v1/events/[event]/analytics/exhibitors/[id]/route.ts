import { notFound, ok, optionsResponse, requireEvent, withApi } from "@/lib/api/http";
import { exhibitorAnalytics } from "@/lib/services/analytics";
import { getExhibitor } from "@/lib/services/exhibitors";

export const OPTIONS = () => optionsResponse();
export const GET = withApi(async (req: Request, ctx: { params: Promise<{ event: string; id: string }> }) => {
  const p = await ctx.params; const { event } = await requireEvent(req, p.event);
  const e = await getExhibitor(event.id, p.id); if (!e) throw notFound("exhibitor");
  return ok(await exhibitorAnalytics(event.id, e.id));
});

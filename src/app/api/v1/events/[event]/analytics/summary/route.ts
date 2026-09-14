import { ok, optionsResponse, requireEvent, withApi } from "@/lib/api/http";
import { analyticsSummary } from "@/lib/services/analytics";

export const OPTIONS = () => optionsResponse();
/** `?from=ISO&to=ISO` (default last 30 days). */
export const GET = withApi(async (req: Request, ctx: { params: Promise<{ event: string }> }) => {
  const { event } = await requireEvent(req, (await ctx.params).event);
  const q = new URL(req.url).searchParams;
  return ok(analyticsSummary(event.id, q.get("from") ?? undefined, q.get("to") ?? undefined));
});

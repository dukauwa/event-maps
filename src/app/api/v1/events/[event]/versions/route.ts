import { ok, optionsResponse, requireEvent, withApi } from "@/lib/api/http";
import { listVersions } from "@/lib/services/events";

export const OPTIONS = () => optionsResponse();
export const GET = withApi(async (req: Request, ctx: { params: Promise<{ event: string }> }) => {
  const { event } = await requireEvent(req, (await ctx.params).event);
  return ok(listVersions(event.id));
});

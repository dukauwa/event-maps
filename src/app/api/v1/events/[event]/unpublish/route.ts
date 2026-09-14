import { ok, optionsResponse, requireEvent, withApi } from "@/lib/api/http";
import { unpublishEvent } from "@/lib/services/events";

export const OPTIONS = () => optionsResponse();
export const POST = withApi(async (req: Request, ctx: { params: Promise<{ event: string }> }) => {
  const { event, principal } = await requireEvent(req, (await ctx.params).event, "write");
  unpublishEvent(principal.orgId, event.id);
  return ok({ status: "draft" });
});

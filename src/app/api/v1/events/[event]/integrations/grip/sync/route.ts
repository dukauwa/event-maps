import { z } from "zod";
import { ok, optionsResponse, parseBody, requireEvent, withApi } from "@/lib/api/http";
import { syncFromGrip } from "@/lib/services/grip";

export const OPTIONS = () => optionsResponse();
/** Pull exhibitors from Grip (or any JSON/CSV source URL) into this event. Body: `{ sourceUrl?, dryRun? }`. */
export const POST = withApi(async (req: Request, ctx: { params: Promise<{ event: string }> }) => {
  const { event, principal } = await requireEvent(req, (await ctx.params).event, "write");
  const body = await parseBody(req, z.object({ sourceUrl: z.string().url().optional(), dryRun: z.boolean().optional() }).default({}));
  return ok(await syncFromGrip(principal.orgId, event, body));
});

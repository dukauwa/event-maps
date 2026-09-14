import { z } from "zod";
import { ok, optionsResponse, parseBody, requireEvent, withApi } from "@/lib/api/http";
import { mergeBooths } from "@/lib/services/booths";

export const OPTIONS = () => optionsResponse();
export const POST = withApi(async (req: Request, ctx: { params: Promise<{ event: string }> }) => {
  const { event } = await requireEvent(req, (await ctx.params).event, "write");
  const { boothIds, label } = await parseBody(req, z.object({ boothIds: z.array(z.string()).min(2), label: z.string().optional() }));
  return ok(mergeBooths(event, boothIds, label));
});

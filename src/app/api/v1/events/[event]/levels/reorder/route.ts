import { z } from "zod";
import { ok, optionsResponse, parseBody, requireEvent, withApi } from "@/lib/api/http";
import { reorderLevels } from "@/lib/services/levels";

export const OPTIONS = () => optionsResponse();
export const POST = withApi(async (req: Request, ctx: { params: Promise<{ event: string }> }) => {
  const { event } = await requireEvent(req, (await ctx.params).event, "write");
  const { ids } = await parseBody(req, z.object({ ids: z.array(z.string()) }));
  return ok(reorderLevels(event.id, ids));
});

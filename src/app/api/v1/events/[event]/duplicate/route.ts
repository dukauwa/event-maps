import { z } from "zod";
import { ok, optionsResponse, parseBody, requireEvent, withApi } from "@/lib/api/http";
import { duplicateEvent } from "@/lib/services/events";

export const OPTIONS = () => optionsResponse();
export const POST = withApi(async (req: Request, ctx: { params: Promise<{ event: string }> }) => {
  const { event, principal } = await requireEvent(req, (await ctx.params).event, "write");
  const input = await parseBody(req, z.object({ name: z.string().min(1), slug: z.string().optional(), includeExhibitors: z.boolean().optional() }));
  return ok(duplicateEvent(principal.orgId, event.id, input), { status: 201 });
});

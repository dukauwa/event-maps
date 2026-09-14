import { z } from "zod";
import { ok, optionsResponse, requireEvent, withApi } from "@/lib/api/http";
import { publishEvent } from "@/lib/services/events";

export const OPTIONS = () => optionsResponse();
export const POST = withApi(async (req: Request, ctx: { params: Promise<{ event: string }> }) => {
  const { event, principal } = await requireEvent(req, (await ctx.params).event, "write");
  const body = await req.json().catch(() => ({}));
  const { note } = z.object({ note: z.string().max(500).optional() }).parse(body ?? {});
  return ok(publishEvent(principal.orgId, event.id, note));
});

import { z } from "zod";
import { notFound, ok, optionsResponse, parseBody, requireEvent, withApi } from "@/lib/api/http";
import { getBooth, setBoothStatus } from "@/lib/services/booths";
import { BOOTH_STATUSES } from "@/lib/domain/types";

export const OPTIONS = () => optionsResponse();
export const POST = withApi(async (req: Request, ctx: { params: Promise<{ event: string; id: string }> }) => {
  const p = await ctx.params; const { event } = await requireEvent(req, p.event, "write");
  const b = getBooth(event.id, p.id); if (!b) throw notFound("booth");
  const { status, holdMinutes } = await parseBody(req, z.object({ status: z.enum(BOOTH_STATUSES), holdMinutes: z.number().int().positive().optional() }));
  const holdUntil = status === "held" ? new Date(Date.now() + (holdMinutes ?? event.settings.sales.holdMinutes ?? 30) * 60e3).toISOString() : null;
  return ok(setBoothStatus(event, b.id, status, holdUntil));
});

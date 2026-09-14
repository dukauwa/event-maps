import { notFound, ok, optionsResponse, parseBody, withApi } from "@/lib/api/http";
import { db } from "@/lib/db";
import { findEventBySlugOrId } from "@/lib/bundle";
import { analyticsInput, ingestAnalytics } from "@/lib/services/analytics";

export const OPTIONS = () => optionsResponse();
/** Public ingestion endpoint used by the viewer (sendBeacon). No auth; rate-limited by batch size. */
export const POST = withApi(async (req: Request, ctx: { params: Promise<{ event: string }> }) => {
  const event = findEventBySlugOrId(db(), (await ctx.params).event);
  if (!event) throw notFound("event");
  const input = await parseBody(req, analyticsInput);
  return ok({ accepted: ingestAnalytics(event.id, input, req.headers.get("user-agent")) }, { status: 202 });
});

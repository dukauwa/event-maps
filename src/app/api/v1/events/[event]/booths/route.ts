import { z } from "zod";
import { ok, optionsResponse, paginate, parseBody, requireEvent, withApi } from "@/lib/api/http";
import { boothInput, bulkUpsertBooths, createBooth, listBooths, releaseExpiredHolds } from "@/lib/services/booths";
import type { BoothStatus } from "@/lib/domain/types";

type Ctx = { params: Promise<{ event: string }> };
export const OPTIONS = () => optionsResponse();
/** List booths. Filters: `levelId`, `status`, `q`, `exhibitorId`. Paginated with `limit`/`offset`. */
export const GET = withApi(async (req: Request, ctx: Ctx) => {
  const { event } = await requireEvent(req, (await ctx.params).event);
  releaseExpiredHolds(event);
  const q = new URL(req.url).searchParams;
  const rows = listBooths(event.id, { levelId: q.get("levelId") ?? undefined, status: (q.get("status") as BoothStatus) ?? undefined, q: q.get("q") ?? undefined, exhibitorId: q.get("exhibitorId") ?? undefined });
  const { data, meta } = paginate(rows, req);
  return ok(data, { meta });
});
/** Create one booth (object) or bulk-upsert many (array; matched by externalId, then label). */
export const POST = withApi(async (req: Request, ctx: Ctx) => {
  const { event } = await requireEvent(req, (await ctx.params).event, "write");
  const body = await parseBody(req, z.union([boothInput, z.array(boothInput).max(5000)]));
  if (Array.isArray(body)) return ok(bulkUpsertBooths(event, body));
  return ok(createBooth(event, body), { status: 201 });
});

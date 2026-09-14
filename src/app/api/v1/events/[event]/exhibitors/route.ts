import { z } from "zod";
import { ok, optionsResponse, paginate, parseBody, requireEvent, withApi } from "@/lib/api/http";
import { bulkUpsertExhibitors, createExhibitor, exhibitorInput, listExhibitors } from "@/lib/services/exhibitors";

type Ctx = { params: Promise<{ event: string }> };
export const OPTIONS = () => optionsResponse();
/** Filters: `q`, `categoryId`, `levelId`, `featured`, `unassigned`. */
export const GET = withApi(async (req: Request, ctx: Ctx) => {
  const { event } = await requireEvent(req, (await ctx.params).event);
  const q = new URL(req.url).searchParams;
  const rows = listExhibitors(event.id, { q: q.get("q") ?? undefined, categoryId: q.get("categoryId") ?? undefined, levelId: q.get("levelId") ?? undefined, featured: q.has("featured") ? q.get("featured") === "1" : undefined, unassigned: q.get("unassigned") === "1" });
  const { data, meta } = paginate(rows, req);
  return ok(data, { meta });
});
/** Create one (object) or bulk-upsert many (array; matched by externalId, gripId, then name). */
export const POST = withApi(async (req: Request, ctx: Ctx) => {
  const { event } = await requireEvent(req, (await ctx.params).event, "write");
  const body = await parseBody(req, z.union([exhibitorInput, z.array(exhibitorInput).max(5000)]));
  if (Array.isArray(body)) return ok(bulkUpsertExhibitors(event, body));
  return ok(createExhibitor(event, body), { status: 201 });
});

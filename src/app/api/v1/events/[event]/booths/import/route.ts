import { ok, optionsResponse, readCsv, requireEvent, withApi } from "@/lib/api/http";
import { importBoothsCsv } from "@/lib/services/import-export";

export const OPTIONS = () => optionsResponse();
/** Body: `{ csv }` (text) or multipart with a `file` field. Columns: label, level, x, y, width, height, type, status, price, external_id, notes. */
export const POST = withApi(async (req: Request, ctx: { params: Promise<{ event: string }> }) => {
  const { event } = await requireEvent(req, (await ctx.params).event, "write");
  const csv = await readCsv(req);
  return ok(importBoothsCsv(event, csv));
});

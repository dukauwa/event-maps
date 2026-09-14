import { ok, optionsResponse, readCsv, requireEvent, withApi } from "@/lib/api/http";
import { importSessionsCsv } from "@/lib/services/import-export";

export const OPTIONS = () => optionsResponse();
export const POST = withApi(async (req: Request, ctx: { params: Promise<{ event: string }> }) => {
  const { event } = await requireEvent(req, (await ctx.params).event, "write");
  return ok(importSessionsCsv(event, await readCsv(req)));
});

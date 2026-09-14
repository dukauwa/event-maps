import { ok, optionsResponse, readCsv, requireEvent, withApi } from "@/lib/api/http";
import { importExhibitorsCsv } from "@/lib/services/import-export";

export const OPTIONS = () => optionsResponse();
/** CSV import (ExpoFP template compatible): name, exhibitor_id, booth(s), category, description, address, phone, email, website, socials, contact_name, logo_url, tags, featured. */
export const POST = withApi(async (req: Request, ctx: { params: Promise<{ event: string }> }) => {
  const { event } = await requireEvent(req, (await ctx.params).event, "write");
  return ok(importExhibitorsCsv(event, await readCsv(req)));
});

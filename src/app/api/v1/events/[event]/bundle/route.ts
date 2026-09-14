import { ok, optionsResponse, requireEvent, withApi } from "@/lib/api/http";
import { buildBundle, getPublishedBundle } from "@/lib/bundle";
import { db } from "@/lib/db";

export const OPTIONS = () => optionsResponse();
/** Live (draft) bundle, or `?published=1` for the last published snapshot. */
export const GET = withApi(async (req: Request, ctx: { params: Promise<{ event: string }> }) => {
  const { event } = await requireEvent(req, (await ctx.params).event);
  const published = new URL(req.url).searchParams.get("published") === "1";
  const bundle = published ? getPublishedBundle(db(), event.id) : buildBundle(db(), event.id);
  return ok(bundle);
});

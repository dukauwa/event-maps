import { ok, optionsResponse, requirePrincipal, withApi } from "@/lib/api/http";
import { listDeliveries, listWebhooks } from "@/lib/services/webhooks";
import { notFound } from "@/lib/api/http";

export const OPTIONS = () => optionsResponse();
export const GET = withApi(async (req: Request, ctx: { params: Promise<{ id: string }> }) => {
  const p = await requirePrincipal(req); const { id } = await ctx.params;
  if (!listWebhooks(p.orgId).some((w) => w.id === id)) throw notFound("webhook");
  return ok(listDeliveries(id));
});

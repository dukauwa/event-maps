import { notFound, ok, optionsResponse, requirePrincipal, withApi } from "@/lib/api/http";
import { testWebhook } from "@/lib/services/webhooks";

export const OPTIONS = () => optionsResponse();
export const POST = withApi(async (req: Request, ctx: { params: Promise<{ id: string }> }) => { const p = await requirePrincipal(req, "write"); const r = await testWebhook(p.orgId, (await ctx.params).id); if (!r) throw notFound("webhook"); return ok(r); });

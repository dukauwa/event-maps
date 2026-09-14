import { ok, optionsResponse, requirePrincipal, withApi } from "@/lib/api/http";
import { revokeApiKey } from "@/lib/services/apikeys";

export const OPTIONS = () => optionsResponse();
export const DELETE = withApi(async (req: Request, ctx: { params: Promise<{ id: string }> }) => { const p = await requirePrincipal(req, "admin"); revokeApiKey(p.orgId, (await ctx.params).id); return ok({ revoked: true }); });

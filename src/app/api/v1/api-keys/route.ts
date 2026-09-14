import { z } from "zod";
import { forbidden, ok, optionsResponse, parseBody, requirePrincipal, withApi } from "@/lib/api/http";
import { createApiKey, listApiKeys } from "@/lib/services/apikeys";

export const OPTIONS = () => optionsResponse();
export const GET = withApi(async (req: Request) => { const p = await requirePrincipal(req); return ok(listApiKeys(p.orgId)); });
/** Organiser session only. The full key is returned exactly once. */
export const POST = withApi(async (req: Request) => {
  const p = await requirePrincipal(req, "admin");
  if (p.kind !== "user") throw forbidden("Create API keys from the organiser portal");
  const { name, scopes } = await parseBody(req, z.object({ name: z.string().min(1).max(80), scopes: z.array(z.enum(["read", "write"])).optional() }));
  return ok(createApiKey(p.orgId, name, scopes), { status: 201 });
});

import { ok, optionsResponse, requirePrincipal, withApi } from "@/lib/api/http";
import { db, schema } from "@/lib/db";
import { eq } from "drizzle-orm";

export const OPTIONS = () => optionsResponse();
export const GET = withApi(async (req: Request) => {
  const p = await requirePrincipal(req);
  const org = db().select().from(schema.organizations).where(eq(schema.organizations.id, p.orgId)).get();
  return ok({ kind: p.kind, orgId: p.orgId, orgName: org?.name, scopes: p.scopes, userId: p.userId ?? null });
});

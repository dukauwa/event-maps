import { destroyUserSession } from "@/lib/auth/session";
import { ok, withApi } from "@/lib/api/http";

export const POST = withApi(async () => {
  await destroyUserSession();
  return ok({ signedOut: true });
});

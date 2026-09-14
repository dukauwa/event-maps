import { currentUser } from "@/lib/auth/session";
import { fail, ok, withApi } from "@/lib/api/http";

export const GET = withApi(async () => {
  const u = await currentUser();
  if (!u) return fail(401, "unauthorized", "Not signed in");
  return ok(u);
});

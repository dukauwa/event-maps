import { cookies } from "next/headers";
import { z } from "zod";
import { fail, ok, parseBody, withApi } from "@/lib/api/http";
import { EXHIBITOR_COOKIE } from "@/lib/auth/session";
import { resolvePortal } from "@/lib/portal/auth";

/** Exchange a magic-link token for the portal cookie. */
export const POST = withApi(async (req: Request) => {
  const { token } = await parseBody(req, z.object({ token: z.string().min(10) }));
  const r = resolvePortal(token);
  if (!r) return fail(401, "invalid_token", "Invalid exhibitor link");
  const jar = await cookies();
  jar.set(EXHIBITOR_COOKIE, token, { httpOnly: true, sameSite: "lax", secure: process.env.NODE_ENV === "production", path: "/", maxAge: 60 * 60 * 24 * 90 });
  return ok({ exhibitorId: r.exhibitor.id });
});

import { z } from "zod";
import { eq } from "drizzle-orm";
import { db, schema } from "@/lib/db";
import { verifyPassword } from "@/lib/auth/password";
import { createUserSession } from "@/lib/auth/session";
import { fail, ok, parseBody, withApi } from "@/lib/api/http";

const input = z.object({ email: z.string().email(), password: z.string().min(1) });

export const POST = withApi(async (req: Request) => {
  const { email, password } = await parseBody(req, input);
  const user = db().select().from(schema.users).where(eq(schema.users.email, email.toLowerCase().trim())).get();
  if (!user || !verifyPassword(password, user.passwordHash)) return fail(401, "invalid_credentials", "Email or password is incorrect");
  await createUserSession(user.id);
  return ok({ id: user.id, email: user.email, name: user.name, role: user.role, orgId: user.orgId });
});

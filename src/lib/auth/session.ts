import { cookies, headers } from "next/headers";
import { eq, and, gt } from "drizzle-orm";
import { db, schema } from "@/lib/db";
import { BRAND } from "@/lib/brand";
import { secretToken } from "@/lib/ids";
import { sha256 } from "./password";

export const SESSION_COOKIE = `${BRAND.cookiePrefix}_session`;
export const EXHIBITOR_COOKIE = `${BRAND.cookiePrefix}_exhibitor`;
const SESSION_DAYS = 30;

export interface AuthUser {
  id: string;
  orgId: string;
  email: string;
  name: string;
  role: "owner" | "admin" | "editor" | "viewer";
}

export async function createUserSession(userId: string): Promise<string> {
  const token = secretToken(48);
  const expiresAt = new Date(Date.now() + SESSION_DAYS * 86400e3).toISOString();
  db().insert(schema.userSessions).values({ token, userId, expiresAt }).run();
  const jar = await cookies();
  jar.set(SESSION_COOKIE, token, {
    httpOnly: true,
    sameSite: "lax",
    secure: process.env.NODE_ENV === "production",
    path: "/",
    expires: new Date(expiresAt),
  });
  return token;
}

export async function destroyUserSession(): Promise<void> {
  const jar = await cookies();
  const token = jar.get(SESSION_COOKIE)?.value;
  if (token) db().delete(schema.userSessions).where(eq(schema.userSessions.token, token)).run();
  jar.delete(SESSION_COOKIE);
}

export function userFromSessionToken(token: string | undefined): AuthUser | null {
  if (!token) return null;
  const row = db()
    .select({ user: schema.users })
    .from(schema.userSessions)
    .innerJoin(schema.users, eq(schema.users.id, schema.userSessions.userId))
    .where(and(eq(schema.userSessions.token, token), gt(schema.userSessions.expiresAt, new Date().toISOString())))
    .get();
  if (!row) return null;
  const { id, orgId, email, name, role } = row.user;
  return { id, orgId, email, name, role };
}

/** Current organiser user from the session cookie (server components / route handlers). */
export async function currentUser(): Promise<AuthUser | null> {
  const jar = await cookies();
  return userFromSessionToken(jar.get(SESSION_COOKIE)?.value);
}

export async function requireUser(): Promise<AuthUser> {
  const u = await currentUser();
  if (!u) throw new AuthError("Not signed in");
  return u;
}

export class AuthError extends Error {
  status = 401;
}

/* ---------------- API keys ---------------- */

export interface ApiPrincipal {
  kind: "api_key" | "user";
  orgId: string;
  scopes: string[];
  userId?: string;
  apiKeyId?: string;
}

export function generateApiKey(): { raw: string; prefix: string; hash: string } {
  const raw = `${BRAND.apiKeyPrefix}_live_${secretToken(40)}`;
  return { raw, prefix: raw.slice(0, 16), hash: sha256(raw) };
}

export function principalFromApiKey(raw: string | null | undefined): ApiPrincipal | null {
  if (!raw) return null;
  const key = db().select().from(schema.apiKeys).where(eq(schema.apiKeys.keyHash, sha256(raw))).get();
  if (!key || key.revokedAt) return null;
  db().update(schema.apiKeys).set({ lastUsedAt: new Date().toISOString() }).where(eq(schema.apiKeys.id, key.id)).run();
  return { kind: "api_key", orgId: key.orgId, scopes: key.scopes, apiKeyId: key.id };
}

/**
 * Resolve the caller of an API route: `Authorization: Bearer <key>`, `X-Api-Key`, `?api_key=`, or the
 * organiser session cookie (so the admin UI can call the same API).
 */
export async function apiPrincipal(req: Request): Promise<ApiPrincipal | null> {
  const auth = req.headers.get("authorization");
  const bearer = auth?.toLowerCase().startsWith("bearer ") ? auth.slice(7).trim() : null;
  const url = new URL(req.url);
  const raw = bearer || req.headers.get("x-api-key") || url.searchParams.get("api_key");
  if (raw) return principalFromApiKey(raw);
  const jar = await cookies();
  const user = userFromSessionToken(jar.get(SESSION_COOKIE)?.value);
  if (user) return { kind: "user", orgId: user.orgId, scopes: ["read", "write", "admin"], userId: user.id };
  return null;
}

/** Exhibitor portal principal, from the magic-link cookie. */
export async function currentExhibitor() {
  const jar = await cookies();
  const token = jar.get(EXHIBITOR_COOKIE)?.value;
  if (!token) return null;
  return db().select().from(schema.exhibitors).where(eq(schema.exhibitors.portalToken, token)).get() ?? null;
}

export async function requestOrigin(): Promise<string> {
  const h = await headers();
  const proto = h.get("x-forwarded-proto") ?? "http";
  const host = h.get("x-forwarded-host") ?? h.get("host") ?? "localhost:3000";
  return process.env.APP_URL || `${proto}://${host}`;
}

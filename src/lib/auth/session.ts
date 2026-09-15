import { cookies, headers } from "next/headers";
import { createHmac, timingSafeEqual } from "node:crypto";
import { eq } from "drizzle-orm";
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

/**
 * Sessions are a signed cookie rather than a database row. A row would tie the session to whichever
 * process wrote it, which breaks on any host that runs more than one instance (a serverless deployment
 * signs you in on one instance and rejects you on the next). The cookie carries the user id and an
 * expiry, signed with AUTH_SECRET.
 */
function authSecret(): string {
  const secret = process.env.AUTH_SECRET || process.env.SESSION_SECRET;
  if (secret) return secret;
  if (process.env.NODE_ENV === "production" && !warnedAboutSecret) {
    warnedAboutSecret = true;
    console.warn("[tessera] AUTH_SECRET is not set; using the built-in demo key. Set AUTH_SECRET before putting this in front of real users.");
  }
  return "tessera-demo-signing-key";
}
let warnedAboutSecret = false;

function signSession(body: string): string {
  return createHmac("sha256", authSecret()).update(body).digest("base64url");
}

function issueSessionToken(userId: string, expiresAtMs: number): string {
  const body = `${userId}.${expiresAtMs}`;
  return `${body}.${signSession(body)}`;
}

/** Returns the user id when the signature and expiry check out. */
function readSessionToken(token: string): string | null {
  const at = token.lastIndexOf(".");
  if (at < 0) return null;
  const body = token.slice(0, at);
  const given = Buffer.from(token.slice(at + 1), "base64url");
  const expected = Buffer.from(signSession(body), "base64url");
  if (given.length !== expected.length || !timingSafeEqual(given, expected)) return null;
  const dot = body.lastIndexOf(".");
  const userId = body.slice(0, dot);
  const expiresAt = Number(body.slice(dot + 1));
  if (!userId || !Number.isFinite(expiresAt) || expiresAt < Date.now()) return null;
  return userId;
}

export async function createUserSession(userId: string): Promise<string> {
  const expiresAtMs = Date.now() + SESSION_DAYS * 86400e3;
  const token = issueSessionToken(userId, expiresAtMs);
  const jar = await cookies();
  jar.set(SESSION_COOKIE, token, {
    httpOnly: true,
    sameSite: "lax",
    secure: process.env.NODE_ENV === "production",
    path: "/",
    expires: new Date(expiresAtMs),
  });
  return token;
}

export async function destroyUserSession(): Promise<void> {
  const jar = await cookies();
  jar.delete(SESSION_COOKIE);
}

export function userFromSessionToken(token: string | undefined): AuthUser | null {
  if (!token) return null;
  const userId = readSessionToken(token);
  if (!userId) return null;
  const user = db().select().from(schema.users).where(eq(schema.users.id, userId)).get();
  if (!user) return null;
  const { id, orgId, email, name, role } = user;
  return { id, orgId, email, name, role };
}

/** `cookies()` throws outside a request scope (scripts, tests); treat that as "no cookies". */
async function safeCookies() {
  try { return await cookies(); } catch { return null; }
}

/** Current organiser user from the session cookie (server components / route handlers). */
export async function currentUser(): Promise<AuthUser | null> {
  const jar = await safeCookies();
  return userFromSessionToken(jar?.get(SESSION_COOKIE)?.value);
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
  const jar = await safeCookies();
  const user = userFromSessionToken(jar?.get(SESSION_COOKIE)?.value);
  if (user) return { kind: "user", orgId: user.orgId, scopes: ["read", "write", "admin"], userId: user.id };
  return null;
}

/** Exhibitor portal principal, from the magic-link cookie. */
export async function currentExhibitor() {
  const jar = await safeCookies();
  const token = jar?.get(EXHIBITOR_COOKIE)?.value;
  if (!token) return null;
  return db().select().from(schema.exhibitors).where(eq(schema.exhibitors.portalToken, token)).get() ?? null;
}

export async function requestOrigin(): Promise<string> {
  if (process.env.APP_URL) return process.env.APP_URL;
  try {
    const h = await headers();
    const proto = h.get("x-forwarded-proto") ?? "http";
    const host = h.get("x-forwarded-host") ?? h.get("host") ?? "localhost:3000";
    return `${proto}://${host}`;
  } catch {
    return "http://localhost:3000";
  }
}

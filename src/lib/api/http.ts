import { NextResponse } from "next/server";
import { ZodError, type ZodType } from "zod";
import { db } from "@/lib/db";
import { apiPrincipal, AuthError, type ApiPrincipal } from "@/lib/auth/session";
import { findEventBySlugOrId } from "@/lib/bundle";
import type { Event } from "@/lib/db/schema";

export const CORS_HEADERS = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Methods": "GET, POST, PUT, PATCH, DELETE, OPTIONS",
  "Access-Control-Allow-Headers": "Authorization, Content-Type, X-Api-Key",
  "Access-Control-Max-Age": "86400",
};

export class ApiError extends Error {
  constructor(public status: number, public code: string, message: string, public details?: unknown) {
    super(message);
  }
}

export const notFound = (what = "resource") => new ApiError(404, "not_found", `${what} not found`);
export const badRequest = (message: string, details?: unknown) => new ApiError(400, "bad_request", message, details);
export const forbidden = (message = "Forbidden") => new ApiError(403, "forbidden", message);
export const conflict = (message: string, details?: unknown) => new ApiError(409, "conflict", message, details);

export function ok<T>(data: T, init?: { status?: number; headers?: Record<string, string>; meta?: unknown }) {
  const body: Record<string, unknown> = { data };
  if (init?.meta !== undefined) body.meta = init.meta;
  return NextResponse.json(body, { status: init?.status ?? 200, headers: { ...CORS_HEADERS, ...(init?.headers ?? {}) } });
}

export function fail(status: number, code: string, message: string, details?: unknown) {
  return NextResponse.json({ error: { code, message, ...(details !== undefined ? { details } : {}) } }, { status, headers: CORS_HEADERS });
}

export function optionsResponse() {
  return new NextResponse(null, { status: 204, headers: CORS_HEADERS });
}

type Handler<C> = (req: Request, ctx: C) => Promise<Response> | Response;

/** Wrap a route handler: converts thrown ApiError / ZodError / AuthError into JSON error responses. */
export function withApi<C>(handler: Handler<C>): Handler<C> {
  return async (req, ctx) => {
    try {
      return await handler(req, ctx);
    } catch (e) {
      if (e instanceof ApiError) return fail(e.status, e.code, e.message, e.details);
      if (e instanceof ZodError) return fail(400, "validation_error", "Invalid request", e.issues);
      if (e instanceof AuthError) return fail(401, "unauthorized", e.message);
      console.error("[api]", e);
      return fail(500, "internal_error", e instanceof Error ? e.message : "Internal error");
    }
  };
}

export async function parseBody<T>(req: Request, schema: ZodType<T>): Promise<T> {
  let raw: unknown;
  try {
    raw = await req.json();
  } catch {
    throw badRequest("Body must be JSON");
  }
  return schema.parse(raw);
}

export function parseQuery<T>(req: Request, schema: ZodType<T>): T {
  const url = new URL(req.url);
  const obj: Record<string, string> = {};
  url.searchParams.forEach((v, k) => (obj[k] = v));
  return schema.parse(obj);
}

export async function requirePrincipal(req: Request, scope: "read" | "write" | "admin" = "read"): Promise<ApiPrincipal> {
  const p = await apiPrincipal(req);
  if (!p) throw new ApiError(401, "unauthorized", "Provide an API key (Authorization: Bearer <key>) or sign in");
  if (scope !== "read" && !p.scopes.includes(scope) && !p.scopes.includes("admin")) throw forbidden(`This key lacks the '${scope}' scope`);
  return p;
}

/** Resolve an event the caller may access. */
export async function requireEvent(req: Request, slugOrId: string, scope: "read" | "write" | "admin" = "read"): Promise<{ principal: ApiPrincipal; event: Event }> {
  const principal = await requirePrincipal(req, scope);
  const event = findEventBySlugOrId(db(), slugOrId);
  if (!event || event.orgId !== principal.orgId) throw notFound("event");
  return { principal, event };
}

export function paginate<T>(items: T[], req: Request): { data: T[]; meta: { total: number; limit: number; offset: number } } {
  const url = new URL(req.url);
  const limit = Math.min(1000, Math.max(1, Number(url.searchParams.get("limit") ?? 200)));
  const offset = Math.max(0, Number(url.searchParams.get("offset") ?? 0));
  return { data: items.slice(offset, offset + limit), meta: { total: items.length, limit, offset } };
}

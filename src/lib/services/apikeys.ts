import { and, eq } from "drizzle-orm";
import { db, schema } from "@/lib/db";
import { newId } from "@/lib/ids";
import { generateApiKey } from "@/lib/auth/session";

export function listApiKeys(orgId: string) {
  return db().select({ id: schema.apiKeys.id, name: schema.apiKeys.name, prefix: schema.apiKeys.prefix, scopes: schema.apiKeys.scopes, lastUsedAt: schema.apiKeys.lastUsedAt, createdAt: schema.apiKeys.createdAt, revokedAt: schema.apiKeys.revokedAt }).from(schema.apiKeys).where(eq(schema.apiKeys.orgId, orgId)).all();
}

/** Returns the raw key exactly once. */
export function createApiKey(orgId: string, name: string, scopes: string[] = ["read", "write"]) {
  const { raw, prefix, hash } = generateApiKey();
  const id = newId("ak");
  db().insert(schema.apiKeys).values({ id, orgId, name, prefix, keyHash: hash, scopes }).run();
  return { id, name, prefix, scopes, key: raw };
}

export function revokeApiKey(orgId: string, id: string) {
  db().update(schema.apiKeys).set({ revokedAt: new Date().toISOString() }).where(and(eq(schema.apiKeys.id, id), eq(schema.apiKeys.orgId, orgId))).run();
}

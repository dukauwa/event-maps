import { and, eq, or, isNull, lte } from "drizzle-orm";
import { createHmac } from "node:crypto";
import { db, schema } from "@/lib/db";
import { newId, secretToken } from "@/lib/ids";
import type { WebhookEventType, WebhookPayload } from "@/lib/domain/types";

const MAX_ATTEMPTS = 5;

export function listWebhooks(orgId: string) {
  return db().select().from(schema.webhooks).where(eq(schema.webhooks.orgId, orgId)).all();
}

export function createWebhook(orgId: string, input: { url: string; eventId?: string | null; events?: WebhookEventType[] | ["*"]; active?: boolean; secret?: string }) {
  const id = newId("wh");
  db().insert(schema.webhooks).values({ id, orgId, eventId: input.eventId ?? null, url: input.url, secret: input.secret || secretToken(32), events: input.events ?? ["*"], active: input.active ?? true }).run();
  return db().select().from(schema.webhooks).where(eq(schema.webhooks.id, id)).get()!;
}

export function updateWebhook(orgId: string, id: string, patch: Partial<{ url: string; eventId: string | null; events: WebhookEventType[] | ["*"]; active: boolean }>) {
  db().update(schema.webhooks).set(patch).where(and(eq(schema.webhooks.id, id), eq(schema.webhooks.orgId, orgId))).run();
  return db().select().from(schema.webhooks).where(eq(schema.webhooks.id, id)).get() ?? null;
}

export function deleteWebhook(orgId: string, id: string) {
  db().delete(schema.webhooks).where(and(eq(schema.webhooks.id, id), eq(schema.webhooks.orgId, orgId))).run();
}

export function listDeliveries(webhookId: string, limit = 50) {
  return db().select().from(schema.webhookDeliveries).where(eq(schema.webhookDeliveries.webhookId, webhookId)).orderBy(schema.webhookDeliveries.createdAt).all().slice(-limit).reverse();
}

export function signPayload(secret: string, timestamp: string, body: string): string {
  return createHmac("sha256", secret).update(`${timestamp}.${body}`).digest("hex");
}

/**
 * Queue an event for every matching active webhook and kick off delivery in the background.
 * Safe to call from request handlers; never throws.
 */
export function emitWebhook<T>(orgId: string, eventId: string, type: WebhookEventType, data: T): void {
  try {
    const hooks = db().select().from(schema.webhooks).where(and(eq(schema.webhooks.orgId, orgId), eq(schema.webhooks.active, true), or(isNull(schema.webhooks.eventId), eq(schema.webhooks.eventId, eventId)))).all();
    const payload: WebhookPayload<T> = { id: newId("wd"), type, createdAt: new Date().toISOString(), eventId, data };
    for (const h of hooks) {
      const wants = (h.events as string[]).includes("*") || (h.events as string[]).includes(type);
      if (!wants) continue;
      db().insert(schema.webhookDeliveries).values({ id: newId("wd"), webhookId: h.id, eventType: type, payload, status: "pending", nextAttemptAt: new Date().toISOString() }).run();
    }
    if (hooks.length) void processPendingDeliveries();
  } catch (e) {
    console.error("[webhooks] emit failed", e);
  }
}

let processing = false;
/** Deliver pending webhook deliveries whose nextAttemptAt has passed. Retries with exponential backoff. */
export async function processPendingDeliveries(): Promise<{ delivered: number; failed: number }> {
  if (processing) return { delivered: 0, failed: 0 };
  processing = true;
  let delivered = 0, failed = 0;
  try {
    const now = new Date().toISOString();
    const rows = db().select().from(schema.webhookDeliveries).where(and(eq(schema.webhookDeliveries.status, "pending"), lte(schema.webhookDeliveries.nextAttemptAt, now))).all().slice(0, 50);
    for (const d of rows) {
      const hook = db().select().from(schema.webhooks).where(eq(schema.webhooks.id, d.webhookId)).get();
      if (!hook) continue;
      const body = JSON.stringify(d.payload);
      const ts = String(Math.floor(Date.now() / 1000));
      const sig = signPayload(hook.secret, ts, body);
      let code: number | null = null, err: string | null = null;
      try {
        const ctrl = new AbortController();
        const timer = setTimeout(() => ctrl.abort(), 10_000);
        const res = await fetch(hook.url, {
          method: "POST",
          headers: { "Content-Type": "application/json", "User-Agent": "Tessera-Webhooks/1", "X-Tessera-Event": d.eventType, "X-Tessera-Delivery": d.id, "X-Tessera-Signature": `t=${ts},v1=${sig}` },
          body,
          signal: ctrl.signal,
        });
        clearTimeout(timer);
        code = res.status;
        if (!res.ok) err = `HTTP ${res.status}`;
      } catch (e) {
        err = e instanceof Error ? e.message : String(e);
      }
      const attempts = d.attempts + 1;
      if (!err) {
        delivered++;
        db().update(schema.webhookDeliveries).set({ status: "success", responseCode: code, attempts, deliveredAt: new Date().toISOString(), lastError: null }).where(eq(schema.webhookDeliveries.id, d.id)).run();
      } else if (attempts >= MAX_ATTEMPTS) {
        failed++;
        db().update(schema.webhookDeliveries).set({ status: "failed", responseCode: code, attempts, lastError: err }).where(eq(schema.webhookDeliveries.id, d.id)).run();
      } else {
        const delayMs = Math.min(3600e3, 30e3 * 2 ** (attempts - 1));
        db().update(schema.webhookDeliveries).set({ responseCode: code, attempts, lastError: err, nextAttemptAt: new Date(Date.now() + delayMs).toISOString() }).where(eq(schema.webhookDeliveries.id, d.id)).run();
      }
    }
  } finally {
    processing = false;
  }
  return { delivered, failed };
}

export function testWebhook(orgId: string, id: string) {
  const hook = db().select().from(schema.webhooks).where(and(eq(schema.webhooks.id, id), eq(schema.webhooks.orgId, orgId))).get();
  if (!hook) return null;
  const payload: WebhookPayload = { id: newId("wd"), type: "floorplan.published", createdAt: new Date().toISOString(), eventId: hook.eventId ?? "test", data: { test: true } };
  const did = newId("wd");
  db().insert(schema.webhookDeliveries).values({ id: did, webhookId: hook.id, eventType: "test.ping", payload, status: "pending", nextAttemptAt: new Date().toISOString() }).run();
  return processPendingDeliveries().then(() => db().select().from(schema.webhookDeliveries).where(eq(schema.webhookDeliveries.id, did)).get() ?? null);
}

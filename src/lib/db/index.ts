/**
 * Database access. One libSQL client per process, shared by every request:
 *
 * - Local dev, tests and Docker: a SQLite file (`DATABASE_PATH`, default `data/app.db`) through libSQL's native driver.
 * - Serverless (Vercel): a hosted libSQL database (Turso) over HTTP, from `TURSO_DATABASE_URL` + `TURSO_AUTH_TOKEN`.
 *   Required there (see ./config.ts); without it the request proxy shows a setup page instead of a half-working app.
 *
 * Migrations and the one-time demo seed run once per process behind a gate that every query awaits.
 */
import { createRequire } from "node:module";
import path from "node:path";
import fs from "node:fs";
import type { Client } from "@libsql/client";
import { createClient as createHttpClient } from "@libsql/client/http";
import { drizzle } from "drizzle-orm/libsql/http";
import type { LibSQLDatabase } from "drizzle-orm/libsql/driver-core";
import { migrate } from "drizzle-orm/libsql/migrator";
import { eq } from "drizzle-orm";
import * as schema from "./schema";
import { DATABASE_SETUP_MESSAGE, databaseMissing, remoteDatabase } from "./config";
import { isSeeded, seedDemo } from "@/lib/seed/demo";
import { publishEvent } from "@/lib/bundle";

export type DB = LibSQLDatabase<typeof schema>;

const globalForDb = globalThis as unknown as { __tesseraDb?: DB; __tesseraReady?: Promise<void> | null };

export { remoteDatabase } from "./config";

export function storageMode(): "hosted" | "file" {
  return remoteDatabase() ? "hosted" : "file";
}

export function getDbPath(): string {
  if (process.env.DATABASE_PATH) return process.env.DATABASE_PATH;
  return path.join(process.cwd(), "data", "app.db");
}

function createFileClient(file: string): Client {
  // Loaded lazily: the native driver is only needed (and only bundled) where a local file is used.
  const require_ = createRequire(path.join(process.cwd(), "package.json"));
  const { createClient } = require_("@libsql/client/sqlite3") as typeof import("@libsql/client/sqlite3");
  // `timeout` is the busy timeout of every pooled connection (a PRAGMA would only reach the first one).
  return createClient({ url: file === ":memory:" ? ":memory:" : `file:${file}`, timeout: 5000 });
}

function createRawClient(): { client: Client; file: boolean } {
  if (databaseMissing()) throw new Error(DATABASE_SETUP_MESSAGE);
  const remote = remoteDatabase();
  if (remote) return { client: createHttpClient({ url: remote.url, authToken: remote.authToken }), file: false };
  const file = getDbPath();
  if (file !== ":memory:") fs.mkdirSync(path.dirname(file), { recursive: true });
  return { client: createFileClient(file), file: true };
}

const MIGRATIONS = () => path.join(process.cwd(), "drizzle");

async function prepare(raw: Client, file: boolean): Promise<void> {
  // WAL lets the dev server, seed scripts and tests read while another process writes.
  if (file) await raw.execute("PRAGMA journal_mode = WAL");
  const d = drizzle(raw, { schema });
  try {
    await migrate(d, { migrationsFolder: MIGRATIONS() });
  } catch (e) {
    // Two cold instances can race on the first migration of a shared database; the loser retries once and finds it applied.
    await new Promise((r) => setTimeout(r, 1500));
    await migrate(d, { migrationsFolder: MIGRATIONS() }).catch(() => { throw e; });
  }
  if (process.env.AUTO_SEED !== "0") await autoSeed(d);
}

const SEED_LOCK = "demo-seed";
const SEED_WAIT_MS = 120_000;
const SEED_STALE_MS = 5 * 60_000;

/** First run: populate the demo event so a fresh deployment works with zero setup. Safe when many instances start at once. */
async function autoSeed(d: DB): Promise<void> {
  if (await isSeeded(d)) return;
  const nowIso = () => new Date().toISOString();
  const claim = await d.insert(schema.appMeta).values({ key: SEED_LOCK, value: "running", updatedAt: nowIso() }).onConflictDoNothing().run();
  if (claim.rowsAffected === 0) {
    // Another instance holds the lock: wait for it, or take over if it died mid-seed.
    const t0 = Date.now();
    while (Date.now() - t0 < SEED_WAIT_MS) {
      const lock = await d.select().from(schema.appMeta).where(eq(schema.appMeta.key, SEED_LOCK)).get();
      if (!lock || lock.value === "done") return;
      if (Date.now() - Date.parse(lock.updatedAt) > SEED_STALE_MS) break;
      await new Promise((r) => setTimeout(r, 750));
    }
    if (await isSeeded(d)) return;
    await d.update(schema.appMeta).set({ value: "running", updatedAt: nowIso() }).where(eq(schema.appMeta.key, SEED_LOCK)).run();
  }
  const r = await seedDemo(d);
  await publishEvent(d, r.eventId, "Initial publish");
  await d.update(schema.appMeta).set({ value: "done", updatedAt: nowIso() }).where(eq(schema.appMeta.key, SEED_LOCK)).run();
  console.log(`[tessera] seeded demo data (${storageMode()} storage). Organiser login: ${r.adminEmail} / ${r.adminPassword}`);
}

const GATED = new Set<PropertyKey>(["execute", "batch", "migrate", "executeMultiple", "transaction"]);

/** Wraps a client so every call first waits for migrations + seed; the preparation itself uses the raw client. */
function gated(raw: Client, ready: () => Promise<void>): Client {
  return new Proxy(raw, {
    get(target, prop, receiver) {
      const v: unknown = Reflect.get(target, prop, receiver);
      if (typeof v !== "function") return v;
      const fn = v as (...a: unknown[]) => unknown;
      if (GATED.has(prop)) return async (...args: unknown[]) => { await ready(); return fn.apply(target, args); };
      return fn.bind(target);
    },
  });
}

function open(): DB {
  const { client, file } = createRawClient();
  const ready = () => {
    if (!globalForDb.__tesseraReady) {
      // A failed preparation (network blip, lost migration race) is retried by the next query rather than cached.
      globalForDb.__tesseraReady = prepare(client, file).catch((e: unknown) => { globalForDb.__tesseraReady = null; throw e; });
    }
    return globalForDb.__tesseraReady;
  };
  return drizzle(gated(client, ready), { schema });
}

/** Process-wide singleton (survives Next.js HMR). Synchronous; the first query waits for migrations and the seed. */
export function db(): DB {
  if (!globalForDb.__tesseraDb) globalForDb.__tesseraDb = open();
  return globalForDb.__tesseraDb;
}

/** Resolves once migrations and the demo seed have run. */
export async function dbReady(): Promise<void> {
  await db().run("select 1");
}

/** For tests: an isolated in-memory database, migrated, not seeded. */
export async function openTestDb(): Promise<DB> {
  const d = drizzle(createFileClient(":memory:"), { schema });
  await migrate(d, { migrationsFolder: MIGRATIONS() });
  return d;
}

/** Replace the singleton (tests, seed script). */
export function setDb(d: DB | undefined) {
  globalForDb.__tesseraDb = d;
  globalForDb.__tesseraReady = d ? Promise.resolve() : null;
}

export { schema };

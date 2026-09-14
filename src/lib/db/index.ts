import Database from "better-sqlite3";
import { drizzle, type BetterSQLite3Database } from "drizzle-orm/better-sqlite3";
import { migrate } from "drizzle-orm/better-sqlite3/migrator";
import path from "node:path";
import fs from "node:fs";
import * as schema from "./schema";
import { isSeeded, seedDemo } from "@/lib/seed/demo";
import { publishEvent } from "@/lib/bundle";

/** First run: populate the demo event so `pnpm dev` works with zero setup. */
function autoSeed(d: DB) {
  if (isSeeded(d)) return;
  const r = seedDemo(d);
  publishEvent(d, r.eventId, "Initial publish");
  console.log(`[tessera] seeded demo data. Organiser login: ${r.adminEmail} / ${r.adminPassword}`);
}

export type DB = BetterSQLite3Database<typeof schema>;

const globalForDb = globalThis as unknown as { __tesseraDb?: DB; __tesseraSqlite?: Database.Database };

export function getDbPath(): string {
  return process.env.DATABASE_PATH || path.join(process.cwd(), "data", "app.db");
}

function open(): DB {
  const dbPath = getDbPath();
  if (dbPath !== ":memory:") fs.mkdirSync(path.dirname(dbPath), { recursive: true });
  const sqlite = new Database(dbPath);
  sqlite.pragma("journal_mode = WAL");
  sqlite.pragma("foreign_keys = ON");
  sqlite.pragma("busy_timeout = 5000");
  const db = drizzle(sqlite, { schema });
  migrate(db, { migrationsFolder: path.join(process.cwd(), "drizzle") });
  globalForDb.__tesseraSqlite = sqlite;
  if (process.env.AUTO_SEED !== "0") autoSeed(db);
  return db;
}

/** Process-wide singleton (survives Next.js HMR). Migrations run on first open. */
export function db(): DB {
  if (!globalForDb.__tesseraDb) globalForDb.__tesseraDb = open();
  return globalForDb.__tesseraDb;
}

/** For tests: open an isolated in-memory database. */
export function openTestDb(): DB {
  const sqlite = new Database(":memory:");
  sqlite.pragma("foreign_keys = ON");
  const d = drizzle(sqlite, { schema });
  migrate(d, { migrationsFolder: path.join(process.cwd(), "drizzle") });
  return d;
}

/** Replace the singleton (tests). */
export function setDb(d: DB | undefined) {
  globalForDb.__tesseraDb = d;
}

export { schema };

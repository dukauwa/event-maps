/* Seed (or reset and re-seed) the local database with the demo event. Usage: pnpm seed [--reset] */
import fs from "node:fs";
import { db, getDbPath, setDb } from "@/lib/db";
import { isSeeded, seedDemo } from "@/lib/seed/demo";
import { publishEvent } from "@/lib/bundle";

const reset = process.argv.includes("--reset");
const p = getDbPath();
if (reset && p !== ":memory:") {
  for (const f of [p, `${p}-wal`, `${p}-shm`]) if (fs.existsSync(f)) fs.unlinkSync(f);
  setDb(undefined);
}
const d = db();
if (isSeeded(d)) {
  console.log(`Database at ${p} is already seeded. Use --reset to start over.`);
  process.exit(0);
}
const r = seedDemo(d);
const pub = publishEvent(d, r.eventId, "Initial publish");
console.log(`Seeded demo data into ${p}`);
console.log(`  Organiser login: ${r.adminEmail} / ${r.adminPassword}`);
console.log(`  API key:         ${r.apiKey}`);
console.log(`  Event:           /e/grip-connect-2026 (published v${pub?.version})`);

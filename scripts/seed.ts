/* Seed (or reset and re-seed) the local database with the demo event. Usage: pnpm seed [--reset] */
import fs from "node:fs";
import { db, getDbPath, remoteDatabase, setDb } from "@/lib/db";
import { isSeeded, seedDemo } from "@/lib/seed/demo";
import { publishEvent } from "@/lib/bundle";

// This script seeds explicitly (and reports what it did); keep the automatic first-query seed out of the way.
process.env.AUTO_SEED = "0";

async function main() {
  const reset = process.argv.includes("--reset");
  const remote = remoteDatabase();
  const p = remote ? remote.url : getDbPath();
  if (reset) {
    if (remote) throw new Error("--reset only wipes a local file database. Reset a hosted database from its dashboard.");
    if (p !== ":memory:") for (const f of [p, `${p}-wal`, `${p}-shm`]) if (fs.existsSync(f)) fs.unlinkSync(f);
    setDb(undefined);
  }
  const d = db();
  if (await isSeeded(d)) {
    console.log(`Database at ${p} is already seeded. Use --reset to start over.`);
    return;
  }
  const r = await seedDemo(d);
  const pub = await publishEvent(d, r.eventId, "Initial publish");
  console.log(`Seeded demo data into ${p}`);
  console.log(`  Organiser login: ${r.adminEmail} / ${r.adminPassword}`);
  console.log(`  API key:         ${r.apiKey}`);
  console.log(`  Event:           /e/grip-connect-2026 (published v${pub?.version})`);
}

main().then(() => process.exit(0)).catch((e) => { console.error(e); process.exit(1); });

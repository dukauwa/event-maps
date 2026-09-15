/**
 * Build-time asset preparation, run before `next build` (and by `pnpm dev` users via `pnpm build:assets`).
 *
 * 1. Bundles the embed SDK into public/sdk.
 * 2. Copies MapLibre's worker chunks into public/maplibre.
 *
 * (2) is not optional: MapLibre 6 loads its worker with `new URL("./maplibre-gl-worker.mjs", import.meta.url)`,
 * which resolves against the bundled chunk's URL. Next's bundler does not emit the worker file there, so the
 * worker 404s, dies silently, and every GeoJSON source stays empty — a blank map with no error. Serving the
 * worker from public/ and pointing `setWorkerUrl` at it keeps the main thread and the worker on one version.
 */
import { build } from "esbuild";
import fs from "node:fs";
import path from "node:path";
import { createRequire } from "node:module";

const root = process.cwd();
const require_ = createRequire(path.join(root, "package.json"));

async function buildSdk() {
  const out = path.join(root, "public", "sdk");
  fs.mkdirSync(out, { recursive: true });
  const entry = path.join(root, "packages", "sdk", "src", "index.ts");
  const banner = `/* Tessera embed SDK · https://github.com/dukauwa/event-maps */`;
  await build({ entryPoints: [entry], bundle: true, minify: true, format: "iife", globalName: "Tessera", target: ["es2019"], outfile: path.join(out, "tessera.js"), banner: { js: banner }, sourcemap: true, legalComments: "none" });
  await build({ entryPoints: [entry], bundle: true, minify: false, format: "esm", target: ["es2020"], outfile: path.join(out, "tessera.esm.js"), banner: { js: banner }, sourcemap: true, legalComments: "none" });
  console.log("[assets] sdk →", fs.readdirSync(out).filter((f) => f.endsWith(".js")).join(", "));
}

function copyMaplibreWorker() {
  const dist = path.join(path.dirname(require_.resolve("maplibre-gl/package.json")), "dist");
  const out = path.join(root, "public", "maplibre");
  fs.mkdirSync(out, { recursive: true });
  // The worker imports the shared chunk by relative path, so both must land in the same folder.
  for (const f of ["maplibre-gl-worker.mjs", "maplibre-gl-shared.mjs"]) {
    const from = path.join(dist, f);
    if (!fs.existsSync(from)) throw new Error(`[assets] ${f} not found in ${dist}; check the maplibre-gl version`);
    fs.copyFileSync(from, path.join(out, f));
  }
  const version = JSON.parse(fs.readFileSync(path.join(dist, "..", "package.json"), "utf8")).version as string;
  fs.writeFileSync(path.join(out, "VERSION"), `${version}\n`);
  console.log(`[assets] maplibre worker → public/maplibre (v${version})`);
}

async function main() {
  await buildSdk();
  copyMaplibreWorker();
}
main().catch((e) => { console.error(e); process.exit(1); });

/* Bundle the embed SDK to public/sdk (IIFE global `Tessera` + ESM). */
import { build } from "esbuild";
import fs from "node:fs";
import path from "node:path";

async function main() {
const out = path.join(process.cwd(), "public", "sdk");
fs.mkdirSync(out, { recursive: true });
const entry = path.join(process.cwd(), "packages", "sdk", "src", "index.ts");
const banner = `/* Tessera embed SDK · ${new Date().toISOString().slice(0, 10)} · https://github.com/dukauwa/event-maps */`;
await build({ entryPoints: [entry], bundle: true, minify: true, format: "iife", globalName: "Tessera", target: ["es2019"], outfile: path.join(out, "tessera.js"), banner: { js: banner }, sourcemap: true, legalComments: "none" });
await build({ entryPoints: [entry], bundle: true, minify: false, format: "esm", target: ["es2020"], outfile: path.join(out, "tessera.esm.js"), banner: { js: banner }, sourcemap: true, legalComments: "none" });
console.log("built", fs.readdirSync(out).join(", "));
}
main().catch((e) => { console.error(e); process.exit(1); });

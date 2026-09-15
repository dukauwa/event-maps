/**
 * End-to-end smoke: boots the dev server, walks the main flows with Playwright, saves screenshots and
 * fails on page errors. Usage: pnpm e2e [--port 3199] [--out ./e2e-out] [--keep]
 */
import { spawn } from "node:child_process";
import fs from "node:fs";
import path from "node:path";
import { chromium, type Page } from "playwright-core";

const args = process.argv.slice(2);
const port = args.includes("--port") ? Number(args[args.indexOf("--port") + 1]) : 3199;
const out = path.resolve(args.includes("--out") ? args[args.indexOf("--out") + 1] : "e2e-out");
const base = `http://localhost:${port}`;
fs.mkdirSync(out, { recursive: true });

async function waitFor(url: string, ms = 120000) {
  const t0 = Date.now();
  while (Date.now() - t0 < ms) {
    try { const r = await fetch(url); if (r.ok || r.status === 404) return; } catch { /* retry */ }
    await new Promise((r) => setTimeout(r, 1000));
  }
  throw new Error(`Server did not start at ${url}`);
}

const failures: string[] = [];
function watch(page: Page, name: string) {
  page.on("pageerror", (e) => failures.push(`[${name}] pageerror: ${e.message}`));
  page.on("console", (m) => {
    const text = m.text();
    if (m.type() !== "error" || /favicon|tiles\.openfreemap|ERR_NAME_NOT_RESOLVED|Failed to load resource/.test(text)) return;
    // Hydration diffs are truncated to uselessness at 200 chars; keep the whole thing.
    failures.push(`[${name}] console: ${text.slice(0, /hydrat/i.test(text) ? 4000 : 200)}`);
  });
}

async function main() {
  const server = spawn("pnpm", ["dev", "-p", String(port)], { stdio: ["ignore", "pipe", "pipe"], env: { ...process.env, DATABASE_PATH: path.join(out, "e2e.db") } });
  server.stdout.on("data", (d) => process.env.E2E_VERBOSE && process.stdout.write(d));
  server.stderr.on("data", (d) => process.env.E2E_VERBOSE && process.stderr.write(d));
  try {
    await waitFor(`${base}/e/grip-connect-2026/version.json`);
    const browser = await chromium.launch({ executablePath: process.env.CHROMIUM_PATH || "/opt/pw-browsers/chromium", args: ["--use-gl=swiftshader", "--enable-webgl", "--ignore-gpu-blocklist"] });
    const ctx = await browser.newContext({ viewport: { width: 1440, height: 900 } });
    const shot = async (page: Page, name: string) => { await page.screenshot({ path: path.join(out, `${name}.png`), fullPage: false }); console.log("✓", name); };

    // Public data + API
    const v = await (await fetch(`${base}/e/grip-connect-2026/version.json`)).json();
    if (!v.version) failures.push("version.json has no version");
    const data = await (await fetch(`${base}/e/grip-connect-2026/data.json`)).json();
    if (!Array.isArray(data.booths) || data.booths.length < 200) failures.push("data.json booths missing");
    const expo = await (await fetch(`${base}/e/grip-connect-2026/data.expofp.json`)).json();
    if (!expo.exhibitors?.length || expo.boothTerm !== "Booth") failures.push("data.expofp.json shape wrong");
    const route = await (await fetch(`${base}/api/v1/events/grip-connect-2026/route?from=booth:A101&to=booth:T05&accessible=1`)).json();
    if (!route.data?.ok) failures.push(`route failed: ${JSON.stringify(route).slice(0, 200)}`);
    const api = await (await fetch(`${base}/api/v1/events`, { headers: { Authorization: "Bearer tsr_live_demo_9f3b1c7e2a4d6f8b0c1d2e3f4a5b6c7d" } })).json();
    if (!api.data?.length) failures.push("API key auth failed");
    const compat = await (await fetch(`${base}/api/v1/compat/expofp/list-events`, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ token: "tsr_live_demo_9f3b1c7e2a4d6f8b0c1d2e3f4a5b6c7d" }) })).json();
    if (!Array.isArray(compat) || !compat[0]?.key) failures.push("ExpoFP compat shim failed");
    const openapi = await (await fetch(`${base}/api/v1/openapi.json`)).json();
    if (!openapi.paths) failures.push("openapi missing");

    // Viewer
    for (const [name, url] of [["viewer", "/e/grip-connect-2026"], ["viewer-booth", "/e/grip-connect-2026?booth=A101"], ["viewer-route", "/e/grip-connect-2026?route=A101,T05"], ["viewer-l2-3d", "/e/grip-connect-2026?level=L2&view=3d"], ["viewer-kiosk", "/e/grip-connect-2026?kiosk=1&position=90,105"], ["viewer-de", "/e/grip-connect-2026?lang=de"]]) {
      const page = await ctx.newPage(); watch(page, name);
      await page.goto(`${base}${url}`, { waitUntil: "networkidle", timeout: 90000 }).catch(() => undefined);
      await page.waitForTimeout(2500);
      await shot(page, name);
      await page.close();
    }
    const mobile = await browser.newContext({ viewport: { width: 400, height: 800 }, isMobile: true, hasTouch: true });
    const mp = await mobile.newPage(); watch(mp, "viewer-mobile");
    await mp.goto(`${base}/e/grip-connect-2026?exhibitor=nimbus-cloud`, { waitUntil: "networkidle", timeout: 90000 }).catch(() => undefined);
    await mp.waitForTimeout(2500); await shot(mp, "viewer-mobile"); await mobile.close();

    // Embed SDK bridge
    const sdkPage = await ctx.newPage(); watch(sdkPage, "sdk");
    await sdkPage.setContent(`<div id="fp" style="height:700px"></div><script src="${base}/sdk/tessera.js"></script>`);
    await sdkPage.waitForFunction(() => !!(window as unknown as { Tessera?: unknown }).Tessera);
    const sdkResult = await sdkPage.evaluate(async (b) => {
      const T = (window as unknown as { Tessera: { FloorPlan: new (o: unknown) => { ready: Promise<unknown>; call: (m: string, ...a: unknown[]) => Promise<unknown> } } }).Tessera;
      const fp = new T.FloorPlan({ element: "#fp", eventId: "grip-connect-2026", baseUrl: b });
      await Promise.race([fp.ready, new Promise((_, rej) => setTimeout(() => rej(new Error("ready timeout")), 60000))]);
      const floors = await fp.call("getFloors") as unknown[];
      await fp.call("selectBooth", "A101");
      const booths = await fp.call("boothsList") as unknown[];
      return { floors: floors.length, booths: booths.length };
    }, base).catch((e) => ({ error: String(e) }));
    if ("error" in sdkResult) failures.push(`SDK bridge: ${sdkResult.error}`); else console.log("✓ sdk bridge", sdkResult);
    await sdkPage.waitForTimeout(1000); await shot(sdkPage, "sdk-embed"); await sdkPage.close();

    // Reservation flow (mock checkout)
    const avail = (data.booths as { id: string; status: string; label: string }[]).find((b) => b.status === "available")!;
    const rp = await ctx.newPage(); watch(rp, "reserve");
    await rp.goto(`${base}/e/grip-connect-2026/reserve/${avail.id}`, { waitUntil: "networkidle" });
    await shot(rp, "reserve");
    await rp.fill("input[placeholder='Acme Ltd']", "E2E Buyer Ltd");
    await rp.fill("input[type='email']", "buyer@example.com");
    const nameInputs = await rp.$$("input:not([type='email']):not([placeholder='Acme Ltd']):not([type='number'])");
    if (nameInputs[0]) await nameInputs[0].fill("Sam Tester");
    await rp.click("button[type='submit']");
    await rp.waitForURL(/\/pay\?order=/, { timeout: 30000 });
    await shot(rp, "reserve-pay");
    await rp.click("button[type='submit']");
    await rp.waitForURL(/\/done\?order=/, { timeout: 30000 });
    await shot(rp, "reserve-done");
    const portalHref = await rp.getAttribute("a[href^='/x/']", "href");
    await rp.close();

    // Exhibitor portal
    if (portalHref) {
      const pp = await ctx.newPage(); watch(pp, "portal");
      await pp.goto(`${base}${portalHref}`, { waitUntil: "networkidle" }); await pp.waitForTimeout(1000);
      await shot(pp, "portal-profile");
      for (const tab of ["booth", "extras", "orders", "analytics", "share"]) { await pp.goto(`${base}${portalHref}?tab=${tab}`, { waitUntil: "networkidle" }); await pp.waitForTimeout(500); await shot(pp, `portal-${tab}`); }
      await pp.close();
    } else failures.push("no portal link on done page");

    // Organiser portal + designer
    const ap = await ctx.newPage(); watch(ap, "admin");
    await ap.goto(`${base}/login`, { waitUntil: "networkidle" }); await shot(ap, "login");
    const login = await ap.request.post(`${base}/api/auth/login`, { data: { email: "admin@tessera.local", password: "tessera-demo" } });
    if (!login.ok()) failures.push("login failed");
    const evs = await (await ap.request.get(`${base}/api/v1/events`)).json();
    const evId = evs.data?.[0]?.id;
    for (const [name, url] of [["admin", "/admin"], ["admin-event", `/admin/events/${evId}`], ["admin-booths", `/admin/events/${evId}/booths`], ["admin-exhibitors", `/admin/events/${evId}/exhibitors`], ["admin-sales", `/admin/events/${evId}/sales`], ["admin-analytics", `/admin/events/${evId}/analytics`], ["admin-settings", `/admin/events/${evId}/settings`], ["admin-org", "/admin/settings"], ["designer", `/admin/events/${evId}/designer`], ["docs", "/docs"], ["docs-embed", "/docs/embed"], ["landing", "/"]]) {
      await ap.goto(`${base}${url}`, { waitUntil: "networkidle", timeout: 90000 }).catch(() => failures.push(`[${name}] navigation failed`));
      await ap.waitForTimeout(name === "designer" || name === "docs-embed" ? 3000 : 800);
      const status = await ap.evaluate(() => document.title);
      if (/404|not found/i.test(status)) failures.push(`[${name}] 404`);
      await shot(ap, name);
    }
    await ap.close();
    await browser.close();
  } finally {
    if (!args.includes("--keep")) server.kill("SIGTERM");
  }
  if (failures.length) { console.error("\nFAILURES:\n" + failures.join("\n")); process.exit(1); }
  console.log(`\nAll smoke checks passed. Screenshots in ${out}`);
}
main().catch((e) => { console.error(e); process.exit(1); });

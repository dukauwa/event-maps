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


/** Minimal vector PDF: a hall outline, a 3 × 6 grid of stands with text labels, and a title. What an organiser's CAD export looks like. */
function floorPlanPdf(): Buffer {
  const rows = 3, cols = 6, w = 90, h = 70, x0 = 80, y0 = 380;
  let content = "0 0 0 RG 1.5 w 40 40 762 515 re S\n";
  const labels: string[] = [];
  for (let r = 0; r < rows; r++) for (let c = 0; c < cols; c++) {
    const x = x0 + c * w, y = y0 - r * (h + 20);
    const label = `${String.fromCharCode(65 + r)}${c + 1}`;
    labels.push(label);
    content += `${x} ${y} ${w} ${h} re S\n`;
    content += `BT /F1 12 Tf ${x + 34} ${y + 30} Td (${label}) Tj ET\n`;
    if (label === "A1") content += `BT /F1 9 Tf ${x + 18} ${y + 14} Td (Acme Corp) Tj ET\n`;
  }
  content += "BT /F1 18 Tf 60 520 Td (Hall 3 - North) Tj ET\n";
  const objects = [
    "<< /Type /Catalog /Pages 2 0 R >>",
    "<< /Type /Pages /Kids [3 0 R] /Count 1 >>",
    "<< /Type /Page /Parent 2 0 R /MediaBox [0 0 842 595] /Contents 4 0 R /Resources << /Font << /F1 5 0 R >> >> >>",
    `<< /Length ${Buffer.byteLength(content)} >>\nstream\n${content}endstream`,
    "<< /Type /Font /Subtype /Type1 /BaseFont /Helvetica >>",
  ];
  let pdf = "%PDF-1.4\n";
  const offsets: number[] = [];
  objects.forEach((o, i) => { offsets.push(Buffer.byteLength(pdf)); pdf += `${i + 1} 0 obj\n${o}\nendobj\n`; });
  const xref = Buffer.byteLength(pdf);
  pdf += `xref\n0 ${objects.length + 1}\n0000000000 65535 f \n${offsets.map((o) => `${String(o).padStart(10, "0")} 00000 n `).join("\n")}\ntrailer\n<< /Size ${objects.length + 1} /Root 1 0 R >>\nstartxref\n${xref}\n%%EOF\n`;
  return Buffer.from(pdf, "latin1");
}

const failures: string[] = [];
function watch(page: Page, name: string) {
  page.on("pageerror", (e) => failures.push(`[${name}] pageerror: ${e.message}`));
  page.on("console", (m) => {
    const text = m.text();
    if (m.type() !== "error" || /favicon|tiles\.openfreemap|arcgisonline|nominatim|ERR_NAME_NOT_RESOLVED|Failed to load resource/.test(text)) return;
    // Hydration diffs are truncated to uselessness at 200 chars; keep the whole thing.
    failures.push(`[${name}] console: ${text.slice(0, /hydrat/i.test(text) ? 4000 : 200)}`);
  });
}

async function main() {
  // Fresh database every run: the checks below reserve booths and create events, and a second run against the
  // same file would find the "available" booth from the published snapshot already held.
  const dbPath = path.join(out, "e2e.db");
  for (const f of [dbPath, `${dbPath}-wal`, `${dbPath}-shm`]) fs.rmSync(f, { force: true });
  // Own process group, so the shutdown below reaches `next dev` itself and never leaves an orphan holding the port
  // (and the previous run's database) for the next run to talk to.
  const server = spawn(path.join("node_modules", ".bin", "next"), ["dev", "-p", String(port)], { stdio: ["ignore", "pipe", "pipe"], detached: true, env: { ...process.env, DATABASE_PATH: dbPath } });
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


    // Exhibitor booking view vs attendee view
    const bp = await ctx.newPage(); watch(bp, "booking");
    await bp.goto(`${base}/e/grip-connect-2026/book`, { waitUntil: "networkidle", timeout: 90000 }).catch(() => undefined);
    await bp.waitForTimeout(2500);
    const bookingTab = await bp.textContent(".tv-tab[aria-selected='true']").catch(() => null);
    if (bookingTab?.trim() !== "For sale") failures.push(`booking view default tab is ${JSON.stringify(bookingTab)}`);
    const forSaleRows = await bp.locator("[role='listitem']").count();
    if (forSaleRows < 5) failures.push(`booking view lists ${forSaleRows} booths`);
    if (!(await bp.locator(".tv-legend").count())) failures.push("booking view has no availability legend");
    await shot(bp, "booking-view");
    await bp.locator("[role='listitem']").first().click();
    await bp.waitForTimeout(800);
    if (!(await bp.getByRole("button", { name: /Reserve this booth/ }).count())) failures.push("booking view booth details lack a Reserve button");
    await shot(bp, "booking-booth");
    await bp.goto(`${base}/e/grip-connect-2026?booth=A101`, { waitUntil: "networkidle", timeout: 90000 }).catch(() => undefined);
    await bp.waitForTimeout(2000);
    if (await bp.getByRole("button", { name: /Reserve this booth/ }).count()) failures.push("attendee view shows a Reserve button");
    if (await bp.locator(".tv-legend").count()) failures.push("attendee view shows the availability legend");
    if (await bp.locator(".tv-preview-bar").count()) failures.push("attendee view shows the preview bar without preview=1");
    await bp.close();

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

    // Organiser preview switcher (needs the org session)
    await ap.goto(`${base}/e/grip-connect-2026/book?preview=1`, { waitUntil: "networkidle", timeout: 90000 }).catch(() => undefined);
    await ap.waitForTimeout(6000); // the basemap style fetch times out at 4 s when offline before the blank style takes over
    if (!(await ap.locator(".tv-preview-bar").count())) failures.push("preview bar missing on ?preview=1");
    const current = await ap.textContent(".tv-preview-switch a[aria-current='page']").catch(() => null);
    if (current?.trim() !== "Exhibitor booking view") failures.push(`preview switch highlights ${JSON.stringify(current)}`);
    await shot(ap, "preview-booking");
    await ap.goto(`${base}/admin/events/${evId}`, { waitUntil: "networkidle" });
    await ap.getByRole("button", { name: /Preview as/ }).click();
    await ap.waitForTimeout(300);
    if (!(await ap.getByRole("menuitem", { name: /Exhibitor booking view/ }).count())) failures.push("dashboard Preview as menu lacks the booking view");
    await shot(ap, "admin-preview-menu");

    // Venue-first creation wizard with an uploaded PDF plan
    const wp = await ctx.newPage(); watch(wp, "wizard");
    await wp.goto(`${base}/admin/events/new`, { waitUntil: "networkidle" });
    await wp.fill("input[placeholder='Grip Connect 2027']", "Wizard Expo 2027");
    await shot(wp, "wizard-basics");
    await wp.getByRole("button", { name: "Continue" }).click();
    await wp.fill("input[placeholder='51.5083']", "51.5083");
    await wp.fill("input[placeholder='0.0299']", "0.0299");
    await wp.fill("input[placeholder='ExCeL London']", "ExCeL London");
    await wp.waitForTimeout(4000);
    // Shape the hall on the map: push the east wall out, then pull a new corner out of the north wall.
    const box = await wp.locator(".maplibregl-canvas").boundingBox();
    if (!box) failures.push("venue map canvas missing");
    else {
      const widthBefore = Number(await wp.inputValue("text=Width (m) >> xpath=.. >> input"));
      const cx = box.x + box.width / 2, cy = box.y + box.height / 2;
      // MapLibre zoom levels are defined on 512 px tiles: 78271.5 m/px at zoom 0 on the equator. The map flies to zoom 16.5.
      const mPerPx = (78271.517 * Math.cos((51.5083 * Math.PI) / 180)) / Math.pow(2, 16.5);
      const halfW = 100 / mPerPx, halfH = 60 / mPerPx;
      await wp.mouse.move(cx + halfW, cy + halfH / 2); await wp.mouse.down(); await wp.mouse.move(cx + halfW + 40, cy + halfH / 2, { steps: 8 }); await wp.mouse.up();
      const widthAfter = Number(await wp.inputValue("text=Width (m) >> xpath=.. >> input"));
      if (!(widthAfter > widthBefore + 10)) failures.push(`dragging the east wall: width ${widthBefore} → ${widthAfter}`);
      // The east wall moved out, so the north side's midpoint moved right by half of that.
      const midX = cx + (widthAfter - widthBefore) / mPerPx / 2;
      await wp.mouse.move(midX, cy - halfH); await wp.mouse.down(); await wp.mouse.move(midX, cy - halfH - 35, { steps: 8 }); await wp.mouse.up();
      if (!(await wp.getByText("5 corners").count())) failures.push("dragging a side's midpoint did not add a corner");
    }
    await shot(wp, "wizard-venue");
    await wp.getByRole("button", { name: "Continue" }).click();
    // Raster plan first: a 4 × 5 grid drawn in the browser.
    const png = await wp.evaluate(() => {
      const c = document.createElement("canvas"); c.width = 1200; c.height = 800;
      const g = c.getContext("2d")!; g.fillStyle = "#fff"; g.fillRect(0, 0, 1200, 800); g.strokeStyle = "#000"; g.lineWidth = 3;
      g.strokeRect(40, 40, 1120, 720);
      for (let r = 0; r < 4; r++) for (let k = 0; k < 5; k++) g.strokeRect(120 + k * 160, 100 + r * 150, 160, 120);
      return c.toDataURL("image/png").split(",")[1];
    });
    await wp.setInputFiles("input[type='file']", { name: "hall-scan.png", mimeType: "image/png", buffer: Buffer.from(png, "base64") });
    await wp.waitForSelector("text=/\\d+ booths drafted/", { timeout: 30000 });
    const pngCount = Number((await wp.textContent("text=/\\d+ booths drafted/"))?.match(/\d+/)?.[0]);
    if (pngCount !== 20) failures.push(`raster auto-draft found ${pngCount} booths, expected 20`);
    // Then the vector PDF: labels must come from the drawing's text.
    await wp.setInputFiles("input[type='file']", { name: "hall-3.pdf", mimeType: "application/pdf", buffer: floorPlanPdf() });
    await wp.waitForSelector("text=/18 booths drafted/", { timeout: 60000 }).catch(() => failures.push("pdf auto-draft did not find 18 booths"));
    const vec = await wp.textContent("text=/Read from the PDF's drawing/").catch(() => "");
    if (!/18 with a stand number · 1 with a name/.test(vec ?? "")) failures.push(`pdf vector reading: ${vec}`);
    if (!(await wp.getByText("Create 1 exhibitor from the plan").count())) failures.push("no option to create exhibitors from names on the plan");
    await shot(wp, "wizard-plan");
    await wp.getByRole("button", { name: "Continue" }).click();
    await shot(wp, "wizard-sales");
    await wp.getByRole("button", { name: "Continue" }).click();
    await shot(wp, "wizard-review");
    await wp.getByRole("button", { name: /Create event/ }).click();
    await wp.waitForURL(/\/designer$/, { timeout: 60000 }).catch(() => failures.push("wizard did not land in the designer"));
    await wp.waitForTimeout(5000);
    await shot(wp, "wizard-designer");
    const created = (await (await ap.request.get(`${base}/api/v1/events`)).json()).data?.find((e: { slug: string }) => e.slug === "wizard-expo-2027");
    if (!created) failures.push("wizard event not created");
    else {
      const lv = (await (await ap.request.get(`${base}/api/v1/events/${created.id}/levels`)).json()).data?.[0];
      if (!lv?.georef || !lv.background?.url) failures.push(`wizard level lacks georef/background: ${JSON.stringify(lv).slice(0, 200)}`);
      const bo = (await (await ap.request.get(`${base}/api/v1/events/${created.id}/booths?limit=100`)).json()).data ?? [];
      const labels = bo.map((b: { label: string }) => b.label).sort();
      if (bo.length !== 18 || !labels.includes("A1") || !labels.includes("C6")) failures.push(`wizard booths: ${bo.length} ${labels.slice(0, 6).join(",")}`);
      const a1 = bo.find((b: { label: string }) => b.label === "A1") as { status: string } | undefined;
      if (a1?.status !== "sold") failures.push(`A1 should be sold to the exhibitor named on the plan, is ${a1?.status}`);
      const exs = (await (await ap.request.get(`${base}/api/v1/events/${created.id}/exhibitors`)).json()).data ?? [];
      if (!exs.some((e: { name: string; boothLabels: string[] }) => e.name === "Acme Corp" && e.boothLabels.includes("A1"))) failures.push(`exhibitor from the plan: ${JSON.stringify(exs).slice(0, 200)}`);
      const els = (await (await ap.request.get(`${base}/api/v1/events/${created.id}/elements`)).json()).data ?? [];
      const wall = els.find((e: { kind: string; props: { name?: string } }) => e.kind === "wall" && e.props?.name === "Hall outline") as { geometry: { points: number[][] } } | undefined;
      if (!wall || wall.geometry.points.length !== 6) failures.push(`hall outline wall: ${JSON.stringify(wall).slice(0, 160)}`);
      const bookPage = await ctx.newPage(); watch(bookPage, "wizard-booking");
      await bookPage.goto(`${base}/e/${created.slug}/book?preview=1`, { waitUntil: "networkidle", timeout: 90000 }).catch(() => undefined);
      await bookPage.waitForTimeout(6000);
      await shot(bookPage, "wizard-booking");
      await bookPage.close();
    }
    await wp.close();

    // A real customer plan (NAB Show North Hall), when provided: NAB_PDF=/path/to/file.pdf
    if (process.env.NAB_PDF && fs.existsSync(process.env.NAB_PDF)) {
      const np = await ctx.newPage(); watch(np, "wizard-nab");
      await np.goto(`${base}/admin/events/new`, { waitUntil: "networkidle" });
      await np.fill("input[placeholder='Grip Connect 2027']", "NAB Show 2027 North Hall");
      await np.getByRole("button", { name: "Continue" }).click();
      await np.fill("input[placeholder='51.5083']", "36.1330"); await np.fill("input[placeholder='0.0299']", "-115.1510");
      await np.getByRole("button", { name: "Continue" }).click();
      await np.setInputFiles("input[type='file']", process.env.NAB_PDF);
      await np.waitForSelector("text=/\\d+ booths drafted/", { timeout: 60000 });
      const summary = await np.textContent("text=/Read from the PDF's drawing/").catch(() => null);
      console.log("✓ NAB plan:", summary?.trim());
      if (!summary || Number(summary.match(/(\d+) with a stand number/)?.[1]) < 150) failures.push(`NAB plan reading: ${summary}`);
      await shot(np, "wizard-nab-plan");
      await np.close();
    }
    await ap.close();
    await browser.close();
  } finally {
    if (!args.includes("--keep") && server.pid) { try { process.kill(-server.pid, "SIGTERM"); } catch { server.kill("SIGTERM"); } }
  }
  if (failures.length) { console.error("\nFAILURES:\n" + failures.join("\n")); process.exit(1); }
  console.log(`\nAll smoke checks passed. Screenshots in ${out}`);
}
// The dev server's process group can keep the event loop alive after SIGTERM, so exit explicitly
// rather than letting a CI timeout decide the exit code.
main().then(() => process.exit(0)).catch((e) => { console.error(e); process.exit(1); });

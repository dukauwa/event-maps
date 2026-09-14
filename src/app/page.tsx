import Link from "next/link";
import type { Metadata } from "next";
import { BRAND } from "@/lib/brand";

export const metadata: Metadata = { title: `${BRAND.name} — ${BRAND.tagline}`, description: BRAND.description };

const DEMO_SLUG = "grip-connect-2026";

const FEATURES: { title: string; body: string; icon: string }[] = [
  { title: "Floor plan designer", body: "Draw halls, booths, walls, zones and points of interest in metres. Multi-level, DXF/PDF backgrounds, georeferenced onto a real basemap.", icon: "▦" },
  { title: "Booth sales", body: "Pricing rules per booth type and size, holds with timers, reserve / buy / inquiry flows, Stripe or invoice, sponsorship packages and extras.", icon: "◫" },
  { title: "Wayfinding", body: "Turn-by-turn routes across levels with stairs, lifts and escalators. Accessible routing and multi-stop route optimisation for attendees.", icon: "⇝" },
  { title: "API & embed SDK", body: "Public JSON API, ExpoFP-compatible data.json and JS SDK, signed webhooks. Drop the viewer into any site or app with one script tag.", icon: "{}" },
  { title: "Analytics", body: "Views, searches, zero-result searches, routes, bookmarks, booth clicks and an on-plan heatmap. Per-exhibitor stats in the exhibitor portal.", icon: "▮" },
  { title: "Grip integration", body: "Sync exhibitors from Grip in one click, link booths to company profiles and send attendees straight to meeting booking.", icon: "⟳" },
];

const COMPARE: { feature: string; expofp: string; tessera: string }[] = [
  { feature: "Interactive floor plan", expofp: "Yes", tessera: "Yes — 2D, 3D extrusion, basemap overlay" },
  { feature: "Embed", expofp: "JS SDK (FloorPlan API)", tessera: "Same API surface, drop-in replacement" },
  { feature: "Booth sales", expofp: "Reserve / buy with add-ons", tessera: "Reserve / buy / inquiry, Stripe, invoice, pricing rules" },
  { feature: "Exhibitor self-service", expofp: "Exhibitor portal", tessera: "Magic-link portal with analytics and rebooking" },
  { feature: "Wayfinding", expofp: "Single-level routes", tessera: "Multi-level, accessible, optimised multi-stop" },
  { feature: "Data ownership", expofp: "Hosted, per-event plans", tessera: "Your database, open bundle format, offline export" },
  { feature: "Integrations", expofp: "CSV, API", tessera: "REST API, webhooks, Grip sync, ExpoFP-compatible endpoints" },
];

export default function Home() {
  return (
    <div className="flex flex-1 flex-col bg-background text-foreground">
      <header className="border-b border-border bg-surface/80 backdrop-blur">
        <div className="mx-auto flex max-w-6xl items-center justify-between px-4 py-3 sm:px-6">
          <Link href="/" className="flex items-center gap-2">
            <span className="grid size-8 place-items-center rounded-lg bg-primary text-sm font-bold text-white">{BRAND.name[0]}</span>
            <span className="text-lg font-semibold tracking-tight">{BRAND.name}</span>
          </Link>
          <nav className="flex items-center gap-2 text-sm sm:gap-4">
            <Link href="/docs" className="rounded-lg px-3 py-1.5 text-gray-700 hover:bg-gray-100">Developers</Link>
            <a href={`/e/${DEMO_SLUG}`} className="rounded-lg px-3 py-1.5 text-gray-700 hover:bg-gray-100">Live demo</a>
            <Link href="/login" className="rounded-lg bg-primary px-3 py-1.5 font-medium text-white hover:opacity-90">Organiser login</Link>
          </nav>
        </div>
      </header>

      <main className="flex-1">
        <section className="mx-auto max-w-6xl px-4 pb-16 pt-16 sm:px-6 sm:pt-24">
          <p className="mb-4 inline-flex items-center gap-2 rounded-full border border-border bg-surface px-3 py-1 text-xs font-medium text-gray-600">
            <span className="size-1.5 rounded-full bg-green-500" /> Built by {BRAND.company} · ExpoFP-compatible
          </p>
          <h1 className="max-w-3xl text-4xl font-semibold tracking-tight sm:text-6xl">{BRAND.tagline}</h1>
          <p className="mt-5 max-w-2xl text-lg text-gray-600">
            {BRAND.name} is the interactive floor plan platform for exhibitions and conferences: design the plan, sell the booths, guide the attendees and plug it all into your event stack through a public API.
          </p>
          <div className="mt-8 flex flex-wrap gap-3">
            <a href={`/e/${DEMO_SLUG}`} className="inline-flex h-11 items-center rounded-lg bg-primary px-5 text-sm font-medium text-white hover:opacity-90">Open the demo floor plan</a>
            <Link href="/login" className="inline-flex h-11 items-center rounded-lg border border-border bg-surface px-5 text-sm font-medium hover:bg-gray-50">Organiser portal</Link>
            <Link href="/docs" className="inline-flex h-11 items-center rounded-lg px-5 text-sm font-medium text-gray-700 hover:bg-gray-100">API &amp; SDK docs →</Link>
          </div>
          <div className="mt-12 grid grid-cols-2 gap-4 text-sm sm:grid-cols-4">
            {[["2 levels", "multi-level routing"], ["280+", "booths in the demo"], ["< 1 s", "route calculation"], ["1 tag", "to embed anywhere"]].map(([v, l]) => (
              <div key={l} className="rounded-xl border border-border bg-surface p-4">
                <p className="text-2xl font-semibold tabular-nums">{v}</p>
                <p className="text-gray-500">{l}</p>
              </div>
            ))}
          </div>
        </section>

        <section className="border-y border-border bg-surface">
          <div className="mx-auto max-w-6xl px-4 py-16 sm:px-6">
            <h2 className="text-2xl font-semibold tracking-tight">Everything an event floor plan needs</h2>
            <p className="mt-2 max-w-2xl text-gray-600">One product from the first sketch of the hall to the last route walked on show day.</p>
            <div className="mt-8 grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
              {FEATURES.map((f) => (
                <div key={f.title} className="rounded-xl border border-border bg-background p-5">
                  <div className="mb-3 grid size-9 place-items-center rounded-lg bg-primary/10 font-mono text-base text-primary">{f.icon}</div>
                  <h3 className="font-semibold">{f.title}</h3>
                  <p className="mt-1 text-sm text-gray-600">{f.body}</p>
                </div>
              ))}
            </div>
          </div>
        </section>

        <section className="mx-auto max-w-6xl px-4 py-16 sm:px-6">
          <div className="flex flex-wrap items-end justify-between gap-3">
            <div>
              <h2 className="text-2xl font-semibold tracking-tight">ExpoFP → {BRAND.name}</h2>
              <p className="mt-2 max-w-2xl text-gray-600">Keep your embed code and CSV templates. {BRAND.name} serves an ExpoFP-compatible <code className="rounded bg-gray-100 px-1 font-mono text-xs">data.json</code> and SDK so migration is a URL change.</p>
            </div>
            <Link href="/docs" className="text-sm font-medium text-primary hover:underline">Migration guide →</Link>
          </div>
          <div className="mt-6 overflow-x-auto rounded-xl border border-border bg-surface">
            <table className="w-full text-sm">
              <thead>
                <tr className="text-left text-xs uppercase tracking-wide text-gray-500">
                  <th className="border-b border-border px-4 py-3">Capability</th>
                  <th className="border-b border-border px-4 py-3">ExpoFP</th>
                  <th className="border-b border-border px-4 py-3 text-primary">{BRAND.name}</th>
                </tr>
              </thead>
              <tbody>
                {COMPARE.map((r) => (
                  <tr key={r.feature}>
                    <td className="border-b border-border px-4 py-3 font-medium">{r.feature}</td>
                    <td className="border-b border-border px-4 py-3 text-gray-600">{r.expofp}</td>
                    <td className="border-b border-border px-4 py-3">{r.tessera}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </section>

        <section className="border-t border-border bg-surface">
          <div className="mx-auto grid max-w-6xl gap-8 px-4 py-16 sm:px-6 lg:grid-cols-2">
            <div>
              <h2 className="text-2xl font-semibold tracking-tight">Embed in one line</h2>
              <p className="mt-2 text-gray-600">The viewer runs in an iframe; the SDK proxies every method over postMessage and returns Promises, exactly like ExpoFP&apos;s <code className="rounded bg-gray-100 px-1 font-mono text-xs">FloorPlan</code>.</p>
              <ul className="mt-4 space-y-2 text-sm text-gray-700">
                <li>· Deep links: <code className="font-mono text-xs">?booth=A101</code>, <code className="font-mono text-xs">?route=A101,B204</code></li>
                <li>· Kiosk mode, 10 languages, light and dark themes</li>
                <li>· Signed webhooks for booth, exhibitor and order events</li>
              </ul>
            </div>
            <pre className="overflow-x-auto rounded-xl bg-gray-900 p-5 text-xs leading-relaxed text-gray-100"><code>{`<div id="floorplan" style="height:100vh"></div>
<script src="https://YOUR-HOST/sdk/tessera.js"></script>
<script>
  const fp = new ${BRAND.sdkGlobal}.FloorPlan({
    element: "#floorplan",
    eventId: "${DEMO_SLUG}",
    onBoothClick: (e) => console.log(e.booth),
  });
  fp.ready.then(() => fp.selectBooth("A101"));
</script>`}</code></pre>
          </div>
        </section>
      </main>

      <footer className="border-t border-border">
        <div className="mx-auto flex max-w-6xl flex-wrap items-center justify-between gap-4 px-4 py-8 text-sm text-gray-500 sm:px-6">
          <p>© {new Date().getFullYear()} {BRAND.company}. {BRAND.name} — {BRAND.description}</p>
          <div className="flex gap-4">
            <a href={`/e/${DEMO_SLUG}`} className="hover:text-gray-900">Demo</a>
            <Link href="/docs" className="hover:text-gray-900">Docs</Link>
            <Link href="/login" className="hover:text-gray-900">Sign in</Link>
            <a href={`mailto:${BRAND.supportEmail}`} className="hover:text-gray-900">Support</a>
          </div>
        </div>
      </footer>
    </div>
  );
}

# Tessera

Interactive event floor plans, booth sales and attendee wayfinding. A self-hosted replacement for ExpoFP, built by Grip.

*Tessera* (Latin): a small tile in a mosaic, and the token Romans used for admission to the games. Booths tile a hall; attendees need a way in and a way around.

## What it does

| Persona | Capabilities |
| --- | --- |
| Organiser | Venue-first event wizard (find the venue on a map, place and rotate the hall footprint, upload the existing PDF/image/SVG plan and get every stand auto-drafted), floor plan designer (draw, resize, merge, booth arrays, SVG/CSV import, multi-level, georeferencing, background images, calibration), "Preview as" attendee / exhibitor booking / portal / kiosk / embed, booth inventory with statuses, holds and pricing rules, exhibitor management with magic-link portals, categories, sessions, sponsorship packages and booth extras, banner ads, publish with version history, analytics (views, searches, zero-result searches, heat maps), API keys, webhooks, Grip sync. |
| Exhibitor | Booking view of the map (`/e/{slug}/book`): available stands with prices, filters, Reserve / Buy straight from the plan. Self-service portal: profile with live preview and completeness score, logo/gallery upload, reserve or buy a booth, add-ons, orders, per-exhibitor analytics, share link, QR and "find us" badge. |
| Attendee | Fast MapLibre viewer: search, categories, A–Z list, sessions, exhibitor details, directions with accessible routing across levels, multi-stop "my plan" optimisation, bookmarks, share, kiosk mode with "you are here", 2D/3D, 10 languages, deep links, offline-friendly bundle. |
| Developer | REST API with OpenAPI, ExpoFP-compatible JSON API shim and `data.json`, embed SDK mirroring ExpoFP's `FloorPlan` API, signed webhooks with retries, GeoJSON/CSV/offline exports. |

## Run it

```bash
pnpm install
pnpm dev            # http://localhost:3000 — seeds a demo event on first start
```

- Attendee viewer: <http://localhost:3000/e/grip-connect-2026>
- Organiser portal: <http://localhost:3000/admin> — `admin@tessera.local` / `tessera-demo`
- Developer docs: <http://localhost:3000/docs>
- Demo API key: `tsr_live_demo_9f3b1c7e2a4d6f8b0c1d2e3f4a5b6c7d`

```bash
pnpm typecheck      # next typegen + tsc
pnpm test           # vitest (routing engine, services, viewer/editor libraries)
pnpm e2e            # boots a dev server, walks every flow with Playwright, screenshots to ./e2e-out
pnpm build && pnpm start
pnpm seed:reset     # wipe data/app.db and re-seed
```

### Configuration

| Variable | Purpose |
| --- | --- |
| `TURSO_DATABASE_URL`, `TURSO_AUTH_TOKEN` | Hosted libSQL database (Turso). Required on serverless hosts; the Vercel ↔ Turso integration sets both. |
| `DATABASE_PATH` | Local SQLite file when no hosted database is set (default `./data/app.db`). Not usable on serverless hosts. |
| `UPLOADS_DIR` | Where uploads were written before they moved into the database; still read for those files. |
| `APP_URL` | Public origin used in links and checkout redirects. |
| `AUTH_SECRET` | Signs session cookies. Set it on any shared deployment; the fallback key is public. |
| `STRIPE_SECRET_KEY`, `STRIPE_WEBHOOK_SECRET` | Enable Stripe Checkout (`provider: stripe` in Sales settings). Webhook URL: `/api/stripe/webhook`. |
| `GRIP_API_BASE`, `GRIP_API_KEY` | Grip exhibitor sync (or pass a `sourceUrl` per sync). |
| `AUTO_SEED=0` | Disable demo seeding on first start. |

## Deploy it

**Vercel.** Import the repository at [vercel.com/new](https://vercel.com/new), then connect a database: in the project, **Storage → Create Database → Turso** (free tier), connect it to the project, and redeploy. The integration sets `TURSO_DATABASE_URL` and `TURSO_AUTH_TOKEN`; on the first request the app migrates the database and seeds the demo event (once, even when several instances start together). Uploaded images are stored in the database too, so every page and API route sees the same data.

Until a database is connected, every page shows a short setup screen with these steps (and the API answers `503 database_not_configured`). A file database cannot work there: each serverless function has its own `/tmp`, so an event created through the API would be missing on the page that renders it.

**Docker.** One container, one SQLite file on a volume (or point it at Turso with the two variables above). Runs on Fly.io, Railway, Render, or any VM.

```bash
docker build -t tessera .
docker run -p 3000:3000 -v tessera-data:/data -e APP_URL=https://your-host tessera
```

Set `APP_URL` on any real deployment so share links, QR codes and checkout redirects point at the right host. See `.env.example` for the rest.

## Architecture

- **Next.js 16 (App Router), React 19, TypeScript strict, Tailwind 4.** Server components read through `src/lib/services/*`; client components mutate through `/api/v1`.
- **Drizzle ORM on libSQL**: a local SQLite file (WAL) in development and Docker, Turso over HTTP on serverless hosts. All queries are async; migrations and the demo seed run before the first query. Schema in `src/lib/db/schema.ts`, migrations in `drizzle/`.
- **Plan coordinates are metres** (x right, y down). Each level may carry a georeference (origin lat/lng, rotation) so the plan renders on an open basemap (OpenFreeMap) with self-hosted glyphs. No Google Maps or Mapbox keys.
- **Routing** (`src/lib/routing`): A* over an aisle network with accessible/one-way edges and inter-level transitions, connector snapping, turn instructions, multi-stop optimisation (nearest neighbour + 2-opt) and automatic network generation from booth/wall geometry.
- **Publishing** snapshots the event into an immutable bundle (`floorplan_versions`) served at `/e/{slug}/data.json`; the viewer polls `version.json` and hot-reloads.
- **Embed SDK** (`packages/sdk`, built to `public/sdk/tessera.js`): iframe + postMessage RPC; protocol shared with the viewer via `src/lib/sdk-protocol.ts`.
- **Webhooks**: HMAC-SHA256 signed, 5 retries with backoff, delivery log.
- **Plan import** (`src/lib/import`): the wizard renders a PDF (pdf.js, legacy build for older browsers) or image in the browser, flood-fills every closed outline into candidate stands (`raster-booths.ts`, pure and unit-tested), names them from the PDF's text runs or a row/sequential scheme, and uploads only the rendered PNG as the level background. `footprint.ts` turns the rectangle placed on the basemap into the level georef.
- **Two viewer modes** from one bundle: the attendee view (`/e/{slug}`) and the exhibitor booking view (`/e/{slug}/book`, or `?mode=booking`). `bundleForMode()` in the viewer controller switches availability, prices and reservation on and attendee-only extras off; organisers preview both from the dashboard, the designer, or the amber strip inside any `?preview=1` page.

```
src/app/e/[slug]          attendee viewer, /book booking view, embed target, public data feeds, reservation flow
src/app/admin             organiser portal (+ /events/new wizard, /designer)
src/app/x/[token]         exhibitor portal
src/app/api/v1            REST API (+ /compat/expofp shim, /openapi.json)
src/app/docs              developer documentation
src/lib/{domain,db,services,routing,bundle,export,seed}
packages/sdk              embed SDK source
```

## ExpoFP parity checklist

- [x] New plan flow: locate the venue, place the hall on the map, import PDF / PNG / JPG / SVG with auto-drafted booths (DXF/DWG parsing pending)
- [x] Designer: draw/drag/resize/merge booths, multi-level, background image, georeference, SVG and CSV import
- [x] Separate exhibitor booking view and attendee view, with organiser "Preview as" for each
- [x] Booth statuses (available/held/reserved/sold/unavailable), pricing rules, holds with expiry, reserve/buy/inquiry modes, Stripe or invoice checkout
- [x] Exhibitor self-service with auto-login links, logo/gallery, custom button, video, socials, categories, extras/sponsorships with limits
- [x] Attendee viewer: search, filters, bookmarks, directions, accessible routing, multi-level, kiosk, share, languages, banners/featured listings
- [x] `FloorPlan` JS API (methods, events, deep links), `data.json` feed, JSON API actions, webhooks, offline export, GeoJSON
- [x] Analytics: views, searches, exhibitor/booth popularity, heat map, per-exhibitor stats
- [x] Publish/version history, duplicate event for next year, API keys, CSV import/export

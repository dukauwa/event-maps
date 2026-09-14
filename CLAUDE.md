# Tessera — engineering conventions

Tessera is an interactive event floor plan product (ExpoFP replacement): floor plan designer, booth sales, attendee wayfinding, public JSON API, embed SDK, webhooks. Next.js 16 App Router, React 19, TypeScript strict, Tailwind 4, Drizzle ORM on SQLite (better-sqlite3), MapLibre GL JS 6.

@AGENTS.md

## Commands
- `pnpm dev` — dev server (auto-seeds the demo event on first run; login admin@tessera.local / tessera-demo).
- `pnpm typecheck` — runs `next typegen` (creates the `RouteContext`/`PageProps` globals) then `tsc --noEmit`. Must be clean before you claim done.
- `pnpm test` — vitest. `pnpm vitest run <path>` for one area.
- `pnpm lint` — eslint. `pnpm build` — full Next build (slow; run only at integration time, never while other agents work in the tree).
- `pnpm seed:reset` — wipe `data/app.db` and re-seed.

## Layout
- `src/lib/domain/types.ts` — shared domain + bundle types. Plan coordinates are metres, x right, y DOWN.
- `src/lib/domain/geometry.ts` — polygon helpers, plan↔lng/lat transforms (`planToLngLat`, `lngLatToPlan`).
- `src/lib/db/schema.ts` — Drizzle schema. `db()` from `src/lib/db` is a process singleton; migrations in `drizzle/` run on open. After schema changes run `pnpm db:generate`.
- `src/lib/bundle.ts` — `buildBundle` (live), `publishEvent` (snapshot), `getViewerBundle`.
- `src/lib/routing/` — wayfinding engine (A*, multi-level, optimize, auto-graph).
- `src/lib/sdk-protocol.ts` — postMessage contract between viewer (iframe) and the embed SDK.
- `src/lib/brand.ts` — the product name lives here only.
- `src/app/e/[slug]` — public attendee viewer (+ `/embed`, `data.json`, `data.expofp.json`, `version.json`).
- `src/app/admin` — organiser portal. `src/app/x` — exhibitor portal (magic links). `src/app/api/v1` — public REST API.
- `packages/sdk` — embeddable JS SDK (built to `public/sdk/`).

## Rules
- Next 16: `params`/`searchParams` are Promises; use `RouteContext<"/path">` in route handlers, `PageProps<"/path">` in pages (these globals exist only after a build; annotate `{ params: Promise<...> }` explicitly where `tsc` complains). `proxy.ts` replaces middleware.
- Server-only code (db, auth) never imports into client components. Client components are `"use client"`.
- API routes return JSON `{ data }` on success or `{ error: { code, message, details? } }` with proper status. Validate bodies with zod.
- Every mutation of booths/exhibitors/orders/sessions goes through `src/lib/services/*` so webhooks and `updatedAt` are consistent.
- No `any` without a comment. No unused imports (eslint is part of CI).
- Do not `git commit`; the orchestrator commits. Do not run `next build` while other agents are working.
- Keep the demo seed deterministic. If you change `schema.ts`, regenerate migrations and re-run `pnpm seed:reset`.

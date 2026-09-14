/** Hand-maintained OpenAPI 3.1 description of the public API. Served at /api/v1/openapi.json and rendered at /docs/api. */
import { BOOTH_STATUSES, BOOTH_TYPES, ELEMENT_KINDS, WEBHOOK_EVENTS, ANALYTICS_TYPES, TRANSITION_KINDS, BANNER_PLACEMENTS } from "@/lib/domain/types";

type Op = { summary: string; description?: string; tags: string[]; params?: string[]; query?: Record<string, string>; body?: string; public?: boolean; responses?: Record<string, string> };
const E = "{event}";
const ops: Record<string, Partial<Record<"get" | "post" | "put" | "patch" | "delete", Op>>> = {
  "/api/v1/me": { get: { summary: "Who am I", tags: ["Auth"], responses: { "200": "Principal { kind, orgId, scopes }" } } },
  "/api/v1/events": { get: { summary: "List events", tags: ["Events"] }, post: { summary: "Create event", tags: ["Events"], body: "EventInput" } },
  [`/api/v1/events/${E}`]: { get: { summary: "Get event", tags: ["Events"], params: ["event"] }, patch: { summary: "Update event (settings deep-merge)", tags: ["Events"], params: ["event"], body: "Partial<EventInput>" }, delete: { summary: "Delete event", tags: ["Events"], params: ["event"] } },
  [`/api/v1/events/${E}/publish`]: { post: { summary: "Publish a new floor plan version", tags: ["Events"], params: ["event"], body: "{ note? }" } },
  [`/api/v1/events/${E}/unpublish`]: { post: { summary: "Set event back to draft", tags: ["Events"], params: ["event"] } },
  [`/api/v1/events/${E}/duplicate`]: { post: { summary: "Copy the map into a new draft event", tags: ["Events"], params: ["event"], body: "{ name, slug?, includeExhibitors? }" } },
  [`/api/v1/events/${E}/versions`]: { get: { summary: "Published versions", tags: ["Events"], params: ["event"] } },
  [`/api/v1/events/${E}/bundle`]: { get: { summary: "Full plan bundle (live, or ?published=1)", tags: ["Events"], params: ["event"], query: { published: "1 for the last published snapshot" } } },
  [`/api/v1/events/${E}/export/{format}`]: { get: { summary: "Export: expofp | geojson | booths.csv | exhibitors.csv | bundle | offline", tags: ["Events"], params: ["event", "format"] } },
  [`/api/v1/events/${E}/levels`]: { get: { summary: "List levels", tags: ["Levels"], params: ["event"] }, post: { summary: "Create level", tags: ["Levels"], params: ["event"], body: "LevelInput" } },
  [`/api/v1/events/${E}/levels/{id}`]: { get: { summary: "Get level", tags: ["Levels"], params: ["event", "id"] }, patch: { summary: "Update level", tags: ["Levels"], params: ["event", "id"], body: "Partial<LevelInput>" }, delete: { summary: "Delete level", tags: ["Levels"], params: ["event", "id"] } },
  [`/api/v1/events/${E}/levels/reorder`]: { post: { summary: "Reorder levels", tags: ["Levels"], params: ["event"], body: "{ ids: string[] }" } },
  [`/api/v1/events/${E}/booths`]: { get: { summary: "List booths", tags: ["Booths"], params: ["event"], query: { levelId: "", status: BOOTH_STATUSES.join("|"), q: "search label/externalId", exhibitorId: "", limit: "", offset: "" } }, post: { summary: "Create booth (object) or bulk upsert (array, matched by externalId then label)", tags: ["Booths"], params: ["event"], body: "BoothInput | BoothInput[]" } },
  [`/api/v1/events/${E}/booths/{id}`]: { get: { summary: "Get booth by id, label or externalId", tags: ["Booths"], params: ["event", "id"] }, patch: { summary: "Update booth", tags: ["Booths"], params: ["event", "id"], body: "Partial<BoothInput>" }, delete: { summary: "Delete booth", tags: ["Booths"], params: ["event", "id"] } },
  [`/api/v1/events/${E}/booths/{id}/assign`]: { post: { summary: "Assign an exhibitor", tags: ["Booths"], params: ["event", "id"], body: "{ exhibitorId, markSold? }" }, put: { summary: "Replace exhibitors", tags: ["Booths"], params: ["event", "id"], body: "{ exhibitorIds }" }, delete: { summary: "Unassign an exhibitor", tags: ["Booths"], params: ["event", "id"], body: "{ exhibitorId }" } },
  [`/api/v1/events/${E}/booths/{id}/status`]: { post: { summary: "Set status (held takes holdMinutes)", tags: ["Booths"], params: ["event", "id"], body: `{ status: ${BOOTH_STATUSES.join("|")}, holdMinutes? }` } },
  [`/api/v1/events/${E}/booths/{id}/quote`]: { get: { summary: "Public price quote", tags: ["Sales"], params: ["event", "id"], public: true } },
  [`/api/v1/events/${E}/booths/merge`]: { post: { summary: "Merge adjacent booths", tags: ["Booths"], params: ["event"], body: "{ boothIds, label? }" } },
  [`/api/v1/events/${E}/booths/import`]: { post: { summary: "CSV import (label, level, x, y, width, height, type, status, price, external_id, notes)", tags: ["Booths"], params: ["event"], body: "{ csv } | multipart file | text/csv" } },
  [`/api/v1/events/${E}/exhibitors`]: { get: { summary: "List exhibitors", tags: ["Exhibitors"], params: ["event"], query: { q: "", categoryId: "", levelId: "", featured: "1|0", unassigned: "1", limit: "", offset: "" } }, post: { summary: "Create (object) or bulk upsert (array; externalId → gripId → name)", tags: ["Exhibitors"], params: ["event"], body: "ExhibitorInput | ExhibitorInput[]" } },
  [`/api/v1/events/${E}/exhibitors/{id}`]: { get: { summary: "Get by id, slug or externalId", tags: ["Exhibitors"], params: ["event", "id"] }, patch: { summary: "Update exhibitor", tags: ["Exhibitors"], params: ["event", "id"], body: "Partial<ExhibitorInput>" }, delete: { summary: "Delete exhibitor", tags: ["Exhibitors"], params: ["event", "id"] } },
  [`/api/v1/events/${E}/exhibitors/{id}/portal-link`]: { get: { summary: "Self-service magic link", tags: ["Exhibitors"], params: ["event", "id"] }, post: { summary: "Rotate magic link", tags: ["Exhibitors"], params: ["event", "id"] } },
  [`/api/v1/events/${E}/exhibitors/{id}/extras`]: { get: { summary: "Extras held", tags: ["Sales"], params: ["event", "id"] }, post: { summary: "Assign extra", tags: ["Sales"], params: ["event", "id"], body: "{ extraId, quantity?, boothId? }" }, delete: { summary: "Remove extra", tags: ["Sales"], params: ["event", "id"], body: "{ extraId }" } },
  [`/api/v1/events/${E}/exhibitors/import`]: { post: { summary: "CSV import (ExpoFP template compatible)", tags: ["Exhibitors"], params: ["event"], body: "{ csv } | multipart file" } },
  [`/api/v1/events/${E}/categories`]: { get: { summary: "List categories (with counts)", tags: ["Categories"], params: ["event"] }, post: { summary: "Create category", tags: ["Categories"], params: ["event"], body: "{ name, color?, parentId?, sortIndex? }" } },
  [`/api/v1/events/${E}/categories/{id}`]: { get: { summary: "Get category", tags: ["Categories"], params: ["event", "id"] }, patch: { summary: "Update", tags: ["Categories"], params: ["event", "id"] }, delete: { summary: "Delete", tags: ["Categories"], params: ["event", "id"] } },
  [`/api/v1/events/${E}/sessions`]: { get: { summary: "List sessions", tags: ["Sessions"], params: ["event"] }, post: { summary: "Create (object) or bulk upsert by externalId (array)", tags: ["Sessions"], params: ["event"], body: "SessionInput | SessionInput[]" } },
  [`/api/v1/events/${E}/sessions/{id}`]: { get: { summary: "Get", tags: ["Sessions"], params: ["event", "id"] }, patch: { summary: "Update", tags: ["Sessions"], params: ["event", "id"] }, delete: { summary: "Delete", tags: ["Sessions"], params: ["event", "id"] } },
  [`/api/v1/events/${E}/sessions/import`]: { post: { summary: "CSV import", tags: ["Sessions"], params: ["event"] } },
  [`/api/v1/events/${E}/elements`]: { get: { summary: "List map elements (?levelId)", tags: ["Map"], params: ["event"] }, post: { summary: "Create element", tags: ["Map"], params: ["event"], body: `{ levelId, kind: ${ELEMENT_KINDS.join("|")}, geometry, props }` }, put: { summary: "Replace a level's elements", tags: ["Map"], params: ["event"], body: "{ levelId, elements[] }" } },
  [`/api/v1/events/${E}/elements/{id}`]: { get: { summary: "Get", tags: ["Map"], params: ["event", "id"] }, patch: { summary: "Update", tags: ["Map"], params: ["event", "id"] }, delete: { summary: "Delete", tags: ["Map"], params: ["event", "id"] } },
  [`/api/v1/events/${E}/wayfinding`]: { get: { summary: "Nodes, edges, transitions (?levelId)", tags: ["Wayfinding"], params: ["event"] }, put: { summary: "Replace a level's network", tags: ["Wayfinding"], params: ["event"], body: "{ levelId, nodes[], edges[] }" } },
  [`/api/v1/events/${E}/wayfinding/generate`]: { post: { summary: "Auto-generate aisle network from geometry", tags: ["Wayfinding"], params: ["event"], body: "{ levelId, cellSize?, clearance?, apply? }" } },
  [`/api/v1/events/${E}/wayfinding/transitions`]: { get: { summary: "List transitions", tags: ["Wayfinding"], params: ["event"] }, post: { summary: "Create transition", tags: ["Wayfinding"], params: ["event"], body: `{ name, kind: ${TRANSITION_KINDS.join("|")}, accessible, nodeIds[], travelSeconds }` } },
  [`/api/v1/events/${E}/wayfinding/transitions/{id}`]: { patch: { summary: "Update", tags: ["Wayfinding"], params: ["event", "id"] }, delete: { summary: "Delete", tags: ["Wayfinding"], params: ["event", "id"] } },
  [`/api/v1/events/${E}/route`]: { get: { summary: "Public routing", tags: ["Wayfinding"], params: ["event"], public: true, query: { from: "booth:A101 | exhibitor:slug | element:id | point:L1:x,y | A101", to: "…", accessible: "1", via: "repeatable" } } },
  [`/api/v1/events/${E}/route/optimize`]: { post: { summary: "Public multi-stop optimisation", tags: ["Wayfinding"], params: ["event"], public: true, body: "{ start, stops[], accessible?, returnToStart? }" } },
  [`/api/v1/events/${E}/reserve`]: { post: { summary: "Public: reserve/buy a booth", tags: ["Sales"], params: ["event"], public: true, body: "{ boothId, company, contactName, contactEmail, exhibitorId?, notes?, extras? }", responses: { "201": "{ order, checkoutUrl }" } } },
  [`/api/v1/events/${E}/orders`]: { get: { summary: "List orders", tags: ["Sales"], params: ["event"], query: { status: "", boothId: "", exhibitorId: "" } } },
  [`/api/v1/events/${E}/orders/summary`]: { get: { summary: "Sales summary", tags: ["Sales"], params: ["event"] } },
  [`/api/v1/events/${E}/orders/expire`]: { post: { summary: "Expire timed-out holds now", tags: ["Sales"], params: ["event"] } },
  [`/api/v1/events/${E}/orders/{id}`]: { get: { summary: "Get order", tags: ["Sales"], params: ["event", "id"] }, patch: { summary: "Update notes/contact/amount", tags: ["Sales"], params: ["event", "id"] } },
  [`/api/v1/events/${E}/orders/{id}/pay`]: { post: { summary: "Mark paid (booth → sold)", tags: ["Sales"], params: ["event", "id"], body: "{ providerRef? }" } },
  [`/api/v1/events/${E}/orders/{id}/invoice`]: { post: { summary: "Mark invoiced (booth → reserved)", tags: ["Sales"], params: ["event", "id"] } },
  [`/api/v1/events/${E}/orders/{id}/cancel`]: { post: { summary: "Cancel (booth → available)", tags: ["Sales"], params: ["event", "id"], body: "{ reason? }" } },
  [`/api/v1/events/${E}/orders/{id}/refund`]: { post: { summary: "Refund (booth → available)", tags: ["Sales"], params: ["event", "id"] } },
  [`/api/v1/events/${E}/orders/{id}/checkout`]: { get: { summary: "Public: redirect to Stripe Checkout", tags: ["Sales"], params: ["event", "id"], public: true } },
  [`/api/v1/events/${E}/orders/{id}/mock-pay`]: { post: { summary: "Public (mock provider): simulate payment", tags: ["Sales"], params: ["event", "id"], public: true } },
  [`/api/v1/events/${E}/pricing-rules`]: { get: { summary: "List pricing rules", tags: ["Sales"], params: ["event"] }, post: { summary: "Create rule", tags: ["Sales"], params: ["event"], body: `{ name, boothType?: ${BOOTH_TYPES.join("|")}, minAreaM2?, maxAreaM2?, priceCents? | pricePerM2Cents?, currency? }` } },
  [`/api/v1/events/${E}/pricing-rules/{id}`]: { patch: { summary: "Update", tags: ["Sales"], params: ["event", "id"] }, delete: { summary: "Delete", tags: ["Sales"], params: ["event", "id"] } },
  [`/api/v1/events/${E}/extras`]: { get: { summary: "Sponsorships & booth extras", tags: ["Sales"], params: ["event"] }, post: { summary: "Create extra", tags: ["Sales"], params: ["event"], body: "{ kind, name, description?, priceCents?, limitPerEvent?, limitPerExhibitor?, reserveOrBuyAllowed? }" } },
  [`/api/v1/events/${E}/extras/{id}`]: { patch: { summary: "Update", tags: ["Sales"], params: ["event", "id"] }, delete: { summary: "Delete", tags: ["Sales"], params: ["event", "id"] } },
  [`/api/v1/events/${E}/banners`]: { get: { summary: "Sponsor banners", tags: ["Sponsorship"], params: ["event"] }, post: { summary: "Create banner", tags: ["Sponsorship"], params: ["event"], body: `{ placement: ${BANNER_PLACEMENTS.join("|")}, imageUrl, linkUrl?, exhibitorId?, title?, weight?, startsAt?, endsAt?, active? }` } },
  [`/api/v1/events/${E}/banners/{id}`]: { patch: { summary: "Update", tags: ["Sponsorship"], params: ["event", "id"] }, delete: { summary: "Delete", tags: ["Sponsorship"], params: ["event", "id"] } },
  [`/api/v1/events/${E}/analytics`]: { post: { summary: "Public: ingest viewer analytics (sendBeacon)", tags: ["Analytics"], params: ["event"], public: true, body: `{ events: [{ type: ${ANALYTICS_TYPES.join("|")}, sessionId?, targetType?, targetId?, query?, levelId?, x?, y?, meta? }] }` } },
  [`/api/v1/events/${E}/analytics/summary`]: { get: { summary: "Analytics summary", tags: ["Analytics"], params: ["event"], query: { from: "ISO", to: "ISO" } } },
  [`/api/v1/events/${E}/analytics/exhibitors/{id}`]: { get: { summary: "Per-exhibitor stats", tags: ["Analytics"], params: ["event", "id"] } },
  [`/api/v1/events/${E}/integrations/grip/sync`]: { post: { summary: "Sync exhibitors from Grip / a JSON or CSV feed", tags: ["Integrations"], params: ["event"], body: "{ sourceUrl?, dryRun? }" } },
  "/api/v1/webhooks": { get: { summary: "List webhooks", tags: ["Webhooks"] }, post: { summary: "Create webhook (secret returned once)", tags: ["Webhooks"], body: `{ url, eventId?, events?: ["*"] | (${WEBHOOK_EVENTS.join("|")})[], active? }` } },
  "/api/v1/webhooks/{id}": { patch: { summary: "Update", tags: ["Webhooks"], params: ["id"] }, delete: { summary: "Delete", tags: ["Webhooks"], params: ["id"] } },
  "/api/v1/webhooks/{id}/test": { post: { summary: "Send a test delivery", tags: ["Webhooks"], params: ["id"] } },
  "/api/v1/webhooks/{id}/deliveries": { get: { summary: "Recent deliveries", tags: ["Webhooks"], params: ["id"] } },
  "/api/v1/webhooks/process": { post: { summary: "Deliver pending/retrying webhooks now", tags: ["Webhooks"] } },
  "/api/v1/api-keys": { get: { summary: "List API keys", tags: ["Auth"] }, post: { summary: "Create key (organiser session only; key returned once)", tags: ["Auth"], body: "{ name, scopes? }" } },
  "/api/v1/api-keys/{id}": { delete: { summary: "Revoke key", tags: ["Auth"], params: ["id"] } },
  "/api/v1/media": { post: { summary: "Upload a file (multipart `file`) → { url }", tags: ["Media"] } },
  "/api/v1/compat/expofp/{action}": { post: { summary: "ExpoFP JSON API v1 compatibility shim (POST, token in body)", tags: ["Compatibility"], params: ["action"], description: "Actions: list-events, set-webhook-url, list-exhibitors, bulk-read-exhibitors, get-exhibitor, get-exhibitor-id, add-exhibitor, update-exhibitor, delete-exhibitor, set-exhibitor-logo, set-exhibitor-leading-image, list-booths, get-booth, update-booth, add-exhibitor-booth, remove-exhibitor-booth, list-categories, add-category, update-category, remove-category, list-extras, list-exhibitor-extras, add-exhibitor-extra, remove-exhibitor-extra, sessions/get, sessions/upsert, sessions/delete" } },
  "/e/{event}/data.json": { get: { summary: "Public plan bundle (published)", tags: ["Public"], params: ["event"], public: true, query: { preview: "1 (organiser session) for live data" } } },
  "/e/{event}/data.expofp.json": { get: { summary: "Public ExpoFP-compatible data.json", tags: ["Public"], params: ["event"], public: true } },
  "/e/{event}/version.json": { get: { summary: "Published version probe", tags: ["Public"], params: ["event"], public: true } },
};

export function openApiDocument(baseUrl: string) {
  const paths: Record<string, unknown> = {};
  for (const [p, methods] of Object.entries(ops)) {
    const entry: Record<string, unknown> = {};
    for (const [m, op] of Object.entries(methods)) {
      if (!op) continue;
      entry[m] = {
        summary: op.summary, description: op.description, tags: op.tags, security: op.public ? [] : [{ apiKey: [] }, { bearer: [] }],
        parameters: [
          ...(op.params ?? []).map((n) => ({ name: n, in: "path", required: true, schema: { type: "string" }, description: n === "event" ? "Event slug or id" : undefined })),
          ...Object.entries(op.query ?? {}).map(([n, d]) => ({ name: n, in: "query", required: false, schema: { type: "string" }, description: d || undefined })),
        ],
        requestBody: op.body ? { content: { "application/json": { schema: { type: "object", description: op.body } } } } : undefined,
        responses: { "200": { description: op.responses?.["200"] ?? "{ data }" }, ...(op.responses?.["201"] ? { "201": { description: op.responses["201"] } } : {}), "400": { description: "{ error: { code, message, details? } }" }, "401": { description: "Missing/invalid credentials" }, "404": { description: "Not found" } },
      };
    }
    paths[p] = entry;
  }
  return {
    openapi: "3.1.0",
    info: { title: "Tessera API", version: "1.0.0", description: "Interactive floor plans, booth sales and wayfinding. Authenticate with `Authorization: Bearer <api key>` (or `X-Api-Key`). Responses are `{ data, meta? }` or `{ error: { code, message, details? } }`. Event ids accept the slug." },
    servers: [{ url: baseUrl }],
    components: { securitySchemes: { apiKey: { type: "apiKey", in: "header", name: "X-Api-Key" }, bearer: { type: "http", scheme: "bearer" } } },
    tags: ["Auth", "Events", "Levels", "Booths", "Exhibitors", "Categories", "Sessions", "Map", "Wayfinding", "Sales", "Sponsorship", "Analytics", "Integrations", "Webhooks", "Media", "Compatibility", "Public"].map((name) => ({ name })),
    paths,
    "x-webhooks": { events: WEBHOOK_EVENTS, signature: "X-Tessera-Signature: t=<unix seconds>,v1=<hex HMAC-SHA256(secret, `${t}.${rawBody}`)>", headers: ["X-Tessera-Event", "X-Tessera-Delivery"], retries: "5 attempts, exponential backoff from 30 s" },
  };
}

export const OPENAPI_OPS = ops;

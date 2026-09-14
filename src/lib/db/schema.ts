import { sqliteTable, text, integer, real, primaryKey, index, uniqueIndex } from "drizzle-orm/sqlite-core";
import type {
  BannerPlacement, BoothColors, BoothStatus, BoothType, ElementKind, ElementProps, EventSettings, Geometry,
  Georef, LevelBackground, OrderStatus, Polygon, SponsorLevel, TransitionKind, WebhookEventType,
} from "@/lib/domain/types";

const now = () => new Date().toISOString();

export const organizations = sqliteTable("organizations", {
  id: text("id").primaryKey(),
  name: text("name").notNull(),
  slug: text("slug").notNull().unique(),
  createdAt: text("created_at").notNull().$defaultFn(now),
});

export const users = sqliteTable("users", {
  id: text("id").primaryKey(),
  orgId: text("org_id").notNull().references(() => organizations.id, { onDelete: "cascade" }),
  email: text("email").notNull().unique(),
  name: text("name").notNull(),
  passwordHash: text("password_hash").notNull(),
  role: text("role").$type<"owner" | "admin" | "editor" | "viewer">().notNull().default("admin"),
  createdAt: text("created_at").notNull().$defaultFn(now),
});

export const userSessions = sqliteTable("user_sessions", {
  token: text("token").primaryKey(),
  userId: text("user_id").notNull().references(() => users.id, { onDelete: "cascade" }),
  expiresAt: text("expires_at").notNull(),
  createdAt: text("created_at").notNull().$defaultFn(now),
});

export const events = sqliteTable("events", {
  id: text("id").primaryKey(),
  orgId: text("org_id").notNull().references(() => organizations.id, { onDelete: "cascade" }),
  slug: text("slug").notNull().unique(),
  name: text("name").notNull(),
  subtitle: text("subtitle"),
  description: text("description"),
  startsAt: text("starts_at"),
  endsAt: text("ends_at"),
  timezone: text("timezone").default("UTC"),
  venueName: text("venue_name"),
  venueAddress: text("venue_address"),
  venueLat: real("venue_lat"),
  venueLng: real("venue_lng"),
  status: text("status").$type<"draft" | "published" | "archived">().notNull().default("draft"),
  settings: text("settings", { mode: "json" }).$type<EventSettings>().notNull(),
  publishedVersion: integer("published_version").notNull().default(0),
  publishedAt: text("published_at"),
  createdAt: text("created_at").notNull().$defaultFn(now),
  updatedAt: text("updated_at").notNull().$defaultFn(now),
}, (t) => [index("events_org_idx").on(t.orgId)]);

export const levels = sqliteTable("levels", {
  id: text("id").primaryKey(),
  eventId: text("event_id").notNull().references(() => events.id, { onDelete: "cascade" }),
  name: text("name").notNull(),
  shortName: text("short_name").notNull(),
  sortIndex: integer("sort_index").notNull().default(0),
  widthM: real("width_m").notNull().default(200),
  heightM: real("height_m").notNull().default(150),
  background: text("background", { mode: "json" }).$type<LevelBackground | null>(),
  georef: text("georef", { mode: "json" }).$type<Georef | null>(),
  createdAt: text("created_at").notNull().$defaultFn(now),
  updatedAt: text("updated_at").notNull().$defaultFn(now),
}, (t) => [index("levels_event_idx").on(t.eventId)]);

export const booths = sqliteTable("booths", {
  id: text("id").primaryKey(),
  eventId: text("event_id").notNull().references(() => events.id, { onDelete: "cascade" }),
  levelId: text("level_id").notNull().references(() => levels.id, { onDelete: "cascade" }),
  label: text("label").notNull(),
  externalId: text("external_id"),
  polygon: text("polygon", { mode: "json" }).$type<Polygon>().notNull(),
  boothType: text("booth_type").$type<BoothType>().notNull().default("standard"),
  status: text("status").$type<BoothStatus>().notNull().default("available"),
  priceCents: integer("price_cents"),
  currency: text("currency"),
  areaM2: real("area_m2").notNull().default(0),
  widthM: real("width_m"),
  heightM: real("height_m"),
  rotationDeg: real("rotation_deg").notNull().default(0),
  colors: text("colors", { mode: "json" }).$type<BoothColors | null>(),
  labelHidden: integer("label_hidden", { mode: "boolean" }).notNull().default(false),
  height3d: real("height_3d"),
  notes: text("notes"),
  metadata: text("metadata", { mode: "json" }).$type<Record<string, string>>().notNull().default({}),
  holdUntil: text("hold_until"),
  sortIndex: integer("sort_index").notNull().default(0),
  createdAt: text("created_at").notNull().$defaultFn(now),
  updatedAt: text("updated_at").notNull().$defaultFn(now),
}, (t) => [
  index("booths_event_idx").on(t.eventId),
  index("booths_level_idx").on(t.levelId),
  uniqueIndex("booths_event_label_idx").on(t.eventId, t.label),
]);

export const exhibitors = sqliteTable("exhibitors", {
  id: text("id").primaryKey(),
  eventId: text("event_id").notNull().references(() => events.id, { onDelete: "cascade" }),
  externalId: text("external_id"),
  gripId: text("grip_id"),
  name: text("name").notNull(),
  slug: text("slug").notNull(),
  logoUrl: text("logo_url"),
  gallery: text("gallery", { mode: "json" }).$type<string[]>().notNull().default([]),
  description: text("description"),
  website: text("website"),
  email: text("email"),
  phone: text("phone"),
  country: text("country"),
  address: text("address"),
  city: text("city"),
  zip: text("zip"),
  featured: integer("featured", { mode: "boolean" }).notNull().default(false),
  sponsorLevel: text("sponsor_level").$type<SponsorLevel | null>(),
  customButtonTitle: text("custom_button_title"),
  customButtonUrl: text("custom_button_url"),
  videoUrl: text("video_url"),
  leadingImageUrl: text("leading_image_url"),
  logoInBooth: integer("logo_in_booth", { mode: "boolean" }).notNull().default(true),
  metadata: text("metadata", { mode: "json" }).$type<Record<string, string>>().notNull().default({}),
  rebookingState: integer("rebooking_state").notNull().default(0),
  socials: text("socials", { mode: "json" }).$type<Record<string, string>>().notNull().default({}),
  tags: text("tags", { mode: "json" }).$type<string[]>().notNull().default([]),
  contactName: text("contact_name"),
  portalToken: text("portal_token").unique(),
  createdAt: text("created_at").notNull().$defaultFn(now),
  updatedAt: text("updated_at").notNull().$defaultFn(now),
}, (t) => [
  index("exhibitors_event_idx").on(t.eventId),
  uniqueIndex("exhibitors_event_slug_idx").on(t.eventId, t.slug),
]);

export const boothExhibitors = sqliteTable("booth_exhibitors", {
  boothId: text("booth_id").notNull().references(() => booths.id, { onDelete: "cascade" }),
  exhibitorId: text("exhibitor_id").notNull().references(() => exhibitors.id, { onDelete: "cascade" }),
  sortIndex: integer("sort_index").notNull().default(0),
}, (t) => [primaryKey({ columns: [t.boothId, t.exhibitorId] }), index("booth_exhibitors_ex_idx").on(t.exhibitorId)]);

export const categories = sqliteTable("categories", {
  id: text("id").primaryKey(),
  eventId: text("event_id").notNull().references(() => events.id, { onDelete: "cascade" }),
  name: text("name").notNull(),
  color: text("color"),
  parentId: text("parent_id"),
  sortIndex: integer("sort_index").notNull().default(0),
}, (t) => [index("categories_event_idx").on(t.eventId)]);

export const exhibitorCategories = sqliteTable("exhibitor_categories", {
  exhibitorId: text("exhibitor_id").notNull().references(() => exhibitors.id, { onDelete: "cascade" }),
  categoryId: text("category_id").notNull().references(() => categories.id, { onDelete: "cascade" }),
}, (t) => [primaryKey({ columns: [t.exhibitorId, t.categoryId] })]);

export const elements = sqliteTable("elements", {
  id: text("id").primaryKey(),
  eventId: text("event_id").notNull().references(() => events.id, { onDelete: "cascade" }),
  levelId: text("level_id").notNull().references(() => levels.id, { onDelete: "cascade" }),
  kind: text("kind").$type<ElementKind>().notNull(),
  geometry: text("geometry", { mode: "json" }).$type<Geometry>().notNull(),
  props: text("props", { mode: "json" }).$type<ElementProps>().notNull().default({}),
  sortIndex: integer("sort_index").notNull().default(0),
  createdAt: text("created_at").notNull().$defaultFn(now),
  updatedAt: text("updated_at").notNull().$defaultFn(now),
}, (t) => [index("elements_level_idx").on(t.levelId), index("elements_event_idx").on(t.eventId)]);

export const sessions = sqliteTable("sessions", {
  id: text("id").primaryKey(),
  eventId: text("event_id").notNull().references(() => events.id, { onDelete: "cascade" }),
  externalId: text("external_id"),
  title: text("title").notNull(),
  description: text("description"),
  startsAt: text("starts_at").notNull(),
  endsAt: text("ends_at").notNull(),
  boothId: text("booth_id").references(() => booths.id, { onDelete: "set null" }),
  elementId: text("element_id").references(() => elements.id, { onDelete: "set null" }),
  speakers: text("speakers", { mode: "json" }).$type<{ name: string; title?: string; company?: string; avatarUrl?: string }[]>().notNull().default([]),
  track: text("track"),
  url: text("url"),
  createdAt: text("created_at").notNull().$defaultFn(now),
  updatedAt: text("updated_at").notNull().$defaultFn(now),
}, (t) => [index("sessions_event_idx").on(t.eventId)]);

export const wayNodes = sqliteTable("way_nodes", {
  id: text("id").primaryKey(),
  eventId: text("event_id").notNull().references(() => events.id, { onDelete: "cascade" }),
  levelId: text("level_id").notNull().references(() => levels.id, { onDelete: "cascade" }),
  x: real("x").notNull(),
  y: real("y").notNull(),
}, (t) => [index("way_nodes_level_idx").on(t.levelId)]);

export const wayEdges = sqliteTable("way_edges", {
  id: text("id").primaryKey(),
  eventId: text("event_id").notNull().references(() => events.id, { onDelete: "cascade" }),
  levelId: text("level_id").notNull().references(() => levels.id, { onDelete: "cascade" }),
  fromNodeId: text("from_node_id").notNull().references(() => wayNodes.id, { onDelete: "cascade" }),
  toNodeId: text("to_node_id").notNull().references(() => wayNodes.id, { onDelete: "cascade" }),
  accessible: integer("accessible", { mode: "boolean" }).notNull().default(true),
  oneWay: integer("one_way", { mode: "boolean" }).notNull().default(false),
  virtual: integer("virtual", { mode: "boolean" }).notNull().default(false),
  weight: real("weight").notNull().default(1),
}, (t) => [index("way_edges_level_idx").on(t.levelId)]);

export const transitions = sqliteTable("transitions", {
  id: text("id").primaryKey(),
  eventId: text("event_id").notNull().references(() => events.id, { onDelete: "cascade" }),
  name: text("name").notNull(),
  kind: text("kind").$type<TransitionKind>().notNull().default("stairs"),
  accessible: integer("accessible", { mode: "boolean" }).notNull().default(false),
  nodeIds: text("node_ids", { mode: "json" }).$type<string[]>().notNull().default([]),
  travelSeconds: integer("travel_seconds").notNull().default(60),
}, (t) => [index("transitions_event_idx").on(t.eventId)]);

/** Sponsorship packages and booth extras (ExpoFP "extras"): sellable add-ons with limits. */
export const extras = sqliteTable("extras", {
  id: text("id").primaryKey(),
  eventId: text("event_id").notNull().references(() => events.id, { onDelete: "cascade" }),
  kind: text("kind").$type<"sponsorship" | "booth_extra">().notNull().default("sponsorship"),
  name: text("name").notNull(),
  description: text("description"),
  priceCents: integer("price_cents"),
  currency: text("currency").notNull().default("USD"),
  limitPerEvent: integer("limit_per_event"),
  limitPerExhibitor: integer("limit_per_exhibitor"),
  reserveOrBuyAllowed: integer("reserve_or_buy_allowed", { mode: "boolean" }).notNull().default(true),
  sortIndex: integer("sort_index").notNull().default(0),
  createdAt: text("created_at").notNull().$defaultFn(now),
}, (t) => [index("extras_event_idx").on(t.eventId)]);

export const exhibitorExtras = sqliteTable("exhibitor_extras", {
  id: text("id").primaryKey(),
  extraId: text("extra_id").notNull().references(() => extras.id, { onDelete: "cascade" }),
  exhibitorId: text("exhibitor_id").notNull().references(() => exhibitors.id, { onDelete: "cascade" }),
  boothId: text("booth_id").references(() => booths.id, { onDelete: "set null" }),
  quantity: integer("quantity").notNull().default(1),
  createdAt: text("created_at").notNull().$defaultFn(now),
}, (t) => [index("exhibitor_extras_ex_idx").on(t.exhibitorId), index("exhibitor_extras_extra_idx").on(t.extraId)]);

export const pricingRules = sqliteTable("pricing_rules", {
  id: text("id").primaryKey(),
  eventId: text("event_id").notNull().references(() => events.id, { onDelete: "cascade" }),
  name: text("name").notNull(),
  boothType: text("booth_type").$type<BoothType | null>(),
  minAreaM2: real("min_area_m2"),
  maxAreaM2: real("max_area_m2"),
  priceCents: integer("price_cents"),
  pricePerM2Cents: integer("price_per_m2_cents"),
  currency: text("currency").notNull().default("USD"),
  sortIndex: integer("sort_index").notNull().default(0),
}, (t) => [index("pricing_rules_event_idx").on(t.eventId)]);

export const orders = sqliteTable("orders", {
  id: text("id").primaryKey(),
  eventId: text("event_id").notNull().references(() => events.id, { onDelete: "cascade" }),
  boothId: text("booth_id").notNull().references(() => booths.id, { onDelete: "cascade" }),
  exhibitorId: text("exhibitor_id").references(() => exhibitors.id, { onDelete: "set null" }),
  status: text("status").$type<OrderStatus>().notNull().default("hold"),
  amountCents: integer("amount_cents").notNull().default(0),
  taxCents: integer("tax_cents").notNull().default(0),
  currency: text("currency").notNull().default("USD"),
  provider: text("provider").$type<"mock" | "stripe" | "invoice">().notNull().default("mock"),
  providerRef: text("provider_ref"),
  checkoutUrl: text("checkout_url"),
  expiresAt: text("expires_at"),
  company: text("company"),
  contactName: text("contact_name"),
  contactEmail: text("contact_email"),
  notes: text("notes"),
  paidAt: text("paid_at"),
  createdAt: text("created_at").notNull().$defaultFn(now),
  updatedAt: text("updated_at").notNull().$defaultFn(now),
}, (t) => [index("orders_event_idx").on(t.eventId), index("orders_booth_idx").on(t.boothId)]);

export const banners = sqliteTable("banners", {
  id: text("id").primaryKey(),
  eventId: text("event_id").notNull().references(() => events.id, { onDelete: "cascade" }),
  exhibitorId: text("exhibitor_id").references(() => exhibitors.id, { onDelete: "set null" }),
  placement: text("placement").$type<BannerPlacement>().notNull().default("search_top"),
  title: text("title"),
  imageUrl: text("image_url").notNull(),
  linkUrl: text("link_url"),
  active: integer("active", { mode: "boolean" }).notNull().default(true),
  weight: integer("weight").notNull().default(1),
  startsAt: text("starts_at"),
  endsAt: text("ends_at"),
  impressions: integer("impressions").notNull().default(0),
  clicks: integer("clicks").notNull().default(0),
  createdAt: text("created_at").notNull().$defaultFn(now),
}, (t) => [index("banners_event_idx").on(t.eventId)]);

export const apiKeys = sqliteTable("api_keys", {
  id: text("id").primaryKey(),
  orgId: text("org_id").notNull().references(() => organizations.id, { onDelete: "cascade" }),
  name: text("name").notNull(),
  prefix: text("prefix").notNull(),
  keyHash: text("key_hash").notNull().unique(),
  scopes: text("scopes", { mode: "json" }).$type<string[]>().notNull().default(["read", "write"]),
  lastUsedAt: text("last_used_at"),
  createdAt: text("created_at").notNull().$defaultFn(now),
  revokedAt: text("revoked_at"),
}, (t) => [index("api_keys_org_idx").on(t.orgId)]);

export const webhooks = sqliteTable("webhooks", {
  id: text("id").primaryKey(),
  orgId: text("org_id").notNull().references(() => organizations.id, { onDelete: "cascade" }),
  eventId: text("event_id").references(() => events.id, { onDelete: "cascade" }),
  url: text("url").notNull(),
  secret: text("secret").notNull(),
  events: text("events", { mode: "json" }).$type<WebhookEventType[] | ["*"]>().notNull().default(["*"]),
  active: integer("active", { mode: "boolean" }).notNull().default(true),
  createdAt: text("created_at").notNull().$defaultFn(now),
}, (t) => [index("webhooks_org_idx").on(t.orgId)]);

export const webhookDeliveries = sqliteTable("webhook_deliveries", {
  id: text("id").primaryKey(),
  webhookId: text("webhook_id").notNull().references(() => webhooks.id, { onDelete: "cascade" }),
  eventType: text("event_type").notNull(),
  payload: text("payload", { mode: "json" }).$type<unknown>().notNull(),
  status: text("status").$type<"pending" | "success" | "failed">().notNull().default("pending"),
  responseCode: integer("response_code"),
  attempts: integer("attempts").notNull().default(0),
  lastError: text("last_error"),
  nextAttemptAt: text("next_attempt_at"),
  deliveredAt: text("delivered_at"),
  createdAt: text("created_at").notNull().$defaultFn(now),
}, (t) => [index("webhook_deliveries_hook_idx").on(t.webhookId), index("webhook_deliveries_status_idx").on(t.status)]);

export const analyticsEvents = sqliteTable("analytics_events", {
  id: text("id").primaryKey(),
  eventId: text("event_id").notNull().references(() => events.id, { onDelete: "cascade" }),
  type: text("type").notNull(),
  sessionId: text("session_id"),
  targetType: text("target_type"),
  targetId: text("target_id"),
  query: text("query"),
  levelId: text("level_id"),
  x: real("x"),
  y: real("y"),
  meta: text("meta", { mode: "json" }).$type<Record<string, unknown> | null>(),
  createdAt: text("created_at").notNull().$defaultFn(now),
}, (t) => [index("analytics_event_idx").on(t.eventId, t.type), index("analytics_created_idx").on(t.createdAt)]);

export const floorplanVersions = sqliteTable("floorplan_versions", {
  id: text("id").primaryKey(),
  eventId: text("event_id").notNull().references(() => events.id, { onDelete: "cascade" }),
  version: integer("version").notNull(),
  bundle: text("bundle", { mode: "json" }).$type<unknown>().notNull(),
  note: text("note"),
  createdAt: text("created_at").notNull().$defaultFn(now),
}, (t) => [uniqueIndex("floorplan_versions_event_version_idx").on(t.eventId, t.version)]);

export const sharedPlans = sqliteTable("shared_plans", {
  id: text("id").primaryKey(),
  eventId: text("event_id").notNull().references(() => events.id, { onDelete: "cascade" }),
  items: text("items", { mode: "json" }).$type<{ boothIds: string[]; exhibitorIds: string[]; sessionIds: string[] }>().notNull(),
  createdAt: text("created_at").notNull().$defaultFn(now),
});

export const mediaAssets = sqliteTable("media_assets", {
  id: text("id").primaryKey(),
  orgId: text("org_id").notNull().references(() => organizations.id, { onDelete: "cascade" }),
  filename: text("filename").notNull(),
  mime: text("mime").notNull(),
  size: integer("size").notNull(),
  path: text("path").notNull(),
  createdAt: text("created_at").notNull().$defaultFn(now),
});

export type Organization = typeof organizations.$inferSelect;
export type User = typeof users.$inferSelect;
export type Event = typeof events.$inferSelect;
export type NewEvent = typeof events.$inferInsert;
export type Level = typeof levels.$inferSelect;
export type Booth = typeof booths.$inferSelect;
export type NewBooth = typeof booths.$inferInsert;
export type Exhibitor = typeof exhibitors.$inferSelect;
export type NewExhibitor = typeof exhibitors.$inferInsert;
export type Category = typeof categories.$inferSelect;
export type Element = typeof elements.$inferSelect;
export type Session = typeof sessions.$inferSelect;
export type WayNode = typeof wayNodes.$inferSelect;
export type WayEdge = typeof wayEdges.$inferSelect;
export type Transition = typeof transitions.$inferSelect;
export type PricingRule = typeof pricingRules.$inferSelect;
export type Extra = typeof extras.$inferSelect;
export type ExhibitorExtra = typeof exhibitorExtras.$inferSelect;
export type Order = typeof orders.$inferSelect;
export type Banner = typeof banners.$inferSelect;
export type ApiKey = typeof apiKeys.$inferSelect;
export type Webhook = typeof webhooks.$inferSelect;
export type WebhookDelivery = typeof webhookDeliveries.$inferSelect;
export type AnalyticsEvent = typeof analyticsEvents.$inferSelect;
export type FloorplanVersion = typeof floorplanVersions.$inferSelect;

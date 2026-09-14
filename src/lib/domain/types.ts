/**
 * Shared domain types. Plan coordinates are in METERS, x to the right, y DOWN (SVG convention).
 * Everything the viewer, editor, API and SDK exchange is defined here.
 */

export type Point = [number, number];
export type Polygon = Point[]; // implicitly closed, >= 3 points

export type Geometry =
  | { type: "polygon"; points: Polygon }
  | { type: "polyline"; points: Point[] }
  | { type: "point"; point: Point };

export const BOOTH_STATUSES = ["available", "held", "reserved", "sold", "unavailable"] as const;
export type BoothStatus = (typeof BOOTH_STATUSES)[number];

export const BOOTH_TYPES = ["standard", "corner", "peninsula", "island", "table", "shell", "sponsor", "custom"] as const;
export type BoothType = (typeof BOOTH_TYPES)[number];

export const ELEMENT_KINDS = ["wall", "line", "text", "poi", "zone", "image", "shape", "entrance", "stage", "room"] as const;
export type ElementKind = (typeof ELEMENT_KINDS)[number];

export const POI_TYPES = [
  "entrance", "exit", "registration", "info", "restroom", "accessible_restroom", "food", "cafe", "bar",
  "first_aid", "stage", "elevator", "stairs", "escalator", "atm", "coat_check", "parking", "charging",
  "quiet_room", "prayer_room", "nursing_room", "meeting_point", "press", "vip", "lounge", "wifi",
  "smoking", "taxi", "shuttle", "hotel", "photo", "water", "storage", "security", "other",
] as const;
export type PoiType = (typeof POI_TYPES)[number];

export const SPONSOR_LEVELS = ["platinum", "gold", "silver", "bronze", "partner"] as const;
export type SponsorLevel = (typeof SPONSOR_LEVELS)[number];

export const TRANSITION_KINDS = ["stairs", "escalator", "elevator", "ramp", "door", "bridge"] as const;
export type TransitionKind = (typeof TRANSITION_KINDS)[number];

export const BANNER_PLACEMENTS = ["search_top", "list_inline", "map_corner", "detail_top", "splash"] as const;
export type BannerPlacement = (typeof BANNER_PLACEMENTS)[number];

export const ORDER_STATUSES = ["hold", "pending_payment", "paid", "invoiced", "cancelled", "expired", "refunded"] as const;
export type OrderStatus = (typeof ORDER_STATUSES)[number];

export const SUPPORTED_LOCALES = ["en", "de", "fr", "es", "pt", "it", "nl", "ja", "zh", "ar"] as const;
export type Locale = (typeof SUPPORTED_LOCALES)[number];

export interface Georef {
  /** Latitude/longitude of plan origin (0,0). */
  originLat: number;
  originLng: number;
  /** Clockwise rotation of the plan's +x axis from true east, in degrees. */
  rotationDeg: number;
  /** Multiply plan units by this to get meters (plans are authored in meters, so usually 1). */
  metersPerUnit: number;
}

export interface LevelBackground {
  url: string;
  x: number; // plan units
  y: number;
  width: number;
  height: number;
  opacity: number; // 0..1
  rotationDeg?: number;
}

export interface BoothColors {
  fill?: string;
  available?: string;
  held?: string;
  reserved?: string;
  sold?: string;
  unavailable?: string;
  label?: string;
  border?: string;
}

export interface ElementProps {
  name?: string;
  text?: string;
  fontSize?: number; // plan units
  color?: string;
  fill?: string;
  stroke?: string;
  strokeWidth?: number;
  opacity?: number;
  rotationDeg?: number;
  poiType?: PoiType;
  icon?: string;
  url?: string;
  description?: string;
  /** For 'entrance' elements, whether this entrance is a default routing start. */
  isDefaultStart?: boolean;
  /** For zones, extrude height in meters when 3D is on. */
  height3d?: number;
  /** Element is walkable (zones) or blocks routing (walls). */
  blocksRouting?: boolean;
  [key: string]: unknown;
}

export interface EventTerms {
  booth: string;
  booths: string;
  exhibitor: string;
  exhibitors: string;
  level: string;
  levels: string;
  reserveButton: string;
}

export interface EventBranding {
  primaryColor: string;
  accentColor: string;
  logoUrl?: string;
  fontFamily?: string;
  /** Basemap style under a georeferenced plan. */
  mapStyle: "light" | "dark" | "streets" | "none";
  boothColors: Required<Pick<BoothColors, "available" | "held" | "reserved" | "sold" | "unavailable">> & { sponsor: string; label: string; border: string };
  backgroundColor: string;
  customCss?: string;
}

export interface EventFeatures {
  basemap: boolean;
  threeD: boolean;
  wayfinding: boolean;
  accessibleRouting: boolean;
  bookmarks: boolean;
  sharing: boolean;
  kiosk: boolean;
  gps: boolean;
  showAvailability: boolean;
  showPrices: boolean;
  allowReservation: boolean;
  search: boolean;
  sessions: boolean;
  sponsorBanners: boolean;
  exhibitorList: boolean;
  heatmapAnalytics: boolean;
}

export interface EventSales {
  enabled: boolean;
  currency: string; // ISO 4217
  mode: "reserve" | "buy" | "inquiry";
  holdMinutes: number;
  defaultPricePerM2Cents: number;
  taxPercent: number;
  termsUrl?: string;
  provider: "mock" | "stripe" | "invoice";
  reserveInstructions?: string;
  notifyEmail?: string;
}

export interface EventSettings {
  terms: EventTerms;
  locale: Locale;
  languages: Locale[];
  branding: EventBranding;
  registerUrl?: string;
  websiteUrl?: string;
  features: EventFeatures;
  sales: EventSales;
  seo?: { title?: string; description?: string; ogImage?: string };
  embed: { allowedOrigins: string[] };
  /** Grip integration */
  grip?: { eventId?: string; apiKeyRef?: string; syncExhibitors?: boolean; lastSyncAt?: string };
}

export const DEFAULT_SETTINGS: EventSettings = {
  terms: {
    booth: "Booth",
    booths: "Booths",
    exhibitor: "Exhibitor",
    exhibitors: "Exhibitors",
    level: "Level",
    levels: "Levels",
    reserveButton: "Reserve this booth",
  },
  locale: "en",
  languages: ["en"],
  branding: {
    primaryColor: "#1d4ed8",
    accentColor: "#f97316",
    mapStyle: "light",
    boothColors: {
      available: "#d1d5db",
      held: "#fbbf24",
      reserved: "#fb923c",
      sold: "#3b82f6",
      unavailable: "#9ca3af",
      sponsor: "#a855f7",
      label: "#111827",
      border: "#ffffff",
    },
    backgroundColor: "#f3f4f6",
  },
  features: {
    basemap: true,
    threeD: true,
    wayfinding: true,
    accessibleRouting: true,
    bookmarks: true,
    sharing: true,
    kiosk: true,
    gps: true,
    showAvailability: true,
    showPrices: false,
    allowReservation: true,
    search: true,
    sessions: true,
    sponsorBanners: true,
    exhibitorList: true,
    heatmapAnalytics: true,
  },
  sales: {
    enabled: true,
    currency: "USD",
    mode: "reserve",
    holdMinutes: 30,
    defaultPricePerM2Cents: 45000,
    taxPercent: 0,
    provider: "mock",
  },
  embed: { allowedOrigins: ["*"] },
};

/* ------------------------------------------------------------------ */
/* Public bundle: what the viewer / SDK / offline export consume.       */
/* ------------------------------------------------------------------ */

export interface BundleEvent {
  id: string;
  slug: string;
  name: string;
  subtitle?: string | null;
  description?: string | null;
  startsAt?: string | null;
  endsAt?: string | null;
  timezone?: string | null;
  venue: { name?: string | null; address?: string | null; lat?: number | null; lng?: number | null };
  status: "draft" | "published" | "archived";
  settings: EventSettings;
}

export interface BundleElement {
  id: string;
  levelId: string;
  kind: ElementKind;
  geometry: Geometry;
  props: ElementProps;
  sortIndex: number;
}

export interface BundleLevel {
  id: string;
  name: string;
  shortName: string;
  sortIndex: number;
  widthM: number;
  heightM: number;
  background: LevelBackground | null;
  georef: Georef | null;
  elements: BundleElement[];
}

export interface BundleBooth {
  id: string;
  levelId: string;
  label: string;
  externalId?: string | null;
  polygon: Polygon;
  center: Point;
  boothType: BoothType;
  status: BoothStatus;
  priceCents?: number | null;
  currency?: string | null;
  areaM2: number;
  widthM?: number | null;
  heightM?: number | null;
  rotationDeg: number;
  colors: BoothColors | null;
  labelHidden: boolean;
  exhibitorIds: string[];
  height3d?: number | null;
}

export interface BundleExhibitor {
  id: string;
  externalId?: string | null;
  gripId?: string | null;
  name: string;
  slug: string;
  logoUrl?: string | null;
  gallery: string[];
  description?: string | null;
  website?: string | null;
  email?: string | null;
  phone?: string | null;
  country?: string | null;
  address?: string | null;
  city?: string | null;
  zip?: string | null;
  featured: boolean;
  sponsorLevel?: SponsorLevel | null;
  customButtonTitle?: string | null;
  customButtonUrl?: string | null;
  videoUrl?: string | null;
  socials: Record<string, string>;
  tags: string[];
  categoryIds: string[];
  boothIds: string[];
  boothLabels: string[];
}

export interface BundleCategory {
  id: string;
  name: string;
  color?: string | null;
  parentId?: string | null;
  sortIndex: number;
}

export interface BundleSession {
  id: string;
  externalId?: string | null;
  title: string;
  description?: string | null;
  startsAt: string;
  endsAt: string;
  boothId?: string | null;
  elementId?: string | null;
  speakers: { name: string; title?: string; company?: string; avatarUrl?: string }[];
  track?: string | null;
  url?: string | null;
}

export interface BundleWayNode { id: string; levelId: string; x: number; y: number }
export interface BundleWayEdge { id: string; from: string; to: string; accessible: boolean; oneWay: boolean; virtual: boolean; weight: number }
export interface BundleTransition { id: string; name: string; kind: TransitionKind; accessible: boolean; nodeIds: string[]; travelSeconds: number }

export interface BundleWayfinding {
  nodes: BundleWayNode[];
  edges: BundleWayEdge[];
  transitions: BundleTransition[];
}

export interface BundleBanner {
  id: string;
  exhibitorId?: string | null;
  placement: BannerPlacement;
  title?: string | null;
  imageUrl: string;
  linkUrl?: string | null;
  weight: number;
}

export interface PlanBundle {
  format: "tessera.bundle";
  formatVersion: 1;
  version: number;
  generatedAt: string;
  event: BundleEvent;
  levels: BundleLevel[];
  booths: BundleBooth[];
  exhibitors: BundleExhibitor[];
  categories: BundleCategory[];
  sessions: BundleSession[];
  wayfinding: BundleWayfinding;
  banners: BundleBanner[];
}

/* ------------------------------------------------------------------ */
/* Routing                                                              */
/* ------------------------------------------------------------------ */

export type RouteEndpoint =
  | { type: "booth"; id: string }
  | { type: "exhibitor"; id: string }
  | { type: "element"; id: string }
  | { type: "point"; levelId: string; x: number; y: number }
  | { type: "node"; id: string };

export interface RouteStep {
  levelId: string;
  points: Point[];
  distanceM: number;
  instruction?: string;
  transition?: { id: string; kind: TransitionKind; toLevelId: string };
}

export interface RouteResult {
  ok: true;
  from: RouteEndpoint;
  to: RouteEndpoint;
  accessible: boolean;
  distanceM: number;
  durationSeconds: number;
  steps: RouteStep[];
  levelIds: string[];
}

export interface RouteError { ok: false; error: string }

/* ------------------------------------------------------------------ */
/* Webhooks                                                             */
/* ------------------------------------------------------------------ */

export const WEBHOOK_EVENTS = [
  "booth.created", "booth.updated", "booth.deleted", "booth.status_changed", "booth.assigned", "booth.unassigned",
  "exhibitor.created", "exhibitor.updated", "exhibitor.deleted",
  "order.created", "order.paid", "order.cancelled", "order.expired",
  "floorplan.published", "session.created", "session.updated", "session.deleted",
] as const;
export type WebhookEventType = (typeof WEBHOOK_EVENTS)[number];

export interface WebhookPayload<T = unknown> {
  id: string;
  type: WebhookEventType;
  createdAt: string;
  eventId: string;
  data: T;
}

/* ------------------------------------------------------------------ */
/* Analytics                                                            */
/* ------------------------------------------------------------------ */

export const ANALYTICS_TYPES = [
  "view", "search", "booth_click", "exhibitor_view", "category_select", "route", "bookmark", "share",
  "custom_button", "banner_impression", "banner_click", "level_switch", "position",
] as const;
export type AnalyticsType = (typeof ANALYTICS_TYPES)[number];

export interface AnalyticsEventInput {
  type: AnalyticsType;
  sessionId?: string;
  targetType?: "booth" | "exhibitor" | "category" | "session" | "banner" | "level" | "element";
  targetId?: string;
  query?: string;
  levelId?: string;
  x?: number;
  y?: number;
  meta?: Record<string, unknown>;
}

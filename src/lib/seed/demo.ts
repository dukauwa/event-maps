/**
 * Demo data: a realistic two-level trade show ("Grip Connect 2026" at ExCeL London) with ~280 booths,
 * ~230 exhibitors, categories, sessions, POIs, a hand-drawn wayfinding network, pricing rules, sponsors,
 * an organiser account, an API key and two weeks of synthetic analytics. Deterministic (seeded PRNG).
 */
import { count } from "drizzle-orm";
import type { DB } from "@/lib/db";
import * as schema from "@/lib/db/schema";
import { newId, secretToken, withDeterministicIds } from "@/lib/ids";
import { hashPassword, sha256 } from "@/lib/auth/password";
import { DEFAULT_SETTINGS, type BoothStatus, type BoothType, type ElementKind, type ElementProps, type EventSettings, type Geometry, type Point, type Polygon, type PoiType, type SponsorLevel } from "@/lib/domain/types";
import { polygonArea, rectPolygon, round } from "@/lib/domain/geometry";
import { polylinesToGraph, type GraphLine } from "./graph";
import { BRAND } from "@/lib/brand";
import { resolveBoothPrice } from "@/lib/pricing";

export const DEMO = {
  orgName: "Grip",
  orgSlug: "grip",
  eventSlug: "grip-connect-2026",
  adminEmail: "admin@tessera.local",
  adminPassword: "tessera-demo",
  /** Fixed demo API key so docs/examples work out of the box. */
  apiKey: `${BRAND.apiKeyPrefix}_live_demo_9f3b1c7e2a4d6f8b0c1d2e3f4a5b6c7d`,
};

/* ---------------- deterministic PRNG ---------------- */
function mulberry32(seed: number) {
  let a = seed >>> 0;
  return () => {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

const ADJ = ["Nimbus", "Vantage", "Lumen", "Arcadia", "Quantum", "Helix", "Solstice", "Beacon", "Cobalt", "Verdant", "Atlas", "Nova", "Ember", "Orbit", "Meridian", "Pinnacle", "Summit", "Harbor", "Cascade", "Zenith", "Aurora", "Kestrel", "Bright", "Kinetic", "Stellar", "Northwind", "Falcon", "Granite", "Juniper", "Onyx", "Sapphire", "Tidal", "Velocity", "Wildflower", "Axiom", "Blueprint", "Cipher", "Delta", "Evergreen", "Fathom", "Glacier", "Horizon", "Ironclad", "Lantern", "Monarch", "Nexus", "Oakridge", "Paragon", "Radiant", "Sequoia", "Trident", "Umbra", "Vertex", "Willow", "Yonder", "Zephyr", "Amber", "Boreal", "Crest", "Drift"];
const NOUN = ["Analytics", "Robotics", "Systems", "Labs", "Dynamics", "Networks", "Logistics", "Health", "Energy", "Mobility", "Security", "Cloud", "Payments", "Media", "Studio", "Works", "Technologies", "Software", "Devices", "Materials", "Foods", "Ventures", "Digital", "Data", "Interactive", "Automation", "Solutions", "Bio", "Optics", "Signal", "Capital", "Group", "Partners", "Sensors", "Textiles", "Printing", "Learning", "Talent", "Travel", "Retail"];
const COUNTRIES = ["United Kingdom", "Germany", "France", "Netherlands", "United States", "Spain", "Italy", "Sweden", "Denmark", "Ireland", "Switzerland", "Canada", "Singapore", "Australia", "Japan", "Poland", "Belgium", "Portugal", "Israel", "India"];
const CITIES: Record<string, string[]> = {
  "United Kingdom": ["London", "Manchester", "Bristol", "Edinburgh"], Germany: ["Berlin", "Munich", "Hamburg"], France: ["Paris", "Lyon"], Netherlands: ["Amsterdam", "Rotterdam"],
  "United States": ["New York", "Austin", "San Francisco", "Chicago"], Spain: ["Madrid", "Barcelona"], Italy: ["Milan", "Turin"], Sweden: ["Stockholm"], Denmark: ["Copenhagen"], Ireland: ["Dublin"],
  Switzerland: ["Zurich"], Canada: ["Toronto", "Vancouver"], Singapore: ["Singapore"], Australia: ["Sydney", "Melbourne"], Japan: ["Tokyo"], Poland: ["Warsaw"], Belgium: ["Brussels"], Portugal: ["Lisbon"], Israel: ["Tel Aviv"], India: ["Bengaluru", "Mumbai"],
};
const PALETTE = ["#1d4ed8", "#0f766e", "#b91c1c", "#7c3aed", "#c2410c", "#0e7490", "#4d7c0f", "#be185d", "#1e3a8a", "#78350f", "#334155", "#9333ea"];
const CATEGORIES: { name: string; color: string }[] = [
  { name: "AI & Data", color: "#7c3aed" }, { name: "Fintech & Payments", color: "#0f766e" }, { name: "Robotics & Automation", color: "#c2410c" },
  { name: "Cloud & Infrastructure", color: "#1d4ed8" }, { name: "Cybersecurity", color: "#b91c1c" }, { name: "Sustainability & Energy", color: "#4d7c0f" },
  { name: "Health Tech", color: "#be185d" }, { name: "Mobility & Logistics", color: "#0e7490" }, { name: "Marketing Tech", color: "#9333ea" },
  { name: "HR & Future of Work", color: "#334155" }, { name: "Hardware & IoT", color: "#78350f" }, { name: "Professional Services", color: "#1e3a8a" },
];
const BLURBS = [
  "{name} helps teams ship faster with a platform trusted by hundreds of customers across Europe and North America.",
  "Founded in {year}, {name} builds products that turn complex operations into simple, reliable workflows.",
  "{name} is a fast-growing company focused on {cat}. Visit us at booth {booth} for live demos every hour.",
  "From startups to global enterprises, {name} delivers measurable results in {cat}. Book a meeting with our team on the Grip app.",
  "{name} combines deep domain expertise in {cat} with a modern, API-first product. Stop by for a coffee and a demo.",
];

export function logoDataUri(name: string, color: string): string {
  const initials = name.split(/\s+/).filter(Boolean).slice(0, 2).map((w) => w[0]).join("").toUpperCase();
  const svg = `<svg xmlns='http://www.w3.org/2000/svg' width='240' height='240' viewBox='0 0 240 240'><rect width='240' height='240' rx='40' fill='${color}'/><text x='120' y='146' font-family='Inter,Arial,Helvetica,sans-serif' font-size='96' font-weight='700' text-anchor='middle' fill='#ffffff'>${initials}</text></svg>`;
  return `data:image/svg+xml;utf8,${encodeURIComponent(svg)}`;
}

export function slugify(s: string): string {
  return s.toLowerCase().normalize("NFKD").replace(/[^a-z0-9]+/g, "-").replace(/^-+|-+$/g, "").slice(0, 60);
}

interface BoothSpec { label: string; levelKey: string; polygon: Polygon; w: number; h: number; type: BoothType; sortIndex: number }
interface ElementSpec { levelKey: string; kind: ElementKind; geometry: Geometry; props: ElementProps; sortIndex: number }

/** Lay out Level 1: sponsor islands up front, three bands of back-to-back 4x4 m booths, concourse at the back. */
function layoutLevel1(): { booths: BoothSpec[]; elements: ElementSpec[]; lines: GraphLine[] } {
  const booths: BoothSpec[] = [];
  const elements: ElementSpec[] = [];
  const L = "L1";
  let sort = 0;
  const blocks: [number, number][] = [[14, 54], [62, 102], [110, 150], [158, 188]];

  // Sponsor islands (front row)
  const islands = [[24, 44], [72, 92], [120, 140]] as const;
  islands.forEach(([x0, x1], i) => {
    booths.push({ label: `S${i + 1}`, levelKey: L, polygon: rectPolygon(x0, 14, x1 - x0, 12), w: x1 - x0, h: 12, type: "island", sortIndex: sort++ });
  });
  booths.push({ label: "S4", levelKey: L, polygon: rectPolygon(160, 16, 10, 8), w: 10, h: 8, type: "sponsor", sortIndex: sort++ });
  booths.push({ label: "S5", levelKey: L, polygon: rectPolygon(176, 16, 10, 8), w: 10, h: 8, type: "sponsor", sortIndex: sort++ });

  // Bands of standard booths
  const bands = [34, 52, 70];
  const rowLetters = [["A", "B"], ["C", "D"], ["E", "F"]];
  const rng = mulberry32(7);
  bands.forEach((y0, bi) => {
    [0, 1].forEach((ri) => {
      const y = y0 + ri * 4;
      const letter = rowLetters[bi][ri];
      blocks.forEach(([bx0, bx1], blockIdx) => {
        let x = bx0;
        let n = 1;
        while (x + 4 <= bx1 + 0.001) {
          const merge = rng() < 0.08 && x + 8 <= bx1 + 0.001;
          const w = merge ? 8 : 4;
          const isEnd = x === bx0 || x + w >= bx1 - 0.001;
          booths.push({
            label: `${letter}${blockIdx + 1}${String(n).padStart(2, "0")}`,
            levelKey: L, polygon: rectPolygon(x, y, w, 4), w, h: 4,
            type: isEnd ? "corner" : "standard", sortIndex: sort++,
          });
          x += w;
          n += merge ? 2 : 1;
        }
      });
    });
  });

  // Walls (hall outline) and labels
  const outline: Point[] = [[10, 10], [190, 10], [190, 110], [10, 110], [10, 10]];
  elements.push({ levelKey: L, kind: "wall", geometry: { type: "polyline", points: outline }, props: { name: "Hall outline", strokeWidth: 0.4, color: "#374151" }, sortIndex: 0 });
  elements.push({ levelKey: L, kind: "text", geometry: { type: "point", point: [100, 6] }, props: { text: "HALL S1 – S3", fontSize: 4, color: "#6b7280" }, sortIndex: 1 });

  // Zones on the concourse
  const zone = (name: string, poly: Polygon, fill: string, extra: ElementProps = {}) =>
    elements.push({ levelKey: L, kind: "zone", geometry: { type: "polygon", points: poly }, props: { name, fill, opacity: 0.35, blocksRouting: true, ...extra }, sortIndex: 10 });
  zone("Food Court", rectPolygon(12, 90, 44, 18), "#fde68a", { poiType: "food", height3d: 0.5 });
  zone("Registration", rectPolygon(62, 98, 22, 10), "#bfdbfe", { poiType: "registration" });
  zone("Networking Lounge", rectPolygon(126, 90, 34, 18), "#c7d2fe", { poiType: "lounge" });
  elements.push({ levelKey: L, kind: "stage", geometry: { type: "polygon", points: rectPolygon(164, 90, 24, 18) }, props: { name: "Grip Stage", fill: "#fecaca", opacity: 0.5, blocksRouting: true, height3d: 1 }, sortIndex: 11 });

  const poi = (type: PoiType, name: string, p: Point, extra: ElementProps = {}) =>
    elements.push({ levelKey: L, kind: "poi", geometry: { type: "point", point: p }, props: { poiType: type, name, ...extra }, sortIndex: 20 });
  elements.push({ levelKey: L, kind: "entrance", geometry: { type: "point", point: [90, 110] }, props: { name: "Main Entrance", isDefaultStart: true, poiType: "entrance" }, sortIndex: 5 });
  elements.push({ levelKey: L, kind: "entrance", geometry: { type: "point", point: [122, 110] }, props: { name: "East Entrance", poiType: "entrance" }, sortIndex: 5 });
  poi("info", "Information Desk", [100, 100]);
  poi("restroom", "Restrooms", [112, 104]);
  poi("restroom", "Restrooms", [12, 12]);
  poi("accessible_restroom", "Accessible Restroom", [16, 12]);
  poi("first_aid", "First Aid", [188, 12]);
  poi("cafe", "Espresso Bar", [58, 47]);
  poi("charging", "Charging Point", [106, 65]);
  poi("wifi", "Wi-Fi Lounge", [154, 47]);
  poi("coat_check", "Cloakroom", [66, 104]);
  poi("atm", "ATM", [86, 104]);
  poi("press", "Press Room", [188, 65]);
  poi("escalator", "Escalator to Level 2", [186, 86]);
  poi("elevator", "Lift to Level 2", [186, 9]);

  // Wayfinding network: aisle centerlines. Crossings/T-junctions are resolved by polylinesToGraph.
  const lines: GraphLine[] = [];
  for (const y of [12, 30, 47, 65, 83, 89]) lines.push({ points: [[12, y], [189, y]] });
  for (const x of [12, 58, 106, 154, 189]) lines.push({ points: [[x, 12], [x, 89]] });
  lines.push({ points: [[90, 89], [90, 110]] }); // main entrance connector
  lines.push({ points: [[122, 89], [122, 110]] }); // east entrance connector
  lines.push({ points: [[186, 83], [186, 86]], weight: 1 }); // escalator approach
  lines.push({ points: [[186, 12], [186, 9]] }); // lift approach
  lines.push({ points: [[100, 89], [100, 100]] }); // info desk
  lines.push({ points: [[112, 89], [112, 104]] }); // restrooms
  // A narrow service corridor with steps (not accessible) as a shortcut between bands.
  lines.push({ points: [[80, 47], [80, 65]], accessible: false, weight: 0.8 });
  return { booths, elements, lines };
}

/** Level 2: startup tables, two conference rooms. */
function layoutLevel2(): { booths: BoothSpec[]; elements: ElementSpec[]; lines: GraphLine[] } {
  const booths: BoothSpec[] = [];
  const elements: ElementSpec[] = [];
  const L = "L2";
  let sort = 1000;
  let n = 1;
  for (const y of [20, 34, 48]) {
    for (let x = 14; x + 3 <= 84; x += 5) {
      booths.push({ label: `T${String(n).padStart(2, "0")}`, levelKey: L, polygon: rectPolygon(x, y, 3, 3), w: 3, h: 3, type: "table", sortIndex: sort++ });
      n++;
    }
  }
  elements.push({ levelKey: L, kind: "wall", geometry: { type: "polyline", points: [[6, 6], [114, 6], [114, 74], [6, 74], [6, 6]] }, props: { name: "Level 2 outline", strokeWidth: 0.4, color: "#374151" }, sortIndex: 0 });
  elements.push({ levelKey: L, kind: "text", geometry: { type: "point", point: [48, 12] }, props: { text: "STARTUP ALLEY", fontSize: 3, color: "#6b7280" }, sortIndex: 1 });
  elements.push({ levelKey: L, kind: "room", geometry: { type: "polygon", points: rectPolygon(92, 8, 20, 22) }, props: { name: "Room A", fill: "#dbeafe", opacity: 0.5, blocksRouting: true, height3d: 3 }, sortIndex: 10 });
  elements.push({ levelKey: L, kind: "room", geometry: { type: "polygon", points: rectPolygon(92, 34, 20, 22) }, props: { name: "Room B", fill: "#dbeafe", opacity: 0.5, blocksRouting: true, height3d: 3 }, sortIndex: 10 });
  elements.push({ levelKey: L, kind: "zone", geometry: { type: "polygon", points: rectPolygon(14, 60, 40, 12) }, props: { name: "Coffee Point", fill: "#fde68a", opacity: 0.35, poiType: "cafe", blocksRouting: true }, sortIndex: 10 });
  const poi = (type: PoiType, name: string, p: Point) => elements.push({ levelKey: L, kind: "poi", geometry: { type: "point", point: p }, props: { poiType: type, name }, sortIndex: 20 });
  poi("escalator", "Escalator to Level 1", [10, 8]);
  poi("elevator", "Lift to Level 1", [88, 8]);
  poi("restroom", "Restrooms", [70, 68]);
  poi("quiet_room", "Quiet Room", [110, 66]);
  const lines: GraphLine[] = [];
  for (const y of [10, 27, 41, 55, 66]) lines.push({ points: [[10, y], [88, y]] });
  for (const x of [10, 88]) lines.push({ points: [[x, 10], [x, 66]] });
  lines.push({ points: [[88, 19], [92, 19]] }); // Room A door
  lines.push({ points: [[88, 45], [92, 45]] }); // Room B door
  lines.push({ points: [[10, 10], [10, 8]] }); // escalator arrival
  lines.push({ points: [[88, 10], [88, 8]] }); // lift arrival
  lines.push({ points: [[70, 66], [70, 68]] });
  lines.push({ points: [[88, 66], [110, 66]] });
  return { booths, elements, lines };
}

export interface SeedResult { orgId: string; eventId: string; draftEventId: string; adminEmail: string; adminPassword: string; apiKey: string }

export function isSeeded(d: DB): boolean {
  const r = d.select({ n: count() }).from(schema.organizations).get();
  return (r?.n ?? 0) > 0;
}

/** Seeds the demo event. Ids are deterministic so every instance produces the same database. */
export function seedDemo(d: DB): SeedResult {
  return withDeterministicIds(20260914, () => seedDemoInner(d));
}

function seedDemoInner(d: DB): SeedResult {
  const rng = mulberry32(2026);
  const pick = <T,>(arr: readonly T[]): T => arr[Math.floor(rng() * arr.length)];

  const orgId = newId("org");
  d.insert(schema.organizations).values({ id: orgId, name: DEMO.orgName, slug: DEMO.orgSlug }).run();
  const userId = newId("usr");
  d.insert(schema.users).values({ id: userId, orgId, email: DEMO.adminEmail, name: "Demo Organiser", passwordHash: hashPassword(DEMO.adminPassword), role: "owner" }).run();
  d.insert(schema.apiKeys).values({ id: newId("ak"), orgId, name: "Demo key", prefix: DEMO.apiKey.slice(0, 16), keyHash: sha256(DEMO.apiKey), scopes: ["read", "write"] }).run();

  const settings: EventSettings = {
    ...DEFAULT_SETTINGS,
    languages: ["en", "de", "fr", "es"],
    branding: { ...DEFAULT_SETTINGS.branding, primaryColor: "#5b21b6", accentColor: "#f97316", logoUrl: logoDataUri("Grip Connect", "#5b21b6") },
    registerUrl: "https://grip.events/register",
    websiteUrl: "https://grip.events",
    sales: { ...DEFAULT_SETTINGS.sales, currency: "GBP", mode: "buy", holdMinutes: 30, defaultPricePerM2Cents: 42000, reserveInstructions: "Select an available booth to reserve it. A 30-minute hold is placed while you complete checkout." },
    features: { ...DEFAULT_SETTINGS.features, showPrices: true },
    embed: { allowedOrigins: ["*"] },
    grip: { eventId: "grip-connect-2026", syncExhibitors: true },
  };

  const eventId = newId("ev");
  d.insert(schema.events).values({
    id: eventId, orgId, slug: DEMO.eventSlug, name: "Grip Connect 2026", subtitle: "The networking-first tech expo",
    description: "Two days, two levels, 280 exhibitors and thousands of AI-matched meetings. Find every booth, plan your route and never miss a session.",
    startsAt: "2026-11-17T09:00:00.000Z", endsAt: "2026-11-18T18:00:00.000Z", timezone: "Europe/London",
    venueName: "ExCeL London", venueAddress: "Royal Victoria Dock, 1 Western Gateway, London E16 1XL", venueLat: 51.5083, venueLng: 0.0299,
    status: "published", settings,
  }).run();

  // Levels (georeferenced onto ExCeL London so the basemap overlay works)
  const levelIds: Record<string, string> = { L1: newId("lv"), L2: newId("lv") };
  d.insert(schema.levels).values([
    { id: levelIds.L1, eventId, name: "Level 1 · Exhibition Halls", shortName: "L1", sortIndex: 0, widthM: 200, heightM: 120, georef: { originLat: 51.50915, originLng: 0.02635, rotationDeg: 8, metersPerUnit: 1 }, background: null },
    { id: levelIds.L2, eventId, name: "Level 2 · Startup Alley & Conference", shortName: "L2", sortIndex: 1, widthM: 120, heightM: 80, georef: { originLat: 51.50915, originLng: 0.02635, rotationDeg: 8, metersPerUnit: 1 }, background: null },
  ]).run();

  // Categories
  const catIds = CATEGORIES.map((c, i) => {
    const id = newId("ca");
    d.insert(schema.categories).values({ id, eventId, name: c.name, color: c.color, sortIndex: i }).run();
    return id;
  });

  // Geometry
  const l1 = layoutLevel1();
  const l2 = layoutLevel2();
  const allBooths = [...l1.booths, ...l2.booths];
  const allElements = [...l1.elements, ...l2.elements];

  const elementIds = new Map<string, string>(); // name -> id (for stage/rooms)
  for (const el of allElements) {
    const id = newId("el");
    if (el.props.name) elementIds.set(el.props.name, id);
    d.insert(schema.elements).values({ id, eventId, levelId: levelIds[el.levelKey], kind: el.kind, geometry: el.geometry, props: el.props, sortIndex: el.sortIndex }).run();
  }

  // Wayfinding
  const nodeIdByKey: Record<string, Map<string, string>> = { L1: new Map(), L2: new Map() };
  for (const [lk, lines] of [["L1", l1.lines], ["L2", l2.lines]] as const) {
    const g = polylinesToGraph(lines);
    for (const n of g.nodes) {
      const id = newId("wn");
      nodeIdByKey[lk].set(n.key, id);
      d.insert(schema.wayNodes).values({ id, eventId, levelId: levelIds[lk], x: n.x, y: n.y }).run();
    }
    for (const e of g.edges) {
      d.insert(schema.wayEdges).values({ id: newId("we"), eventId, levelId: levelIds[lk], fromNodeId: nodeIdByKey[lk].get(e.from)!, toNodeId: nodeIdByKey[lk].get(e.to)!, accessible: e.accessible, oneWay: e.oneWay, virtual: e.virtual, weight: e.weight }).run();
    }
  }
  d.insert(schema.transitions).values([
    { id: newId("tr"), eventId, name: "Escalator", kind: "escalator", accessible: false, nodeIds: [nodeIdByKey.L1.get("186,86")!, nodeIdByKey.L2.get("10,8")!], travelSeconds: 45 },
    { id: newId("tr"), eventId, name: "Lift", kind: "elevator", accessible: true, nodeIds: [nodeIdByKey.L1.get("186,9")!, nodeIdByKey.L2.get("88,8")!], travelSeconds: 90 },
  ]).run();

  // Pricing rules
  d.insert(schema.pricingRules).values([
    { id: newId("pr"), eventId, name: "Island sponsor package", boothType: "island", priceCents: 6_500_000, currency: "GBP", sortIndex: 0 },
    { id: newId("pr"), eventId, name: "Sponsor booth", boothType: "sponsor", priceCents: 2_400_000, currency: "GBP", sortIndex: 1 },
    { id: newId("pr"), eventId, name: "Corner booth", boothType: "corner", pricePerM2Cents: 46_500, currency: "GBP", sortIndex: 2 },
    { id: newId("pr"), eventId, name: "Startup table", boothType: "table", priceCents: 120_000, currency: "GBP", sortIndex: 3 },
    { id: newId("pr"), eventId, name: "Standard booth", boothType: "standard", pricePerM2Cents: 42_000, currency: "GBP", sortIndex: 4 },
  ]).run();

  // Exhibitors + booth assignment
  const usedNames = new Set<string>();
  const companyName = () => {
    for (;;) {
      const n = `${pick(ADJ)} ${pick(NOUN)}`;
      if (!usedNames.has(n)) { usedNames.add(n); return n; }
    }
  };
  const boothIds = new Map<string, string>();
  const exhibitorIds: string[] = [];
  const featuredBoothIds: string[] = [];
  let firstPlatinum = "";
  let firstGold = "";

  const insertExhibitor = (opts: { name: string; featured?: boolean; sponsorLevel?: SponsorLevel | null; boothLabel?: string; categories?: string[] }) => {
    const id = newId("ex");
    const color = pick(PALETTE);
    const country = pick(COUNTRIES);
    const city = pick(CITIES[country]);
    const cats = opts.categories ?? [pick(catIds), ...(rng() < 0.35 ? [pick(catIds)] : [])];
    const catName = CATEGORIES[catIds.indexOf(cats[0])].name;
    const desc = pick(BLURBS).replace(/\{name\}/g, opts.name).replace("{year}", String(2005 + Math.floor(rng() * 18))).replace(/\{cat\}/g, catName).replace("{booth}", opts.boothLabel ?? "");
    const slugBase = slugify(opts.name);
    d.insert(schema.exhibitors).values({
      id, eventId, externalId: `crm-${1000 + exhibitorIds.length}`, gripId: rng() < 0.9 ? `grip-co-${5000 + exhibitorIds.length}` : null,
      name: opts.name, slug: slugBase, logoUrl: logoDataUri(opts.name, color), gallery: [],
      description: desc, website: `https://www.${slugBase.replace(/-/g, "")}.com`, email: `hello@${slugBase.replace(/-/g, "")}.com`,
      phone: rng() < 0.5 ? `+44 20 ${7000 + Math.floor(rng() * 999)} ${1000 + Math.floor(rng() * 8999)}` : null,
      country, city, address: `${1 + Math.floor(rng() * 200)} ${pick(["High Street", "Market Square", "Innovation Way", "Harbour Road", "Station Road"])}`, zip: String(10000 + Math.floor(rng() * 89999)),
      featured: !!opts.featured, sponsorLevel: opts.sponsorLevel ?? null,
      customButtonTitle: rng() < 0.6 ? "Book a meeting" : null, customButtonUrl: rng() < 0.6 ? `https://grip.events/meet/${slugBase}` : null,
      videoUrl: rng() < 0.15 ? "https://www.youtube.com/watch?v=dQw4w9WgXcQ" : null,
      socials: rng() < 0.7 ? { linkedin: `https://www.linkedin.com/company/${slugBase}`, x: `https://x.com/${slugBase.slice(0, 15)}` } : {},
      tags: rng() < 0.3 ? ["new-this-year"] : [], contactName: pick(["Alex", "Sam", "Priya", "Jonas", "Maria", "Chen", "Fatima", "Luca"]) + " " + pick(["Walker", "Novak", "Okafor", "Schmidt", "Rossi", "Tanaka", "Haddad", "Silva"]),
      portalToken: secretToken(32),
    }).run();
    for (const c of new Set(cats)) d.insert(schema.exhibitorCategories).values({ exhibitorId: id, categoryId: c }).run();
    exhibitorIds.push(id);
    return id;
  };

  const sponsorNames = ["Nimbus Cloud", "Atlas Payments", "Helix Robotics", "Verdant Energy", "Beacon Security"];
  for (const b of allBooths) {
    const id = newId("bo");
    boothIds.set(b.label, id);
    let status: BoothStatus = "available";
    let exId: string | null = null;
    if (b.type === "island" || b.type === "sponsor") {
      const name = sponsorNames.shift()!;
      usedNames.add(name);
      const level: SponsorLevel = b.type === "island" ? "platinum" : "gold";
      exId = insertExhibitor({ name, featured: true, sponsorLevel: level, boothLabel: b.label });
      if (level === "platinum" && !firstPlatinum) firstPlatinum = exId;
      if (level === "gold" && !firstGold) firstGold = exId;
      status = "sold";
      featuredBoothIds.push(id);
    } else {
      const r = rng();
      if (r < 0.8) { status = "sold"; exId = insertExhibitor({ name: companyName(), featured: rng() < 0.05, boothLabel: b.label }); }
      else if (r < 0.86) { status = "reserved"; if (rng() < 0.5) exId = insertExhibitor({ name: companyName(), boothLabel: b.label }); }
      else if (r < 0.9) status = "held";
      else status = "available";
    }
    const area = round(polygonArea(b.polygon), 2);
    d.insert(schema.booths).values({
      id, eventId, levelId: levelIds[b.levelKey], label: b.label, externalId: `booth-${b.label}`, polygon: b.polygon, boothType: b.type, status,
      areaM2: area, widthM: b.w, heightM: b.h, rotationDeg: 0, sortIndex: b.sortIndex,
      holdUntil: status === "held" ? new Date(Date.now() + 25 * 60e3).toISOString() : null,
      height3d: b.type === "island" ? 5 : b.type === "sponsor" ? 4 : b.type === "table" ? 1.2 : 2.5,
    }).run();
    if (exId) d.insert(schema.boothExhibitors).values({ boothId: id, exhibitorId: exId, sortIndex: 0 }).run();
  }
  // A few co-exhibitors sharing a booth, and one exhibitor with two booths.
  const someSold = [...boothIds.entries()].filter(([l]) => l.startsWith("A1")).slice(0, 3);
  for (const [, bid] of someSold) {
    const ex = insertExhibitor({ name: companyName() });
    d.insert(schema.boothExhibitors).values({ boothId: bid, exhibitorId: ex, sortIndex: 1 }).run();
  }

  // Orders for sold/reserved booths (realistic sales history)
  const boothRows = d.select().from(schema.booths).all().filter((b) => b.eventId === eventId);
  const rulesRows = d.select().from(schema.pricingRules).all().filter((r) => r.eventId === eventId);
  for (const b of boothRows) {
    if (b.status !== "sold" && b.status !== "reserved" && b.status !== "held") continue;
    const price = resolveBoothPrice(b, rulesRows, settings);
    const ex = d.select().from(schema.boothExhibitors).all().find((r) => r.boothId === b.id);
    const daysAgo = Math.floor(rng() * 120);
    const created = new Date(Date.now() - daysAgo * 86400e3).toISOString();
    d.insert(schema.orders).values({
      id: newId("or"), eventId, boothId: b.id, exhibitorId: ex?.exhibitorId ?? null,
      status: b.status === "sold" ? (rng() < 0.7 ? "paid" : "invoiced") : b.status === "reserved" ? "pending_payment" : "hold",
      amountCents: price?.priceCents ?? 0, currency: price?.currency ?? "GBP", provider: rng() < 0.6 ? "stripe" : "invoice",
      providerRef: rng() < 0.6 ? `pi_${secretToken(14)}` : null, expiresAt: b.holdUntil, contactEmail: "sales@example.com", createdAt: created, updatedAt: created,
      paidAt: b.status === "sold" ? created : null,
    }).run();
  }

  // Sessions on the stage and booth demos
  const stageId = elementIds.get("Grip Stage")!;
  const roomA = elementIds.get("Room A")!;
  const roomB = elementIds.get("Room B")!;
  const titles = ["Opening keynote: The networking-first expo", "AI matchmaking in practice", "From floor plan to pipeline: booth analytics", "Scaling payments across borders", "Robots on the show floor", "Sustainable events by design", "Health tech founders panel", "The future of B2B events", "Cybersecurity for exhibitors", "Marketing that actually converts", "Hiring in 2027", "Hardware startups: lessons learned"];
  let sIdx = 0;
  for (const day of ["2026-11-17", "2026-11-18"]) {
    for (let h = 10; h <= 16; h += 1) {
      for (const [loc, track] of [[stageId, "Main Stage"], [roomA, "Workshops"], [roomB, "Startup Pitches"]] as const) {
        if (loc !== stageId && h % 2 === 0) continue;
        const t = titles[sIdx % titles.length];
        sIdx++;
        d.insert(schema.sessions).values({
          id: newId("se"), eventId, externalId: `sess-${sIdx}`, title: t, description: `${t}. A 45-minute session with Q&A.`,
          startsAt: `${day}T${String(h).padStart(2, "0")}:00:00.000Z`, endsAt: `${day}T${String(h).padStart(2, "0")}:45:00.000Z`,
          elementId: loc, track, speakers: [{ name: pick(["Dana Whitfield", "Omar Haddad", "Ingrid Lund", "Kwame Mensah", "Yuki Sato"]), title: pick(["CEO", "CTO", "Head of Events", "Founder"]), company: pick(ADJ) + " " + pick(NOUN) }],
        }).run();
      }
    }
  }
  const demoBooths = [...boothIds.entries()].filter(([l]) => l.startsWith("S")).slice(0, 3);
  demoBooths.forEach(([label, bid], i) => {
    d.insert(schema.sessions).values({ id: newId("se"), eventId, title: `Live demo at booth ${label}`, description: "Product demo and giveaways.", startsAt: `2026-11-17T${11 + i}:30:00.000Z`, endsAt: `2026-11-17T${12 + i}:00:00.000Z`, boothId: bid, track: "Booth demos", speakers: [] }).run();
  });

  // Sponsorship packages and booth extras
  const extraIds = [
    { id: newId("sp"), kind: "sponsorship" as const, name: "Lanyard sponsor", description: "Logo on all attendee lanyards.", priceCents: 1_500_000, limitPerEvent: 1 },
    { id: newId("sp"), kind: "sponsorship" as const, name: "Charging lounge sponsor", description: "Branding on the charging lounge.", priceCents: 800_000, limitPerEvent: 2 },
    { id: newId("sp"), kind: "booth_extra" as const, name: "Extra power (32A)", description: "Three-phase power to the booth.", priceCents: 45_000, limitPerExhibitor: 2 },
    { id: newId("sp"), kind: "booth_extra" as const, name: "Lead scanner licence", description: "One Grip lead-capture licence.", priceCents: 29_000, limitPerExhibitor: 10 },
  ];
  extraIds.forEach((x, i) => d.insert(schema.extras).values({ id: x.id, eventId, kind: x.kind, name: x.name, description: x.description, priceCents: x.priceCents, currency: "GBP", limitPerEvent: x.limitPerEvent ?? null, limitPerExhibitor: x.limitPerExhibitor ?? null, sortIndex: i }).run());
  d.insert(schema.exhibitorExtras).values([
    { id: newId("sp"), extraId: extraIds[0].id, exhibitorId: firstPlatinum, quantity: 1 },
    { id: newId("sp"), extraId: extraIds[3].id, exhibitorId: firstPlatinum, quantity: 4 },
    { id: newId("sp"), extraId: extraIds[2].id, exhibitorId: firstGold, quantity: 1 },
  ]).run();

  // Sponsor banners
  d.insert(schema.banners).values([
    { id: newId("ba"), eventId, exhibitorId: firstPlatinum, placement: "search_top", title: "Platinum sponsor", imageUrl: bannerDataUri("Nimbus Cloud · Platinum Sponsor", "#1d4ed8"), linkUrl: "https://example.com/nimbus", weight: 3 },
    { id: newId("ba"), eventId, exhibitorId: firstGold, placement: "list_inline", title: "Gold sponsor", imageUrl: bannerDataUri("Verdant Energy · Visit booth S4", "#4d7c0f"), linkUrl: "https://example.com/verdant", weight: 2 },
    { id: newId("ba"), eventId, exhibitorId: null, placement: "map_corner", title: "Grip app", imageUrl: bannerDataUri("Plan meetings in the Grip app", "#5b21b6"), linkUrl: "https://grip.events", weight: 1 },
  ]).run();

  // Webhook example (inactive by default so nothing is called out)
  d.insert(schema.webhooks).values({ id: newId("wh"), orgId, eventId, url: "https://example.com/hooks/tessera", secret: secretToken(32), events: ["*"], active: false }).run();

  // Synthetic analytics for the last 14 days
  const exRows = exhibitorIds;
  const boothRowIds = [...boothIds.values()];
  const queries = ["ai", "payments", "robotics", "cloud", "security", "energy", "health", "nimbus", "atlas", "booth a1", "coffee", "startup"];
  const analytics: (typeof schema.analyticsEvents.$inferInsert)[] = [];
  for (let day = 13; day >= 0; day--) {
    const base = 40 + Math.floor(rng() * 60) + (day < 3 ? 120 : 0);
    for (let i = 0; i < base; i++) {
      const ts = new Date(Date.now() - day * 86400e3 - Math.floor(rng() * 86400e3)).toISOString();
      const sid = `s_${Math.floor(rng() * 5000)}`;
      analytics.push({ id: newId("an"), eventId, type: "view", sessionId: sid, createdAt: ts, meta: { device: rng() < 0.65 ? "mobile" : "desktop" } });
      if (rng() < 0.6) analytics.push({ id: newId("an"), eventId, type: "search", sessionId: sid, query: pick(queries), createdAt: ts });
      if (rng() < 0.7) { const ex = pick(exRows); analytics.push({ id: newId("an"), eventId, type: "exhibitor_view", sessionId: sid, targetType: "exhibitor", targetId: ex, createdAt: ts }); }
      if (rng() < 0.5) analytics.push({ id: newId("an"), eventId, type: "booth_click", sessionId: sid, targetType: "booth", targetId: pick(boothRowIds), levelId: levelIds.L1, x: 12 + rng() * 176, y: 12 + rng() * 96, createdAt: ts });
      if (rng() < 0.25) analytics.push({ id: newId("an"), eventId, type: "route", sessionId: sid, targetType: "booth", targetId: pick(boothRowIds), createdAt: ts });
      if (rng() < 0.2) analytics.push({ id: newId("an"), eventId, type: "bookmark", sessionId: sid, targetType: "exhibitor", targetId: pick(exRows), createdAt: ts });
    }
  }
  for (let i = 0; i < analytics.length; i += 500) d.insert(schema.analyticsEvents).values(analytics.slice(i, i + 500)).run();

  // A second, draft event with a small single-level layout so the events list has more than one item.
  const draftEventId = newId("ev");
  d.insert(schema.events).values({
    id: draftEventId, orgId, slug: "grip-connect-berlin-2027", name: "Grip Connect Berlin 2027", subtitle: "Coming soon",
    startsAt: "2027-03-09T09:00:00.000Z", endsAt: "2027-03-10T18:00:00.000Z", timezone: "Europe/Berlin", venueName: "Messe Berlin", venueAddress: "Messedamm 22, 14055 Berlin", venueLat: 52.5019, venueLng: 13.2717,
    status: "draft", settings: { ...DEFAULT_SETTINGS, sales: { ...DEFAULT_SETTINGS.sales, currency: "EUR" } },
  }).run();
  const dl = newId("lv");
  d.insert(schema.levels).values({ id: dl, eventId: draftEventId, name: "Hall 1", shortName: "H1", sortIndex: 0, widthM: 100, heightM: 60, georef: { originLat: 52.5019, originLng: 13.2717, rotationDeg: 0, metersPerUnit: 1 } }).run();
  d.insert(schema.elements).values({ id: newId("el"), eventId: draftEventId, levelId: dl, kind: "wall", geometry: { type: "polyline", points: [[5, 5], [95, 5], [95, 55], [5, 55], [5, 5]] }, props: { name: "Hall 1 outline", strokeWidth: 0.4 }, sortIndex: 0 }).run();
  let k = 0;
  for (const y of [20, 24]) for (let x = 10; x < 90; x += 4) {
    k++;
    d.insert(schema.booths).values({ id: newId("bo"), eventId: draftEventId, levelId: dl, label: `${y === 20 ? "A" : "B"}${String(k).padStart(2, "0")}`, polygon: rectPolygon(x, y, 4, 4), boothType: "standard", status: "available", areaM2: 16, widthM: 4, heightM: 4, sortIndex: k }).run();
  }
  const dg = polylinesToGraph([{ points: [[8, 16], [92, 16]] }, { points: [[8, 30], [92, 30]] }, { points: [[8, 16], [8, 30]] }, { points: [[92, 16], [92, 30]] }]);
  const dn = new Map<string, string>();
  for (const n of dg.nodes) { const id = newId("wn"); dn.set(n.key, id); d.insert(schema.wayNodes).values({ id, eventId: draftEventId, levelId: dl, x: n.x, y: n.y }).run(); }
  for (const e of dg.edges) d.insert(schema.wayEdges).values({ id: newId("we"), eventId: draftEventId, levelId: dl, fromNodeId: dn.get(e.from)!, toNodeId: dn.get(e.to)!, accessible: true, oneWay: false, virtual: false, weight: 1 }).run();

  return { orgId, eventId, draftEventId, adminEmail: DEMO.adminEmail, adminPassword: DEMO.adminPassword, apiKey: DEMO.apiKey };
}

export function bannerDataUri(text: string, color: string): string {
  const svg = `<svg xmlns='http://www.w3.org/2000/svg' width='960' height='160' viewBox='0 0 960 160'><rect width='960' height='160' rx='16' fill='${color}'/><text x='40' y='96' font-family='Inter,Arial,Helvetica,sans-serif' font-size='40' font-weight='700' fill='#ffffff'>${text.replace(/&/g, "&amp;")}</text></svg>`;
  return `data:image/svg+xml;utf8,${encodeURIComponent(svg)}`;
}

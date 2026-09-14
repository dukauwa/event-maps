/** Tiny in-memory bundle for unit tests (two levels, four booths, an escalator + lift, two exhibitors). */
import { DEFAULT_SETTINGS, type PlanBundle } from "@/lib/domain/types";
import { rectPolygon } from "@/lib/domain/geometry";

export function testBundle(): PlanBundle {
  const L1 = "lv_1", L2 = "lv_2";
  const nodes = [
    { id: "n1", levelId: L1, x: 0, y: 20 }, { id: "n2", levelId: L1, x: 50, y: 20 }, { id: "n3", levelId: L1, x: 100, y: 20 },
    { id: "n4", levelId: L1, x: 100, y: 0 }, { id: "n5", levelId: L2, x: 0, y: 0 }, { id: "n6", levelId: L2, x: 50, y: 0 },
    { id: "n7", levelId: L1, x: 0, y: 0 }, { id: "n8", levelId: L2, x: 0, y: 20 },
  ];
  const edges = [
    { id: "e1", from: "n1", to: "n2", accessible: true, oneWay: false, virtual: false, weight: 1 },
    { id: "e2", from: "n2", to: "n3", accessible: true, oneWay: false, virtual: false, weight: 1 },
    { id: "e3", from: "n3", to: "n4", accessible: true, oneWay: false, virtual: false, weight: 1 },
    { id: "e4", from: "n5", to: "n6", accessible: true, oneWay: false, virtual: false, weight: 1 },
    { id: "e5", from: "n1", to: "n7", accessible: true, oneWay: false, virtual: false, weight: 1 },
    { id: "e6", from: "n5", to: "n8", accessible: true, oneWay: false, virtual: false, weight: 1 },
  ];
  return {
    format: "tessera.bundle", formatVersion: 1, version: 3, generatedAt: "2026-01-01T00:00:00.000Z",
    event: { id: "ev_test", slug: "test-event", name: "Test Expo", venue: {}, status: "published", settings: { ...DEFAULT_SETTINGS, languages: ["en", "de"] } },
    levels: [
      { id: L1, name: "Level 1", shortName: "L1", sortIndex: 0, widthM: 120, heightM: 40, background: null, georef: null, elements: [
        { id: "el_entrance", levelId: L1, kind: "entrance", geometry: { type: "point", point: [0, 25] }, props: { name: "Main Entrance", isDefaultStart: true, poiType: "entrance" }, sortIndex: 0 },
        { id: "el_info", levelId: L1, kind: "poi", geometry: { type: "point", point: [50, 25] }, props: { name: "Info Desk", poiType: "info" }, sortIndex: 1 },
      ] },
      { id: L2, name: "Level 2", shortName: "L2", sortIndex: 1, widthM: 60, heightM: 30, background: null, georef: null, elements: [] },
    ],
    booths: [
      { id: "bo_a1", levelId: L1, label: "A1", externalId: "ext-a1", polygon: rectPolygon(10, 10, 8, 8), center: [14, 14], boothType: "standard", status: "sold", areaM2: 64, rotationDeg: 0, colors: null, labelHidden: false, exhibitorIds: ["ex_acme"], metadata: {} },
      { id: "bo_a2", levelId: L1, label: "A2", externalId: null, polygon: rectPolygon(30, 10, 8, 8), center: [34, 14], boothType: "standard", status: "available", priceCents: 10000, currency: "USD", areaM2: 64, rotationDeg: 0, colors: null, labelHidden: false, exhibitorIds: [], metadata: {} },
      { id: "bo_b1", levelId: L1, label: "B1", externalId: null, polygon: rectPolygon(70, 10, 8, 8), center: [74, 14], boothType: "corner", status: "sold", areaM2: 64, rotationDeg: 0, colors: null, labelHidden: false, exhibitorIds: ["ex_beta", "ex_gamma"], metadata: {} },
      { id: "bo_t1", levelId: L2, label: "T1", externalId: null, polygon: rectPolygon(20, 5, 4, 4), center: [22, 7], boothType: "table", status: "sold", areaM2: 16, rotationDeg: 0, colors: null, labelHidden: false, exhibitorIds: ["ex_delta"], metadata: {} },
    ],
    exhibitors: [
      { id: "ex_acme", externalId: "crm-1", name: "Acme Robotics", slug: "acme-robotics", gallery: [], featured: true, sponsorLevel: "gold", logoInBooth: false, socials: {}, tags: [], metadata: {}, extraIds: [], categoryIds: ["ca_ai"], boothIds: ["bo_a1"], boothLabels: ["A1"], customButtonTitle: "Book", customButtonUrl: "https://example.com/acme" },
      { id: "ex_beta", externalId: null, name: "Beta Cloud", slug: "beta-cloud", gallery: [], featured: false, sponsorLevel: null, logoInBooth: false, socials: {}, tags: [], metadata: {}, extraIds: [], categoryIds: ["ca_cloud"], boothIds: ["bo_b1"], boothLabels: ["B1"] },
      { id: "ex_gamma", externalId: null, name: "Gamma Labs", slug: "gamma-labs", gallery: [], featured: false, sponsorLevel: null, logoInBooth: false, socials: {}, tags: [], metadata: {}, extraIds: [], categoryIds: ["ca_ai", "ca_cloud"], boothIds: ["bo_b1"], boothLabels: ["B1"] },
      { id: "ex_delta", externalId: null, name: "Delta Startup", slug: "delta-startup", gallery: [], featured: false, sponsorLevel: null, logoInBooth: false, socials: {}, tags: [], metadata: {}, extraIds: [], categoryIds: [], boothIds: ["bo_t1"], boothLabels: ["T1"] },
    ],
    categories: [{ id: "ca_ai", name: "AI & Data", color: "#7c3aed", sortIndex: 0 }, { id: "ca_cloud", name: "Cloud", color: "#1d4ed8", sortIndex: 1 }],
    sessions: [{ id: "se_1", externalId: "sess-1", title: "Opening keynote", startsAt: "2026-11-17T10:00:00.000Z", endsAt: "2026-11-17T10:45:00.000Z", boothId: "bo_a1", speakers: [], track: "Main" }],
    wayfinding: { nodes, edges, transitions: [
      { id: "tr_esc", name: "Escalator", kind: "escalator", accessible: false, nodeIds: ["n7", "n5"], travelSeconds: 30 },
      { id: "tr_lift", name: "Lift", kind: "elevator", accessible: true, nodeIds: ["n4", "n6"], travelSeconds: 60 },
    ] },
    banners: [], extras: [],
  };
}

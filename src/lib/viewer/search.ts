/**
 * Client-side search index over the bundle: exhibitors, booths, categories, sessions and POIs.
 * Ranked by match quality (exact > prefix > word prefix > substring > fuzzy token overlap) with boosts for featured/sponsors.
 */
import type { BundleBooth, BundleCategory, BundleElement, BundleExhibitor, BundleSession, PlanBundle } from "@/lib/domain/types";

export type SearchResultType = "exhibitor" | "booth" | "category" | "session" | "poi";

export interface SearchResult {
  type: SearchResultType;
  id: string;
  title: string;
  subtitle?: string;
  levelId?: string;
  score: number;
  /** Booth ids this result maps to on the map (for zooming / highlighting). */
  boothIds: string[];
}

interface Doc {
  type: SearchResultType;
  id: string;
  title: string;
  subtitle?: string;
  levelId?: string;
  boothIds: string[];
  /** Primary searchable text (normalised). */
  primary: string;
  /** Secondary text: tags, categories, labels, description (normalised). */
  secondary: string;
  tokens: string[];
  boost: number;
}

export interface SearchIndex {
  docs: Doc[];
  search: (query: string, opts?: SearchOptions) => SearchResult[];
}

export interface SearchOptions {
  limit?: number;
  types?: SearchResultType[];
  /** Restrict to exhibitors within these categories (any). */
  categoryIds?: string[];
  levelId?: string;
}

export function normalizeText(s: string): string {
  return s
    .toLowerCase()
    .normalize("NFKD")
    .replace(/[̀-ͯ]/g, "")
    .replace(/[^\p{L}\p{N}\s]+/gu, " ")
    .replace(/\s+/g, " ")
    .trim();
}

export function tokenize(s: string): string[] {
  return normalizeText(s).split(" ").filter(Boolean);
}

const SPONSOR_BOOST: Record<string, number> = { platinum: 12, gold: 10, silver: 8, bronze: 6, partner: 4 };

export function buildSearchIndex(bundle: PlanBundle): SearchIndex {
  const catName = new Map(bundle.categories.map((c) => [c.id, c.name]));
  const boothById = new Map(bundle.booths.map((b) => [b.id, b]));
  const levelName = new Map(bundle.levels.map((l) => [l.id, l.shortName]));
  const docs: Doc[] = [];

  for (const ex of bundle.exhibitors) {
    const cats = ex.categoryIds.map((id) => catName.get(id) ?? "").filter(Boolean);
    const firstBooth = ex.boothIds.map((id) => boothById.get(id)).find(Boolean);
    const secondary = [...ex.boothLabels, ...cats, ...ex.tags, ex.externalId ?? "", ex.slug, ex.city ?? "", ex.country ?? "", (ex.description ?? "").slice(0, 400)].join(" ");
    docs.push({
      type: "exhibitor",
      id: ex.id,
      title: ex.name,
      subtitle: ex.boothLabels.length ? ex.boothLabels.join(", ") : undefined,
      levelId: firstBooth?.levelId,
      boothIds: ex.boothIds,
      primary: normalizeText(ex.name),
      secondary: normalizeText(secondary),
      tokens: tokenize(`${ex.name} ${secondary}`),
      boost: (ex.featured ? 5 : 0) + (ex.sponsorLevel ? SPONSOR_BOOST[ex.sponsorLevel] ?? 0 : 0),
    });
  }
  for (const b of bundle.booths) {
    const exNames = b.exhibitorIds.map((id) => bundle.exhibitors.find((e) => e.id === id)?.name ?? "").filter(Boolean);
    docs.push({
      type: "booth",
      id: b.id,
      title: b.label,
      subtitle: exNames.join(", ") || undefined,
      levelId: b.levelId,
      boothIds: [b.id],
      primary: normalizeText(b.label),
      secondary: normalizeText([b.externalId ?? "", levelName.get(b.levelId) ?? "", ...exNames].join(" ")),
      tokens: tokenize(`${b.label} ${b.externalId ?? ""}`),
      boost: 0,
    });
  }
  for (const c of bundle.categories) {
    const n = bundle.exhibitors.filter((e) => e.categoryIds.includes(c.id)).length;
    docs.push({ type: "category", id: c.id, title: c.name, subtitle: undefined, boothIds: [], primary: normalizeText(c.name), secondary: "", tokens: tokenize(c.name), boost: n > 0 ? 1 : -5 });
  }
  for (const s of bundle.sessions) {
    const booth = s.boothId ? boothById.get(s.boothId) : undefined;
    const el = s.elementId ? findElement(bundle, s.elementId) : undefined;
    const where = booth?.label ?? (typeof el?.props.name === "string" ? el.props.name : "");
    const speakers = s.speakers.map((sp) => `${sp.name} ${sp.company ?? ""}`).join(" ");
    docs.push({
      type: "session",
      id: s.id,
      title: s.title,
      subtitle: where || s.track || undefined,
      levelId: booth?.levelId ?? el?.levelId,
      boothIds: booth ? [booth.id] : [],
      primary: normalizeText(s.title),
      secondary: normalizeText(`${speakers} ${s.track ?? ""} ${where}`),
      tokens: tokenize(`${s.title} ${speakers} ${s.track ?? ""}`),
      boost: 0,
    });
  }
  for (const level of bundle.levels) {
    for (const el of level.elements) {
      if (el.kind !== "poi" && el.kind !== "entrance" && el.kind !== "zone" && el.kind !== "room" && el.kind !== "stage") continue;
      const name = typeof el.props.name === "string" ? el.props.name : "";
      if (!name) continue;
      const poiType = typeof el.props.poiType === "string" ? el.props.poiType.replace(/_/g, " ") : el.kind;
      docs.push({
        type: "poi",
        id: el.id,
        title: name,
        subtitle: poiType,
        levelId: level.id,
        boothIds: [],
        primary: normalizeText(name),
        secondary: normalizeText(poiType),
        tokens: tokenize(`${name} ${poiType}`),
        boost: -1,
      });
    }
  }

  const exCats = new Map(bundle.exhibitors.map((e) => [e.id, e.categoryIds]));

  function search(query: string, opts: SearchOptions = {}): SearchResult[] {
    const q = normalizeText(query);
    if (!q) return [];
    const qTokens = q.split(" ").filter(Boolean);
    const limit = opts.limit ?? 50;
    const out: SearchResult[] = [];
    for (const d of docs) {
      if (opts.types && !opts.types.includes(d.type)) continue;
      if (opts.levelId && d.levelId && d.levelId !== opts.levelId) continue;
      if (opts.categoryIds?.length && d.type === "exhibitor") {
        const cats = exCats.get(d.id) ?? [];
        if (!opts.categoryIds.some((c) => cats.includes(c))) continue;
      }
      const score = scoreDoc(d, q, qTokens);
      if (score <= 0) continue;
      out.push({ type: d.type, id: d.id, title: d.title, subtitle: d.subtitle, levelId: d.levelId, score: score + d.boost, boothIds: d.boothIds });
    }
    out.sort((a, b) => b.score - a.score || a.title.localeCompare(b.title));
    return out.slice(0, limit);
  }

  return { docs, search };
}

function findElement(bundle: PlanBundle, id: string): BundleElement | undefined {
  for (const l of bundle.levels) {
    const el = l.elements.find((e) => e.id === id);
    if (el) return el;
  }
  return undefined;
}

function scoreDoc(d: Doc, q: string, qTokens: string[]): number {
  if (d.primary === q) return 100;
  if (d.primary.startsWith(q)) return 80 - Math.min(20, d.primary.length - q.length) * 0.5;
  const wordPrefix = d.primary.split(" ").some((w) => w.startsWith(q));
  if (wordPrefix) return 60;
  if (d.primary.includes(q)) return 45;
  if (d.secondary === q) return 42;
  if (d.secondary.split(" ").some((w) => w.startsWith(q))) return 35;
  if (d.secondary.includes(q)) return 25;
  // Multi-token: all query tokens must prefix-match some token of the doc.
  if (qTokens.length > 1) {
    const all = qTokens.every((qt) => d.tokens.some((t) => t.startsWith(qt)));
    if (all) return 30;
  }
  // Fuzzy: single token with one edit (typo tolerance) against title words.
  if (q.length >= 4 && !q.includes(" ")) {
    for (const w of d.primary.split(" ")) {
      if (Math.abs(w.length - q.length) <= 1 && editDistanceLte1(w, q)) return 15;
    }
  }
  return 0;
}

function editDistanceLte1(a: string, b: string): boolean {
  if (a === b) return true;
  if (Math.abs(a.length - b.length) > 1) return false;
  let i = 0, j = 0, edits = 0;
  while (i < a.length && j < b.length) {
    if (a[i] === b[j]) { i++; j++; continue; }
    if (++edits > 1) return false;
    if (a.length > b.length) i++;
    else if (a.length < b.length) j++;
    else { i++; j++; }
  }
  return edits + (a.length - i) + (b.length - j) <= 1;
}

/* ---------------- Lookups shared by the controller ---------------- */

export function findBooth(bundle: PlanBundle, key: string): BundleBooth | undefined {
  const k = key.trim().toLowerCase();
  return bundle.booths.find((b) => b.id === key) ?? bundle.booths.find((b) => b.label.toLowerCase() === k) ?? bundle.booths.find((b) => (b.externalId ?? "").toLowerCase() === k);
}

export function findExhibitor(bundle: PlanBundle, key: string): BundleExhibitor | undefined {
  const k = key.trim().toLowerCase();
  return (
    bundle.exhibitors.find((e) => e.id === key) ??
    bundle.exhibitors.find((e) => e.slug.toLowerCase() === k) ??
    bundle.exhibitors.find((e) => (e.externalId ?? "").toLowerCase() === k) ??
    bundle.exhibitors.find((e) => e.name.toLowerCase() === k)
  );
}

export function findCategory(bundle: PlanBundle, key: string): BundleCategory | undefined {
  const k = key.trim().toLowerCase();
  return bundle.categories.find((c) => c.id === key) ?? bundle.categories.find((c) => c.name.toLowerCase() === k);
}

export function findSession(bundle: PlanBundle, key: string): BundleSession | undefined {
  const k = key.trim().toLowerCase();
  return bundle.sessions.find((s) => s.id === key) ?? bundle.sessions.find((s) => (s.externalId ?? "").toLowerCase() === k) ?? bundle.sessions.find((s) => s.title.toLowerCase() === k);
}

export function findLevel(bundle: PlanBundle, key: string | number): PlanBundle["levels"][number] | undefined {
  if (typeof key === "number") return bundle.levels[key];
  const k = key.trim().toLowerCase();
  return bundle.levels.find((l) => l.id === key) ?? bundle.levels.find((l) => l.shortName.toLowerCase() === k) ?? bundle.levels.find((l) => l.name.toLowerCase() === k) ?? (/^\d+$/.test(k) ? bundle.levels[Number(k)] : undefined);
}

export function findElementById(bundle: PlanBundle, id: string): BundleElement | undefined {
  return findElement(bundle, id);
}

/** The element to start routes from: the `entrance` flagged `isDefaultStart`, else the first entrance, else null. */
export function defaultStartElement(bundle: PlanBundle): BundleElement | null {
  const entrances = bundle.levels.flatMap((l) => l.elements.filter((e) => e.kind === "entrance" || (e.kind === "poi" && e.props.poiType === "entrance")));
  return entrances.find((e) => e.props.isDefaultStart) ?? entrances[0] ?? null;
}

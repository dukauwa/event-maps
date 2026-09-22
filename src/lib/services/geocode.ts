/**
 * Venue search for the event wizard. Backed by OpenStreetMap's Nominatim (no key, generous for interactive use);
 * swap `GEOCODER_URL` for a self-hosted Nominatim or Photon instance at scale.
 */
export interface GeocodeHit { name: string; address: string; lat: number; lng: number; kind: string }

const GEOCODER_URL = process.env.GEOCODER_URL || "https://nominatim.openstreetmap.org/search";

interface NominatimRow { display_name: string; name?: string; lat: string; lon: string; type?: string; category?: string; class?: string }

export async function geocode(query: string, limit = 6): Promise<GeocodeHit[]> {
  const q = query.trim();
  if (q.length < 2) return [];
  const url = new URL(GEOCODER_URL);
  url.searchParams.set("format", "jsonv2");
  url.searchParams.set("limit", String(limit));
  url.searchParams.set("q", q);
  const ctrl = new AbortController();
  const timer = setTimeout(() => ctrl.abort(), 6000);
  try {
    const res = await fetch(url, { headers: { "User-Agent": "Tessera floor plans (event wizard)", Accept: "application/json" }, signal: ctrl.signal });
    if (!res.ok) return [];
    const rows = (await res.json()) as NominatimRow[];
    return rows.map((r) => ({
      name: r.name || r.display_name.split(",")[0].trim(),
      address: r.display_name,
      lat: Number(r.lat),
      lng: Number(r.lon),
      kind: r.type || r.category || r.class || "place",
    })).filter((h) => Number.isFinite(h.lat) && Number.isFinite(h.lng));
  } catch {
    return [];
  } finally {
    clearTimeout(timer);
  }
}

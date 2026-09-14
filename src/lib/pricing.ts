import type { EventSettings } from "@/lib/domain/types";

export interface PriceableBooth { priceCents?: number | null; currency?: string | null; boothType: string; areaM2: number }
export interface PriceRule { boothType?: string | null; minAreaM2?: number | null; maxAreaM2?: number | null; priceCents?: number | null; pricePerM2Cents?: number | null; currency: string; sortIndex?: number }

/** Resolve a booth's price: explicit override → first matching pricing rule → default per-m² price. */
export function resolveBoothPrice(booth: PriceableBooth, rules: PriceRule[], settings: EventSettings): { priceCents: number; currency: string } | null {
  if (booth.priceCents != null) return { priceCents: booth.priceCents, currency: booth.currency || settings.sales.currency };
  const sorted = [...rules].sort((a, b) => (a.sortIndex ?? 0) - (b.sortIndex ?? 0));
  for (const r of sorted) {
    if (r.boothType && r.boothType !== booth.boothType) continue;
    if (r.minAreaM2 != null && booth.areaM2 < r.minAreaM2) continue;
    if (r.maxAreaM2 != null && booth.areaM2 > r.maxAreaM2) continue;
    if (r.priceCents != null) return { priceCents: r.priceCents, currency: r.currency };
    if (r.pricePerM2Cents != null) return { priceCents: Math.round(r.pricePerM2Cents * booth.areaM2), currency: r.currency };
  }
  if (!settings.sales.enabled) return null;
  if (!settings.sales.defaultPricePerM2Cents) return null;
  return { priceCents: Math.round(settings.sales.defaultPricePerM2Cents * booth.areaM2), currency: settings.sales.currency };
}

export function formatMoney(cents: number, currency: string, locale = "en"): string {
  try {
    return new Intl.NumberFormat(locale, { style: "currency", currency, maximumFractionDigits: 0 }).format(cents / 100);
  } catch {
    return `${(cents / 100).toFixed(0)} ${currency}`;
  }
}

export function fmtDate(iso: string | null | undefined, tz?: string | null, opts: Intl.DateTimeFormatOptions = { dateStyle: "medium" }) {
  if (!iso) return "";
  try { return new Intl.DateTimeFormat("en", { ...opts, timeZone: tz ?? undefined }).format(new Date(iso)); } catch { return iso; }
}
export function fmtDateTime(iso: string | null | undefined, tz?: string | null) {
  return fmtDate(iso, tz, { dateStyle: "medium", timeStyle: "short" });
}
/** Completeness score for an exhibitor profile (0..100) with hints. */
export function profileCompleteness(e: { logoUrl?: string | null; description?: string | null; website?: string | null; email?: string | null; phone?: string | null; categoryIds: string[]; gallery: string[]; socials: Record<string, string>; country?: string | null; boothIds: string[] }) {
  const checks: [string, boolean][] = [
    ["Add a logo", !!e.logoUrl],
    ["Write a description (60+ characters)", (e.description?.length ?? 0) >= 60],
    ["Add your website", !!e.website],
    ["Add a contact email", !!e.email],
    ["Pick at least one category", e.categoryIds.length > 0],
    ["Add gallery images", e.gallery.length > 0],
    ["Link a social profile", Object.keys(e.socials ?? {}).length > 0],
    ["Set your country", !!e.country],
    ["Reserve a booth", e.boothIds.length > 0],
  ];
  const done = checks.filter(([, ok]) => ok).length;
  return { score: Math.round((done / checks.length) * 100), hints: checks.filter(([, ok]) => !ok).map(([h]) => h) };
}

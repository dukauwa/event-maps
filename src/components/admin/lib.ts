/** Client-safe helpers shared by the organiser portal (no server imports here). */

export const eventApi = (eventId: string) => `/api/v1/events/${eventId}`;

const DATE_LOCALE = "en-GB";

export function fmtDate(iso: string | null | undefined, tz?: string | null, opts: Intl.DateTimeFormatOptions = { dateStyle: "medium" }): string {
  if (!iso) return "—";
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return iso;
  try {
    return new Intl.DateTimeFormat(DATE_LOCALE, { ...opts, timeZone: tz || undefined }).format(d);
  } catch {
    return new Intl.DateTimeFormat(DATE_LOCALE, opts).format(d);
  }
}

export function fmtDateTime(iso: string | null | undefined, tz?: string | null): string {
  return fmtDate(iso, tz, { dateStyle: "medium", timeStyle: "short" });
}

export function fmtTime(iso: string | null | undefined, tz?: string | null): string {
  return fmtDate(iso, tz, { timeStyle: "short" });
}

export function fmtDateRange(from: string | null | undefined, to: string | null | undefined, tz?: string | null): string {
  if (!from && !to) return "Dates not set";
  if (from && to) {
    const a = fmtDate(from, tz), b = fmtDate(to, tz);
    return a === b ? a : `${a} – ${b}`;
  }
  return fmtDate(from ?? to, tz);
}

/** Minutes to add to UTC to get wall time in `tz` at `date`. */
function tzOffsetMinutes(date: Date, tz: string): number {
  try {
    const parts = new Intl.DateTimeFormat("en-US", { timeZone: tz, hourCycle: "h23", year: "numeric", month: "2-digit", day: "2-digit", hour: "2-digit", minute: "2-digit", second: "2-digit" }).formatToParts(date);
    const get = (t: string) => Number(parts.find((p) => p.type === t)?.value ?? 0);
    const asUtc = Date.UTC(get("year"), get("month") - 1, get("day"), get("hour"), get("minute"), get("second"));
    return Math.round((asUtc - date.getTime()) / 60000);
  } catch {
    return 0;
  }
}

/** ISO instant → value for `<input type="datetime-local">` expressed in the event timezone. */
export function isoToLocalInput(iso: string | null | undefined, tz?: string | null): string {
  if (!iso) return "";
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return "";
  const off = tz ? tzOffsetMinutes(d, tz) : -d.getTimezoneOffset();
  return new Date(d.getTime() + off * 60000).toISOString().slice(0, 16);
}

/** `<input type="datetime-local">` value (event timezone wall time) → ISO instant. */
export function localInputToIso(local: string, tz?: string | null): string | null {
  if (!local) return null;
  const guess = new Date(`${local}:00Z`);
  if (Number.isNaN(guess.getTime())) return null;
  if (!tz) return new Date(local).toISOString();
  const off = tzOffsetMinutes(guess, tz);
  return new Date(guess.getTime() - off * 60000).toISOString();
}

export function dateInputValue(iso: string | null | undefined): string {
  return iso ? iso.slice(0, 10) : "";
}

export function downloadText(filename: string, text: string, mime = "text/csv;charset=utf-8"): void {
  const blob = new Blob([text], { type: mime });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = filename;
  document.body.appendChild(a);
  a.click();
  a.remove();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
}

export async function copyText(text: string): Promise<boolean> {
  try {
    await navigator.clipboard.writeText(text);
    return true;
  } catch {
    try {
      const ta = document.createElement("textarea");
      ta.value = text;
      ta.style.position = "fixed";
      ta.style.opacity = "0";
      document.body.appendChild(ta);
      ta.select();
      document.execCommand("copy");
      ta.remove();
      return true;
    } catch {
      return false;
    }
  }
}

export function toCsv(rows: Record<string, unknown>[], columns?: string[]): string {
  if (!rows.length) return (columns ?? []).join(",") + "\n";
  const cols = columns ?? [...new Set(rows.flatMap((r) => Object.keys(r)))];
  const esc = (v: unknown) => {
    const s = v == null ? "" : typeof v === "object" ? JSON.stringify(v) : String(v);
    return /[",\n\r]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
  };
  return [cols.join(","), ...rows.map((r) => cols.map((c) => esc(r[c])).join(","))].join("\n") + "\n";
}

export function slugify(s: string): string {
  return s.toLowerCase().normalize("NFKD").replace(/[̀-ͯ]/g, "").replace(/[^a-z0-9]+/g, "-").replace(/^-+|-+$/g, "").slice(0, 80);
}

export function centsToInput(cents: number | null | undefined): string {
  return cents == null ? "" : (cents / 100).toFixed(2).replace(/\.00$/, "");
}

export function inputToCents(v: string): number | null {
  const t = v.trim();
  if (!t) return null;
  const n = Number(t.replace(/[^0-9.\-]/g, ""));
  return Number.isNaN(n) ? null : Math.round(n * 100);
}

export function nz(v: string): string | null {
  const t = v.trim();
  return t ? t : null;
}

export function pct(part: number, total: number): string {
  return total ? `${Math.round((part / total) * 100)}%` : "0%";
}

export function timezoneOptions(): string[] {
  try {
    const anyIntl = Intl as unknown as { supportedValuesOf?: (k: string) => string[] };
    const list = anyIntl.supportedValuesOf?.("timeZone");
    if (list?.length) return list;
  } catch { /* fall through */ }
  return ["UTC", "Europe/London", "Europe/Berlin", "Europe/Paris", "Europe/Madrid", "Europe/Amsterdam", "America/New_York", "America/Chicago", "America/Los_Angeles", "Asia/Dubai", "Asia/Singapore", "Asia/Tokyo", "Australia/Sydney"];
}

export const CURRENCIES = ["USD", "EUR", "GBP", "CHF", "SEK", "NOK", "DKK", "PLN", "CZK", "AUD", "CAD", "SGD", "JPY", "AED", "INR", "BRL", "MXN", "ZAR"];

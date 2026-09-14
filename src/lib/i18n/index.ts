/**
 * Tiny i18n for the public viewer: static dictionaries, `{placeholder}` interpolation, English fallback.
 * Booth/exhibitor/level words come from `settings.terms` and are passed in as interpolation values.
 */
import { SUPPORTED_LOCALES, type EventTerms, type Locale } from "@/lib/domain/types";
import { en, type I18nKey } from "./en";
import { de } from "./de";
import { fr } from "./fr";
import { es } from "./es";
import { pt } from "./pt";
import { it } from "./it";
import { nl } from "./nl";
import { ja } from "./ja";
import { zh } from "./zh";
import { ar } from "./ar";

export type { I18nKey };

export const DICTIONARIES: Record<Locale, Partial<Record<I18nKey, string>>> = { en, de, fr, es, pt, it, nl, ja, zh, ar };

export const LOCALE_NAMES: Record<Locale, string> = {
  en: "English", de: "Deutsch", fr: "Français", es: "Español", pt: "Português", it: "Italiano", nl: "Nederlands", ja: "日本語", zh: "中文", ar: "العربية",
};

export const RTL_LOCALES: readonly Locale[] = ["ar"];

export type TranslateVars = Record<string, string | number>;

export function isLocale(v: unknown): v is Locale {
  return typeof v === "string" && (SUPPORTED_LOCALES as readonly string[]).includes(v);
}

/** Normalise "de-AT" → "de", "zh-Hans" → "zh"; null when unsupported. */
export function normalizeLocale(tag: string | null | undefined): Locale | null {
  if (!tag) return null;
  const base = tag.toLowerCase().split(/[-_]/)[0];
  return isLocale(base) ? base : null;
}

export function isRtl(locale: Locale): boolean {
  return RTL_LOCALES.includes(locale);
}

export function interpolate(template: string, vars?: TranslateVars): string {
  if (!vars) return template;
  return template.replace(/\{(\w+)\}/g, (m, k: string) => (k in vars ? String(vars[k]) : m));
}

/** Translate `key` in `locale`, falling back to English, then the key itself. */
export function t(locale: Locale, key: I18nKey, vars?: TranslateVars): string {
  const dict = DICTIONARIES[locale] ?? en;
  const template = dict[key] ?? en[key] ?? key;
  return interpolate(template, vars);
}

/**
 * Resolve the UI locale: explicit request (`?lang`), then the event's configured languages / default locale,
 * then the browser's preferred languages (only if the event allows them), else the event default.
 */
export function resolveLocale(opts: {
  requested?: string | null;
  eventLocale: Locale;
  eventLanguages: Locale[];
  browserLanguages?: readonly string[];
}): Locale {
  const allowed = opts.eventLanguages.length ? opts.eventLanguages : [opts.eventLocale];
  const req = normalizeLocale(opts.requested);
  if (req && (allowed.includes(req) || isLocale(req))) return req;
  for (const tag of opts.browserLanguages ?? []) {
    const l = normalizeLocale(tag);
    if (l && allowed.includes(l)) return l;
  }
  return allowed.includes(opts.eventLocale) ? opts.eventLocale : allowed[0];
}

/** Bound translator with the event's terms pre-filled (`{booth}`, `{exhibitors}`, `{level}` …). */
export function makeTranslator(locale: Locale, terms: EventTerms) {
  const base: TranslateVars = {
    booth: terms.booth, booths: terms.booths, exhibitor: terms.exhibitor, exhibitors: terms.exhibitors, level: terms.level, levels: terms.levels,
  };
  return (key: I18nKey, vars?: TranslateVars) => t(locale, key, vars ? { ...base, ...vars } : base);
}
export type Translator = ReturnType<typeof makeTranslator>;

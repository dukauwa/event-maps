import { describe, expect, it } from "vitest";
import { SUPPORTED_LOCALES, DEFAULT_SETTINGS } from "@/lib/domain/types";
import { DICTIONARIES, isRtl, makeTranslator, normalizeLocale, resolveLocale, t } from "./index";
import { en } from "./en";

describe("i18n", () => {
  it("every supported locale has a dictionary covering the English keys", () => {
    for (const l of SUPPORTED_LOCALES) {
      const dict = DICTIONARIES[l];
      expect(dict, l).toBeTruthy();
      const missing = (Object.keys(en) as (keyof typeof en)[]).filter((k) => !dict[k]);
      expect(missing, `${l} missing`).toEqual([]);
    }
  });

  it("falls back to English for unknown locale or missing key", () => {
    // Force a partial dictionary lookup through the public API.
    expect(t("de", "search")).toBe("Suchen");
    expect(t("xx" as never, "search")).toBe("Search");
    expect(t("fr", "not_a_key" as never)).toBe("not_a_key");
  });

  it("interpolates placeholders and leaves unknown ones untouched", () => {
    expect(t("en", "minutes", { n: 5 })).toBe("5 min");
    expect(t("en", "takeTo", { kind: "lift", level: "Level 2" })).toBe("Take the lift to Level 2");
    expect(t("en", "takeTo", { kind: "lift" })).toBe("Take the lift to {level}");
  });

  it("uses event terms via makeTranslator", () => {
    const tr = makeTranslator("en", { ...DEFAULT_SETTINGS.terms, booth: "Stand", exhibitors: "Brands" });
    expect(tr("sessionsAtBooth")).toBe("Sessions at this Stand");
    expect(tr("exhibitorsCount", { n: 3 })).toBe("3 Brands");
  });

  it("resolves locale preference order", () => {
    const base = { eventLocale: "en" as const, eventLanguages: ["en", "de", "fr"] as const };
    expect(resolveLocale({ ...base, eventLanguages: [...base.eventLanguages], requested: "de" })).toBe("de");
    expect(resolveLocale({ ...base, eventLanguages: [...base.eventLanguages], requested: "ja" })).toBe("ja");
    expect(resolveLocale({ ...base, eventLanguages: [...base.eventLanguages], requested: "xx", browserLanguages: ["fr-FR", "en"] })).toBe("fr");
    expect(resolveLocale({ ...base, eventLanguages: [...base.eventLanguages], browserLanguages: ["it-IT"] })).toBe("en");
    expect(resolveLocale({ eventLocale: "de", eventLanguages: [], browserLanguages: ["pt"] })).toBe("de");
  });

  it("normalises tags and knows RTL", () => {
    expect(normalizeLocale("zh-Hans-CN")).toBe("zh");
    expect(normalizeLocale("klingon")).toBeNull();
    expect(isRtl("ar")).toBe(true);
    expect(isRtl("en")).toBe(false);
  });
});

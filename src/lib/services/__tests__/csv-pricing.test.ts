import { describe, expect, it } from "vitest";
import { detectDelimiter, parseCsv, toCsv } from "@/lib/services/csv";
import { resolveBoothPrice, formatMoney } from "@/lib/pricing";
import { DEFAULT_SETTINGS } from "@/lib/domain/types";
import { intId, toExpoFpData } from "@/lib/export/expofp";

describe("csv", () => {
  it("parses quotes, delimiters and BOM", () => {
    expect(detectDelimiter("a;b;c\n1;2;3")).toBe(";");
    expect(detectDelimiter("a\tb\n1\t2")).toBe("\t");
    const rows = parseCsv('﻿Name,Booth(s),Note\n"Acme, Inc","A1; A2","He said ""hi"""\n');
    expect(rows).toEqual([{ name: "Acme, Inc", booth_s: "A1; A2", note: 'He said "hi"' }]);
    const semi = parseCsv("Name;Booth\nAcme;A1\n");
    expect(semi[0]).toEqual({ name: "Acme", booth: "A1" });
  });
  it("serialises with escaping", () => {
    const out = toCsv([{ a: 'x,"y"', b: ["1", "2"], c: null }]);
    expect(out).toBe('a,b,c\n"x,""y""",1; 2,\n');
  });
});

describe("pricing", () => {
  const s = { ...DEFAULT_SETTINGS, sales: { ...DEFAULT_SETTINGS.sales, defaultPricePerM2Cents: 10000, currency: "EUR" } };
  it("prefers overrides, then rules, then defaults", () => {
    expect(resolveBoothPrice({ priceCents: 5, boothType: "standard", areaM2: 9 }, [], s)).toEqual({ priceCents: 5, currency: "EUR" });
    const rules = [{ boothType: "island", priceCents: 100, currency: "EUR", sortIndex: 0 }, { boothType: null, minAreaM2: 0, maxAreaM2: 10, pricePerM2Cents: 500, currency: "GBP", sortIndex: 1 }];
    expect(resolveBoothPrice({ boothType: "island", areaM2: 50 }, rules, s)).toEqual({ priceCents: 100, currency: "EUR" });
    expect(resolveBoothPrice({ boothType: "standard", areaM2: 9 }, rules, s)).toEqual({ priceCents: 4500, currency: "GBP" });
    expect(resolveBoothPrice({ boothType: "standard", areaM2: 16 }, rules, s)).toEqual({ priceCents: 160000, currency: "EUR" });
    expect(formatMoney(160000, "EUR")).toMatch(/1,600|1\.600/);
  });
});

describe("expofp export", () => {
  it("has stable integer ids", () => {
    expect(intId("ex_abc")).toBe(intId("ex_abc"));
    expect(intId("ex_abc")).not.toBe(intId("ex_abd"));
    expect(intId("x")).toBeGreaterThan(0);
  });
  it("exports an empty bundle without crashing", () => {
    const d = toExpoFpData({ format: "tessera.bundle", formatVersion: 1, version: 1, generatedAt: "", event: { id: "e", slug: "e", name: "E", venue: {}, status: "published", settings: DEFAULT_SETTINGS }, levels: [], booths: [], exhibitors: [], categories: [], sessions: [], wayfinding: { nodes: [], edges: [], transitions: [] }, banners: [], extras: [] });
    expect(d.title).toBe("E");
    expect(d.poiTypes.length).toBeGreaterThan(10);
  });
});

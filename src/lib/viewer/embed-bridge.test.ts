import { describe, expect, it } from "vitest";
import { originAllowed } from "./embed-bridge";

describe("embed bridge origins", () => {
  it("matches wildcard, exact and null origins", () => {
    expect(originAllowed("https://a.com", ["*"])).toBe(true);
    expect(originAllowed("https://a.com", ["https://a.com"])).toBe(true);
    expect(originAllowed("https://a.com", ["https://b.com"])).toBe(false);
    expect(originAllowed("https://x.a.com", ["https://*.a.com"])).toBe(true);
    expect(originAllowed("https://a.com", [])).toBe(false);
    expect(originAllowed("null", ["null"])).toBe(true);
    expect(originAllowed("null", ["https://a.com"])).toBe(false);
  });
});

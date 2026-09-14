import { describe, expect, it } from "vitest";
import { mergeViewerParams, parseHide, parsePosition, parseRouteParam, parseViewerParams, serializeViewerParams } from "./url-state";

describe("url-state", () => {
  it("parses every supported key from a query string", () => {
    const p = parseViewerParams("?booth=A101&exhibitor=acme&category=cat1&level=L2&route=A101,B205&from=A1&to=B2&accessible=1&search=robots&lang=de&kiosk=1&noOverlay=true&offHistory=0&plan=abc&position=90,105,L1&view=3d&theme=dark&preview=1&session=s1&embed=1&consent=denied&hide=controls,levels&bearing=12&zoom=18&center=10,20&tab=sessions");
    expect(p).toEqual({
      booth: "A101", exhibitor: "acme", category: "cat1", level: "L2", route: "A101,B205", from: "A1", to: "B2", accessible: "1", search: "robots",
      lang: "de", kiosk: "1", noOverlay: "1", offHistory: "0", plan: "abc", position: "90,105,L1", view: "3d", theme: "dark", preview: "1", session: "s1",
      embed: "1", consent: "denied", hide: "controls,levels", bearing: "12", zoom: "18", center: "10,20", tab: "sessions",
    });
  });

  it("accepts URLSearchParams and Next searchParams objects, ignores unknown/invalid values", () => {
    expect(parseViewerParams(new URLSearchParams("view=4d&theme=blue&tab=nope&foo=bar&booth=B1"))).toEqual({ booth: "B1" });
    expect(parseViewerParams({ booth: ["A1", "A2"], level: undefined, kiosk: "" })).toEqual({ booth: "A1", kiosk: "1" });
    expect(parseViewerParams(null)).toEqual({});
  });

  it("round-trips through serialise", () => {
    const params = { booth: "A101", level: "L1", accessible: "1" as const, kiosk: "0" as const, lang: "fr" };
    const qs = serializeViewerParams(params);
    expect(qs).toBe("booth=A101&level=L1&accessible=1&lang=fr");
    expect(parseViewerParams(qs)).toEqual({ booth: "A101", level: "L1", accessible: "1", lang: "fr" });
    expect(serializeViewerParams({})).toBe("");
  });

  it("merges patches and deletes on undefined", () => {
    expect(mergeViewerParams({ booth: "A1", level: "L1" }, { booth: undefined, exhibitor: "x" })).toEqual({ level: "L1", exhibitor: "x" });
  });

  it("parses helpers", () => {
    expect([...parseHide("controls, Levels,bogus")]).toEqual(["controls", "levels"]);
    expect(parsePosition("90,105")).toEqual({ x: 90, y: 105 });
    expect(parsePosition("90,105,L2")).toEqual({ x: 90, y: 105, level: "L2" });
    expect(parsePosition("a,b")).toBeNull();
    expect(parseRouteParam("A101,B205|C3")).toEqual(["A101", "B205", "C3"]);
  });
});

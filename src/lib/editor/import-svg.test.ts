import { describe, expect, it } from "vitest";
import { importSvgBooths, parsePathData, parseTransform } from "./import-svg";
import { polygonArea } from "@/lib/domain/geometry";

const SVG = `<?xml version="1.0"?>
<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 1000 600" width="1000" height="600">
  <defs><rect id="ignored" x="0" y="0" width="100" height="100"/></defs>
  <g id="booths" transform="translate(100, 50)">
    <rect id="A1" x="0" y="0" width="30" height="30"/>
    <rect data-label="A2" id="rect-7" x="30" y="0" width="30" height="30" transform="scale(2)"/>
    <polygon id="P1" points="200,0 260,0 260,40 230,40 230,20 200,20"/>
    <path id="C1" d="M300 0 h60 v40 h-60 Z"/>
    <path id="C2" d="m400,0 l60,0 l0,40 l-60,0 z"/>
    <rect x="500" y="0" width="30" height="30"><title>T1</title></rect>
    <rect x="600" y="0" width="30" height="30"/>
    <rect id="tiny" x="0" y="100" width="1" height="1"/>
  </g>
  <text x="10" y="10">Hall A</text>
</svg>`;

describe("importSvgBooths", () => {
  it("imports rects, polygons and paths with labels and transforms", () => {
    const r = importSvgBooths(SVG, { scale: 0.1 });
    expect(r.viewBox).toEqual({ x: 0, y: 0, width: 1000, height: 600 });
    const byLabel = Object.fromEntries(r.booths.map((b) => [b.label, b]));
    expect(Object.keys(byLabel).sort()).toEqual(["A1", "A2", "C1", "C2", "P1", "T1"]);
    expect(byLabel.A1.polygon).toEqual([[10, 5], [13, 5], [13, 8], [10, 8]]);
    // scale(2) on the element: 30..60 -> 60..120, + translate 100 -> 160..220 → ×0.1
    expect(byLabel.A2.polygon[0]).toEqual([16, 5]);
    expect(polygonArea(byLabel.A2.polygon)).toBeCloseTo(36);
    expect(byLabel.P1.polygon).toHaveLength(6);
    expect(polygonArea(byLabel.C1.polygon)).toBeCloseTo(24);
    expect(polygonArea(byLabel.C2.polygon)).toBeCloseTo(24);
    expect(byLabel.T1.source).toBe("rect");
    expect(r.warnings.some((w) => w.includes("unlabeled"))).toBe(true);
    expect(r.bounds?.minX).toBe(10);
  });

  it("names unlabeled shapes when asked and filters by pattern", () => {
    const r = importSvgBooths(SVG, { scale: 0.1, unlabeledPrefix: "U" });
    expect(r.booths.map((b) => b.label)).toContain("U1");
    const filtered = importSvgBooths(SVG, { scale: 0.1, labelPattern: /^[A-Z]\d$/ });
    expect(filtered.booths.map((b) => b.label).sort()).toEqual(["A1", "A2", "C1", "C2", "P1", "T1"]);
  });

  it("renames duplicate labels", () => {
    const r = importSvgBooths(`<svg><rect id="X" x="0" y="0" width="5" height="5"/><rect id="X" x="10" y="0" width="5" height="5"/></svg>`);
    expect(r.booths.map((b) => b.label)).toEqual(["X", "X-2"]);
    expect(r.warnings[0]).toContain("Duplicate");
  });

  it("ensures clockwise winding in y-down space", () => {
    const r = importSvgBooths(`<svg><polygon id="ccw" points="0,0 0,10 10,10 10,0"/></svg>`);
    const p = r.booths[0].polygon;
    let a = 0;
    for (let i = 0; i < p.length; i++) { const [x1, y1] = p[i], [x2, y2] = p[(i + 1) % p.length]; a += x1 * y2 - x2 * y1; }
    expect(a).toBeGreaterThan(0);
  });

  it("parses transforms and path data", () => {
    expect(parseTransform("translate(10 20)")).toEqual([1, 0, 0, 1, 10, 20]);
    expect(parseTransform("matrix(1 0 0 1 5 5) scale(2)")).toEqual([2, 0, 0, 2, 5, 5]);
    const rot = parseTransform("rotate(90)");
    expect(rot[0]).toBeCloseTo(0);
    expect(rot[1]).toBeCloseTo(1);
    expect(parsePathData("M0 0 L10 0 10 10 Z M20 20 h5 v5 z")).toEqual([[[0, 0], [10, 0], [10, 10]], [[20, 20], [25, 20], [25, 25]]]);
    expect(parsePathData("M0 0 C 1 1 2 2 3 3")).toEqual([[[0, 0], [3, 3]]]);
  });
});

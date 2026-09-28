import { describe, expect, it } from "vitest";
import { boothsFromShapes, extractPathShapes, type PdfOps } from "./pdf-vector";

const OPS: PdfOps = { save: 10, restore: 11, transform: 12, constructPath: 91, paintFormXObjectBegin: 74, paintFormXObjectEnd: 75, endPath: 28 };
const STROKE = 20;
/** pdf.js 6 rectangle encoding: moveTo, 3× lineTo, closePath. */
const rect = (x: number, y: number, w: number, h: number) => [0, x, y, 1, x + w, y, 1, x + w, y + h, 1, x, y + h, 4];

describe("extractPathShapes", () => {
  it("reads closed sub-paths through the CTM and viewport (PDF y-up → canvas y-down)", () => {
    const fn = [OPS.save, OPS.transform, OPS.constructPath, OPS.restore, OPS.constructPath];
    const args = [null, [2, 0, 0, 2, 10, 0], [STROKE, [new Float32Array(rect(0, 0, 5, 5))], null], null, [OPS.endPath, [new Float32Array(rect(0, 0, 1, 1))], null]];
    const vp = [1, 0, 0, -1, 0, 100]; // page 100 units tall
    const shapes = extractPathShapes(fn, args, OPS, vp);
    expect(shapes).toHaveLength(1); // the clip-only path is skipped
    expect(shapes[0].closed).toBe(true);
    expect(shapes[0].points).toEqual([[10, 100], [20, 100], [20, 90], [10, 90]]);
  });

  it("splits multi-rectangle paths and ignores open polylines", () => {
    const data = new Float32Array([...rect(0, 0, 4, 4), ...rect(10, 0, 4, 4), 0, 0, 20, 1, 30, 20]);
    const shapes = extractPathShapes([OPS.constructPath], [[STROKE, [data], null]], OPS, [1, 0, 0, 1, 0, 0]);
    expect(shapes).toHaveLength(2);
  });
});

describe("boothsFromShapes", () => {
  const sq = (x: number, y: number, w: number, h: number) => ({ points: [[x, y], [x + w, y], [x + w, y + h], [x, y + h]] as [number, number][], closed: true });
  const text = (t: string, x: number, y: number) => ({ text: t, x, y, w: t.length * 4, h: 6 });

  it("labels the smallest shape around each stand number and names it from the other text inside", () => {
    const shapes = [sq(0, 0, 400, 300), sq(10, 10, 60, 40), sq(80, 10, 60, 40), sq(10, 60, 130, 80), sq(200, 200, 30, 30)];
    const texts = [
      text("N2141", 20, 14), text("Adobe", 20, 30),
      text("N1740", 90, 14), text("AJA Video", 90, 24), text("Systems,", 90, 32), text("Inc.", 90, 40),
      text("N141:", 20, 70), text("Main", 20, 90), text("Stage", 20, 100),
      text("Premiere Park North", 150, 150), // inside only the hall outline: ignored
      text("10' x 20'", 205, 214), // dimension text in an unnumbered shape
    ];
    const r = boothsFromShapes(shapes, texts);
    expect(r.labelled).toBe(3);
    const by = Object.fromEntries(r.booths.map((b) => [b.label, b]));
    expect(by.N2141).toMatchObject({ name: "Adobe", nameKind: "exhibitor", labelSource: "text" });
    expect(by.N1740.name).toBe("AJA Video Systems, Inc.");
    expect(by.N141).toMatchObject({ name: "Main Stage", nameKind: "space" });
    expect(by.N2141.polygon).toHaveLength(4);
    expect(by.N2141.rect).toEqual({ x: 10, y: 10, w: 60, h: 40 });
  });

  it("drops page-sized frames, de-duplicates double-drawn shapes and suffixes repeated numbers", () => {
    const shapes = [sq(0, 0, 1000, 1000), sq(10, 10, 50, 50), sq(10, 10, 50, 50), sq(100, 10, 50, 50)];
    const r = boothsFromShapes(shapes, [text("A1", 20, 20), text("A1", 110, 20), text("Z9", 500, 500)], { pageArea: 1000 * 1000 });
    expect(r.shapes).toBe(2);
    expect(r.booths.map((b) => b.label)).toEqual(["A1", "A1-2"]);
  });
});

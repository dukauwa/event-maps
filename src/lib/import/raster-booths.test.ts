import { describe, expect, it } from "vitest";
import { detectCells, draftBooths, labelCells, orderCells, toPlanPolygon, type RasterImage } from "./raster-booths";

/** Tiny software rasteriser: white canvas, black rectangle outlines, optional filled rectangles. */
function canvas(w: number, h: number): RasterImage & { data: Uint8ClampedArray } {
  const data = new Uint8ClampedArray(w * h * 4).fill(255);
  return { width: w, height: h, data };
}
function px(img: RasterImage, x: number, y: number, rgb: [number, number, number]) {
  if (x < 0 || y < 0 || x >= img.width || y >= img.height) return;
  const p = (y * img.width + x) * 4;
  img.data[p] = rgb[0]; img.data[p + 1] = rgb[1]; img.data[p + 2] = rgb[2]; img.data[p + 3] = 255;
}
function strokeRect(img: RasterImage, x: number, y: number, w: number, h: number, t = 2, rgb: [number, number, number] = [0, 0, 0]) {
  for (let i = 0; i < w; i++) for (let k = 0; k < t; k++) { px(img, x + i, y + k, rgb); px(img, x + i, y + h - 1 - k, rgb); }
  for (let j = 0; j < h; j++) for (let k = 0; k < t; k++) { px(img, x + k, y + j, rgb); px(img, x + w - 1 - k, y + j, rgb); }
}
function fillRect(img: RasterImage, x: number, y: number, w: number, h: number, rgb: [number, number, number]) {
  for (let j = 0; j < h; j++) for (let i = 0; i < w; i++) px(img, x + i, y + j, rgb);
}

describe("detectCells", () => {
  it("finds a grid of outlined stands and ignores the hall outline", () => {
    const img = canvas(400, 300);
    strokeRect(img, 10, 10, 380, 280); // hall
    // 3 rows × 4 booths of 40×30 sharing walls
    for (let r = 0; r < 3; r++) for (let c = 0; c < 4; c++) strokeRect(img, 40 + c * 40, 40 + r * 30, 41, 31);
    const cells = detectCells(img);
    expect(cells).toHaveLength(12);
    for (const c of cells) {
      expect(c.w).toBeGreaterThanOrEqual(35);
      expect(c.w).toBeLessThanOrEqual(40);
      expect(c.fill).toBeGreaterThan(0.95);
    }
  });

  it("keeps a stand whose label text sits inside it, and keeps dark coloured fills", () => {
    const img = canvas(200, 120);
    strokeRect(img, 20, 20, 80, 60);
    fillRect(img, 45, 45, 20, 8, [0, 0, 0]); // a black "label" blob inside
    strokeRect(img, 110, 20, 80, 60);
    fillRect(img, 112, 22, 76, 56, [30, 60, 200]); // sold stand: dark saturated blue fill
    const cells = detectCells(img, { maxAreaFraction: 0.5 });
    expect(cells).toHaveLength(2);
    expect(cells[0].fill).toBeLessThan(1);
    expect(cells[0].fill).toBeGreaterThan(0.9);
  });

  it("drops corridors, specks and regions open to the border", () => {
    const img = canvas(300, 200);
    strokeRect(img, 10, 10, 280, 120); // hall
    strokeRect(img, 20, 20, 260, 12); // long aisle: aspect > 6
    strokeRect(img, 20, 40, 6, 6); // speck
    strokeRect(img, 20, 60, 60, 50); // real booth
    strokeRect(img, 150, 135, 60, 60); // closed, outside the hall: still a booth
    strokeRect(img, 230, 150, 60, 80); // runs off the image edge: open region
    const cells = detectCells(img, { minAreaPx: 100 });
    const sizes = cells.map((c) => [c.w, c.h]);
    expect(sizes).toContainEqual([56, 46]);
    expect(sizes).toContainEqual([56, 56]);
    expect(cells).toHaveLength(2);
  });
});

describe("orderCells / labelCells", () => {
  const grid = () => {
    const img = canvas(300, 200);
    for (let r = 0; r < 2; r++) for (let c = 0; c < 3; c++) strokeRect(img, 20 + c * 50, 20 + r * 40, 51, 41);
    return detectCells(img);
  };

  it("orders rows top-to-bottom and left-to-right", () => {
    const rows = orderCells(grid());
    expect(rows).toHaveLength(2);
    expect(rows[0].map((c) => Math.round(c.cx))).toEqual([46, 96, 146]);
    expect(rows[1][0].cy).toBeGreaterThan(rows[0][0].cy);
  });

  it("labels by row letter by default, or sequentially with a prefix", () => {
    expect(labelCells(grid()).map((b) => b.label)).toEqual(["A1", "A2", "A3", "B1", "B2", "B3"]);
    expect(labelCells(grid(), [], { scheme: "sequential", prefix: "S", start: 100 }).map((b) => b.label)).toEqual(["S100", "S101", "S102", "S103", "S104", "S105"]);
  });

  it("prefers PDF text inside a cell that looks like a booth number, and de-duplicates", () => {
    const texts = [
      { text: "C-12", x: 40, y: 35, w: 12, h: 6 },
      { text: "Hall 3 — North", x: 90, y: 35, w: 40, h: 6 },
      { text: "C-12", x: 140, y: 35, w: 12, h: 6 },
    ];
    const labels = labelCells(grid(), texts).map((b) => `${b.label}:${b.labelSource}`);
    expect(labels).toEqual(["C-12:text", "A2:auto", "C-12-2:text", "B1:auto", "B2:auto", "B3:auto"]);
  });
});

describe("toPlanPolygon / draftBooths", () => {
  it("scales pixel rectangles to centimetre-snapped metre polygons", () => {
    expect(toPlanPolygon({ x: 10, y: 20, w: 30, h: 40 }, { scale: 0.1, offsetX: 1, offsetY: 2 })).toEqual([[2, 4], [5, 4], [5, 8], [2, 8]]);
  });
  it("returns labelled, scaled booths with areas", () => {
    const img = canvas(120, 80);
    strokeRect(img, 10, 10, 41, 31);
    strokeRect(img, 50, 10, 41, 31);
    const out = draftBooths(img, { scale: 0.25 }, { detect: { maxAreaFraction: 0.5 }, labels: { scheme: "sequential", prefix: "T", start: 1 } });
    expect(out.map((b) => b.label)).toEqual(["T1", "T2"]);
    expect(out[0].areaM2).toBeCloseTo(37 * 27 * 0.0625, 1);
    expect(out[0].polygon[0]).toEqual([3, 3]);
  });
});

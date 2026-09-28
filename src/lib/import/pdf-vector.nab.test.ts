/**
 * Real-world check against a customer floor plan (NAB Show 2027, North Hall), when the file is available locally.
 * Set NAB_PDF=/path/to/nab27_HallB.pdf to run it.
 */
import fs from "node:fs";
import { describe, expect, it } from "vitest";
import { boothsFromShapes, extractPathShapes } from "./pdf-vector";
import type { TextItem } from "./raster-booths";

const file = process.env.NAB_PDF;
describe.skipIf(!file || !fs.existsSync(file))("NAB Show North Hall PDF", () => {
  it("reads every numbered stand with its exhibitor", async () => {
    const pdfjs = await import("pdfjs-dist/legacy/build/pdf.mjs");
    const doc = await pdfjs.getDocument({ data: new Uint8Array(fs.readFileSync(file!)) }).promise;
    const page = await doc.getPage(1);
    const scale = 2400 / Math.max(page.getViewport({ scale: 1 }).width, page.getViewport({ scale: 1 }).height);
    const vp = page.getViewport({ scale });
    const ol = await page.getOperatorList();
    const shapes = extractPathShapes(ol.fnArray, ol.argsArray, pdfjs.OPS as never, vp.transform);
    const texts: TextItem[] = [];
    for (const item of (await page.getTextContent()).items) {
      if (!("str" in item) || !item.str.trim()) continue;
      const [a, b, , d, e, f] = item.transform as number[];
      const fontPx = (Math.hypot(a, b) || Math.abs(d) || 1) * scale;
      const [x0, yb] = vp.convertToViewportPoint(e, f);
      const [x1] = vp.convertToViewportPoint(e + item.width, f);
      texts.push({ text: item.str, x: Math.min(x0, x1), y: yb - fontPx, w: Math.abs(x1 - x0), h: fontPx });
    }
    const r = boothsFromShapes(shapes, texts, { pageArea: vp.width * vp.height });
    const by = Object.fromEntries(r.booths.map((b) => [b.label, b]));
    console.log(`shapes ${shapes.length} → candidates ${r.shapes}, booths ${r.booths.length}; named ${r.booths.filter((b) => b.name).length}`);
    console.log(r.booths.slice(0, 12).map((b) => `${b.label}${b.name ? ` = ${b.name}` : ""}`).join(" | "));
    expect(r.booths.length).toBeGreaterThan(150);
    expect(by.N2141?.name).toMatch(/Adobe/);
    expect(by.N2502?.name).toMatch(/Blackmagic/);
    expect(by.N141?.nameKind).toBe("space");
  });
});

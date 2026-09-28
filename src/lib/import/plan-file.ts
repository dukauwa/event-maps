/**
 * Browser-side loaders that turn an uploaded floor plan file (PDF, PNG/JPG/WebP/GIF, SVG) into pixels the
 * auto-draft engine can read, plus the text runs of a vector PDF so booth numbers survive the import.
 *
 * Everything here needs a DOM (canvas, Image, pdf.js) and is imported dynamically by the wizard.
 */
import type { RasterImage, TextItem } from "./raster-booths";
import { extractPathShapes, type PathShape } from "./pdf-vector";

export interface LoadedPlan {
  /** Rendered page, ready to upload as the level background. */
  canvas: HTMLCanvasElement;
  width: number;
  height: number;
  /** Text runs in canvas pixel space (vector PDFs only). */
  texts: TextItem[];
  /** Closed vector paths in canvas pixel space (PDFs only): exact booth outlines when the plan was drawn, not scanned. */
  shapes?: PathShape[];
  /** Page count for PDFs, 1 otherwise. */
  pages: number;
  page: number;
  kind: "pdf" | "image" | "svg";
  /** Original SVG markup, so the vector importer can be tried before rasterising. */
  svg?: string;
}

const PDF_WORKER = "/pdfjs/pdf.worker.min.mjs";
/** Longest side of the rendered page. Big enough to keep 1 m ≈ 6–10 px on a hall plan, small enough to flood-fill fast. */
export const RENDER_MAX_PX = 2400;

export function isPdf(file: File): boolean { return file.type === "application/pdf" || /\.pdf$/i.test(file.name); }
export function isSvg(file: File): boolean { return file.type === "image/svg+xml" || /\.svg$/i.test(file.name); }

export async function loadPlanFile(file: File, page = 1): Promise<LoadedPlan> {
  if (isPdf(file)) return loadPdf(await file.arrayBuffer(), page);
  const svg = isSvg(file) ? await file.text() : undefined;
  const url = URL.createObjectURL(file);
  try {
    const img = await loadImage(url);
    const k = Math.min(1, RENDER_MAX_PX / Math.max(img.naturalWidth || img.width, img.naturalHeight || img.height));
    const w = Math.max(1, Math.round((img.naturalWidth || img.width) * k)), h = Math.max(1, Math.round((img.naturalHeight || img.height) * k));
    const canvas = document.createElement("canvas");
    canvas.width = w; canvas.height = h;
    const ctx = canvas.getContext("2d");
    if (!ctx) throw new Error("Canvas unavailable");
    ctx.fillStyle = "#fff";
    ctx.fillRect(0, 0, w, h);
    ctx.drawImage(img, 0, 0, w, h);
    return { canvas, width: w, height: h, texts: [], pages: 1, page: 1, kind: svg ? "svg" : "image", svg };
  } finally {
    URL.revokeObjectURL(url);
  }
}

function loadImage(url: string): Promise<HTMLImageElement> {
  return new Promise((resolve, reject) => {
    const img = new Image();
    img.onload = () => resolve(img);
    img.onerror = () => reject(new Error("Could not decode the image"));
    img.src = url;
  });
}

export async function loadPdf(data: ArrayBuffer, pageNumber = 1): Promise<LoadedPlan> {
  // The legacy build polyfills the newest ES features pdf.js 6 relies on (e.g. Map#getOrInsertComputed), so the
  // importer works in browsers a year or two old, not only the very latest Chrome.
  const pdfjs = await import("pdfjs-dist/legacy/build/pdf.mjs");
  pdfjs.GlobalWorkerOptions.workerSrc = PDF_WORKER;
  const task = pdfjs.getDocument({ data });
  const doc = await task.promise;
  const page = await doc.getPage(Math.min(Math.max(1, pageNumber), doc.numPages));
  const base = page.getViewport({ scale: 1 });
  const scale = RENDER_MAX_PX / Math.max(base.width, base.height);
  const viewport = page.getViewport({ scale });
  const canvas = document.createElement("canvas");
  canvas.width = Math.ceil(viewport.width);
  canvas.height = Math.ceil(viewport.height);
  const ctx = canvas.getContext("2d");
  if (!ctx) throw new Error("Canvas unavailable");
  ctx.fillStyle = "#fff";
  ctx.fillRect(0, 0, canvas.width, canvas.height);
  await page.render({ canvas, canvasContext: ctx, viewport, background: "#ffffff" }).promise;

  const texts: TextItem[] = [];
  const content = await page.getTextContent();
  for (const item of content.items) {
    if (!("str" in item) || !item.str.trim()) continue;
    // transform = [a b c d e f]; (e, f) is the baseline start in PDF user space (y up). Height ≈ |d| (font size).
    const [a, b, , d, e, f] = item.transform as number[];
    const fontPx = Math.hypot(a, b) || Math.abs(d) || 1;
    const [x0, yBase] = viewport.convertToViewportPoint(e, f);
    const [x1] = viewport.convertToViewportPoint(e + item.width, f);
    const h = fontPx * scale;
    texts.push({ text: item.str, x: Math.min(x0, x1), y: yBase - h, w: Math.abs(x1 - x0) || item.str.length * h * 0.5, h });
  }
  const ol = await page.getOperatorList();
  const shapes = extractPathShapes(ol.fnArray, ol.argsArray, pdfjs.OPS as unknown as Parameters<typeof extractPathShapes>[2], viewport.transform);
  const out: LoadedPlan = { canvas, width: canvas.width, height: canvas.height, texts, shapes, pages: doc.numPages, page: page.pageNumber, kind: "pdf" };
  await task.destroy();
  return out;
}

export function imageDataOf(canvas: HTMLCanvasElement): RasterImage {
  const ctx = canvas.getContext("2d", { willReadFrequently: true });
  if (!ctx) throw new Error("Canvas unavailable");
  const d = ctx.getImageData(0, 0, canvas.width, canvas.height);
  return { width: d.width, height: d.height, data: d.data };
}

/**
 * Encode the rendered plan for upload. Serverless hosts cap request bodies at ~4.5 MB, and a plan with a photographic
 * background renders to a large PNG: keep PNG (crisp lines) when it fits, else WebP, else progressively lighter JPEG.
 */
export async function encodeForUpload(canvas: HTMLCanvasElement, maxBytes = 3_500_000): Promise<Blob> {
  const png = await canvasToBlob(canvas, "image/png");
  if (png.size <= maxBytes) return png;
  const webp = await canvasToBlob(canvas, "image/webp", 0.88);
  if (webp.type === "image/webp" && webp.size <= maxBytes) return webp;
  for (const q of [0.85, 0.7, 0.55]) {
    const jpg = await canvasToBlob(canvas, "image/jpeg", q);
    if (jpg.size <= maxBytes) return jpg;
  }
  return canvasToBlob(canvas, "image/jpeg", 0.4);
}

export function canvasToBlob(canvas: HTMLCanvasElement, type = "image/png", quality?: number): Promise<Blob> {
  return new Promise((resolve, reject) => canvas.toBlob((b) => (b ? resolve(b) : reject(new Error("Could not encode the image"))), type, quality));
}

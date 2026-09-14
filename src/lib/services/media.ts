import fs from "node:fs";
import path from "node:path";
import { eq } from "drizzle-orm";
import { db, schema } from "@/lib/db";
import { newId } from "@/lib/ids";
import { badRequest } from "@/lib/api/http";

const ALLOWED: Record<string, string> = { "image/png": "png", "image/jpeg": "jpg", "image/webp": "webp", "image/svg+xml": "svg", "image/gif": "gif", "application/pdf": "pdf", "image/x-dxf": "dxf", "application/dxf": "dxf", "text/csv": "csv" };
const MAX_BYTES = 25 * 1024 * 1024;

export function uploadsDir() {
  return process.env.UPLOADS_DIR || path.join(process.cwd(), "data", "uploads");
}

export async function saveUpload(orgId: string, file: File): Promise<{ id: string; url: string; filename: string; mime: string; size: number }> {
  const mime = file.type || "application/octet-stream";
  const ext = ALLOWED[mime] ?? (file.name.split(".").pop()?.toLowerCase() || "bin");
  if (!ALLOWED[mime] && !["dxf", "svg", "csv", "xlsx"].includes(ext)) throw badRequest(`Unsupported file type ${mime}`);
  if (file.size > MAX_BYTES) throw badRequest("File too large (max 25 MB)");
  const id = newId("md");
  const dir = path.join(uploadsDir(), orgId);
  fs.mkdirSync(dir, { recursive: true });
  const rel = `${orgId}/${id}.${ext}`;
  fs.writeFileSync(path.join(uploadsDir(), rel), Buffer.from(await file.arrayBuffer()));
  db().insert(schema.mediaAssets).values({ id, orgId, filename: file.name, mime, size: file.size, path: rel }).run();
  return { id, url: `/media/${rel}`, filename: file.name, mime, size: file.size };
}

export function readMedia(rel: string): { buffer: Buffer; mime: string } | null {
  const safe = path.normalize(rel).replace(/^(\.\.[/\\])+/, "");
  const row = db().select().from(schema.mediaAssets).where(eq(schema.mediaAssets.path, safe)).get();
  if (!row) return null;
  const full = path.join(uploadsDir(), safe);
  if (!fs.existsSync(full)) return null;
  return { buffer: fs.readFileSync(full), mime: row.mime };
}

import fs from "node:fs";
import path from "node:path";
import { eq } from "drizzle-orm";
import { db, schema } from "@/lib/db";
import { newId } from "@/lib/ids";
import { badRequest } from "@/lib/api/http";

const ALLOWED: Record<string, string> = { "image/png": "png", "image/jpeg": "jpg", "image/webp": "webp", "image/svg+xml": "svg", "image/gif": "gif", "application/pdf": "pdf", "image/x-dxf": "dxf", "application/dxf": "dxf", "text/csv": "csv" };
/**
 * Files are stored in the database so that every server instance (each serverless function included) can serve them.
 * Serverless platforms cap request bodies at ~4.5 MB anyway; the floor-plan importer uploads a compressed render.
 */
const MAX_BYTES = 15 * 1024 * 1024;

/** Where files uploaded before database storage were written; still read for those legacy rows. */
export function uploadsDir() {
  if (process.env.UPLOADS_DIR) return process.env.UPLOADS_DIR;
  return path.join(process.cwd(), "data", "uploads");
}

export async function saveUpload(orgId: string, file: File): Promise<{ id: string; url: string; filename: string; mime: string; size: number }> {
  const mime = file.type || "application/octet-stream";
  const ext = ALLOWED[mime] ?? (file.name.split(".").pop()?.toLowerCase() || "bin");
  if (!ALLOWED[mime] && !["dxf", "svg", "csv", "xlsx"].includes(ext)) throw badRequest(`Unsupported file type ${mime}`);
  if (file.size > MAX_BYTES) throw badRequest("File too large (max 15 MB)");
  const id = newId("md");
  const rel = `${orgId}/${id}.${ext}`;
  const data = Buffer.from(await file.arrayBuffer());
  await db().insert(schema.mediaAssets).values({ id, orgId, filename: file.name, mime, size: file.size, path: rel, data }).run();
  return { id, url: `/media/${rel}`, filename: file.name, mime, size: file.size };
}

export async function readMedia(rel: string): Promise<{ buffer: Buffer; mime: string } | null> {
  const safe = path.normalize(rel).replace(/^(\.\.[/\\])+/, "");
  const row = await db().select().from(schema.mediaAssets).where(eq(schema.mediaAssets.path, safe)).get();
  if (!row) return null;
  if (row.data) return { buffer: Buffer.from(row.data), mime: row.mime };
  const full = path.join(uploadsDir(), safe);
  if (!fs.existsSync(full)) return null;
  return { buffer: fs.readFileSync(full), mime: row.mime };
}

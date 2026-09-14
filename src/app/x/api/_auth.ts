import { currentExhibitor } from "@/lib/auth/session";
import { db, schema } from "@/lib/db";
import { eq } from "drizzle-orm";
import { ApiError } from "@/lib/api/http";

/** Portal routes authenticate with the exhibitor cookie set by /x/[token]. */
export async function requirePortal() {
  const ex = await currentExhibitor();
  if (!ex) throw new ApiError(401, "unauthorized", "Open your exhibitor link again to sign in");
  const event = db().select().from(schema.events).where(eq(schema.events.id, ex.eventId)).get();
  if (!event) throw new ApiError(404, "not_found", "event not found");
  return { exhibitor: ex, event };
}

import { eq } from "drizzle-orm";
import { db, schema } from "@/lib/db";
import { getExhibitor } from "@/lib/services/exhibitors";

/** Resolve a portal token → { exhibitor, event } or null. */
export function resolvePortal(token: string) {
  const row = db().select().from(schema.exhibitors).where(eq(schema.exhibitors.portalToken, token)).get();
  if (!row) return null;
  const event = db().select().from(schema.events).where(eq(schema.events.id, row.eventId)).get();
  if (!event) return null;
  const exhibitor = getExhibitor(event.id, row.id);
  return exhibitor ? { exhibitor, event } : null;
}

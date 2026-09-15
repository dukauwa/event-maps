import { notFound, redirect } from "next/navigation";
import { eq } from "drizzle-orm";
import { db, schema } from "@/lib/db";
import { AuthError, requireUser } from "@/lib/auth/session";
import { getEvent } from "@/lib/services/events";
import { buildBundle } from "@/lib/bundle";
import { Designer } from "@/components/editor/Designer";

export const dynamic = "force-dynamic";

export default async function DesignerPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const user = await requireUser().catch((e: unknown) => { if (e instanceof AuthError) return null; throw e; });
  if (!user) redirect(`/login?next=${encodeURIComponent(`/admin/events/${id}/designer`)}`);
  const event = getEvent(user.orgId, id);
  if (!event) notFound();
  const bundle = buildBundle(db(), event.id);
  if (!bundle) notFound();
  // The public bundle omits notes and carries *resolved* prices; the editor needs the raw overrides.
  const rows = db().select({ id: schema.booths.id, notes: schema.booths.notes, priceCents: schema.booths.priceCents }).from(schema.booths).where(eq(schema.booths.eventId, event.id)).all();
  const notes: Record<string, string | null> = {};
  const priceOverrides: Record<string, number | null> = {};
  for (const r of rows) { notes[r.id] = r.notes; priceOverrides[r.id] = r.priceCents; }
  return <Designer bundle={bundle} event={{ id: event.id, slug: event.slug, name: event.name, settings: event.settings }} notes={notes} priceOverrides={priceOverrides} />;
}

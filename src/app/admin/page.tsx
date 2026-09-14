import type { Metadata } from "next";
import { eq } from "drizzle-orm";
import { db, schema } from "@/lib/db";
import { listEvents } from "@/lib/services/events";
import { EventsList, type EventCard } from "@/components/admin/events-list";
import { requireAdmin } from "./_lib";

export const metadata: Metadata = { title: "Events" };

export default async function AdminHome() {
  const user = await requireAdmin("/admin");
  const events = listEvents(user.orgId);
  const cards: EventCard[] = events.map((e) => {
    const booths = db().select({ status: schema.booths.status }).from(schema.booths).where(eq(schema.booths.eventId, e.id)).all();
    const exhibitors = db().select({ id: schema.exhibitors.id }).from(schema.exhibitors).where(eq(schema.exhibitors.eventId, e.id)).all().length;
    return {
      id: e.id, slug: e.slug, name: e.name, subtitle: e.subtitle, status: e.status, startsAt: e.startsAt, endsAt: e.endsAt, timezone: e.timezone,
      venueName: e.venueName, venueAddress: e.venueAddress, publishedVersion: e.publishedVersion,
      booths: booths.length, sold: booths.filter((b) => b.status === "sold").length, available: booths.filter((b) => b.status === "available").length, exhibitors,
    };
  });
  return <EventsList events={cards} />;
}

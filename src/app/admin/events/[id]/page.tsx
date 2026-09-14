import type { Metadata } from "next";
import { eq } from "drizzle-orm";
import { db, schema } from "@/lib/db";
import { requestOrigin } from "@/lib/auth/session";
import { listVersions } from "@/lib/services/events";
import { salesSummary, listOrders } from "@/lib/services/orders";
import { analyticsSummary } from "@/lib/services/analytics";
import { listExhibitors } from "@/lib/services/exhibitors";
import { EventDashboard } from "@/components/admin/event-dashboard";
import { loadEvent } from "../../_lib";

export const metadata: Metadata = { title: "Dashboard" };

export default async function EventDashboardPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const { event } = await loadEvent(id);
  const summary = salesSummary(event);
  const a = analyticsSummary(event.id);
  const exhibitors = listExhibitors(event.id);
  const counts = {
    exhibitors: exhibitors.length,
    unassignedExhibitors: exhibitors.filter((e) => e.boothIds.length === 0).length,
    categories: db().select({ id: schema.categories.id }).from(schema.categories).where(eq(schema.categories.eventId, event.id)).all().length,
    sessions: db().select({ id: schema.sessions.id }).from(schema.sessions).where(eq(schema.sessions.eventId, event.id)).all().length,
    levels: db().select({ id: schema.levels.id }).from(schema.levels).where(eq(schema.levels.eventId, event.id)).all().length,
    banners: db().select({ id: schema.banners.id }).from(schema.banners).where(eq(schema.banners.eventId, event.id)).all().length,
    pendingOrders: listOrders(event.id).filter((o) => o.status === "pending_payment" || o.status === "hold" || o.status === "invoiced").length,
  };
  return (
    <EventDashboard
      event={{ id: event.id, slug: event.slug, name: event.name, subtitle: event.subtitle, status: event.status, startsAt: event.startsAt, endsAt: event.endsAt, timezone: event.timezone, venueName: event.venueName, publishedVersion: event.publishedVersion, publishedAt: event.publishedAt, updatedAt: event.updatedAt, currency: event.settings.sales.currency }}
      summary={summary}
      analytics={{ uniqueSessions: a.uniqueSessions, totals: a.totals, byDay: a.byDay, topExhibitors: a.topExhibitors, topSearches: a.topSearches }}
      counts={counts}
      versions={listVersions(event.id)}
      origin={await requestOrigin()}
    />
  );
}

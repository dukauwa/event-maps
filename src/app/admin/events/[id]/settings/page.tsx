import type { Metadata } from "next";
import { listLevels } from "@/lib/services/levels";
import { EventSettingsForm } from "@/components/admin/event-settings";
import { loadEvent } from "../../../_lib";

export const metadata: Metadata = { title: "Settings" };

export default async function SettingsPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const { event } = await loadEvent(id);
  return (
    <EventSettingsForm
      event={{ id: event.id, slug: event.slug, name: event.name, subtitle: event.subtitle, description: event.description, startsAt: event.startsAt, endsAt: event.endsAt, timezone: event.timezone, venueName: event.venueName, venueAddress: event.venueAddress, venueLat: event.venueLat, venueLng: event.venueLng, status: event.status, settings: event.settings, publishedVersion: event.publishedVersion }}
      levels={listLevels(event.id).map((l) => ({ id: l.id, name: l.name }))}
      gripConfigured={!!(process.env.GRIP_API_BASE && process.env.GRIP_API_KEY)}
    />
  );
}

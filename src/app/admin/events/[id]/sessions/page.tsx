import type { Metadata } from "next";
import { listSessions } from "@/lib/services/sessions";
import { listBooths } from "@/lib/services/booths";
import { listElements } from "@/lib/services/elements";
import { listLevels } from "@/lib/services/levels";
import { SessionsManager } from "@/components/admin/sessions-manager";
import { loadEvent } from "../../../_lib";

export const metadata: Metadata = { title: "Sessions" };

export default async function SessionsPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const { event } = await loadEvent(id);
  const levelName = new Map(listLevels(event.id).map((l) => [l.id, l.shortName]));
  const places = listElements(event.id).filter((e) => (e.kind === "stage" || e.kind === "room" || e.kind === "zone") && typeof e.props?.name === "string" && e.props.name).map((e) => ({ id: e.id, name: String(e.props.name), kind: e.kind, levelName: levelName.get(e.levelId) ?? "" }));
  return (
    <SessionsManager
      event={{ id: event.id, name: event.name, timezone: event.timezone, startsAt: event.startsAt, booth: event.settings.terms.booth }}
      sessions={listSessions(event.id).map((s) => ({ id: s.id, externalId: s.externalId, title: s.title, description: s.description, startsAt: s.startsAt, endsAt: s.endsAt, boothId: s.boothId, elementId: s.elementId, speakers: s.speakers ?? [], track: s.track, url: s.url }))}
      booths={listBooths(event.id).map((b) => ({ id: b.id, label: b.label }))}
      places={places}
    />
  );
}

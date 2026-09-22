import type { Metadata } from "next";
import { NewEventWizard } from "@/components/admin/wizard/new-event-wizard";
import { requireAdmin } from "../../_lib";

export const metadata: Metadata = { title: "New event" };

export default async function NewEventPage() {
  await requireAdmin("/admin/events/new");
  return <NewEventWizard defaultTimezone="UTC" />;
}

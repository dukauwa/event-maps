import { notFound, redirect } from "next/navigation";
import { currentUser, type AuthUser } from "@/lib/auth/session";
import { getEvent } from "@/lib/services/events";
import type { Event } from "@/lib/db/schema";

/** Signed-in organiser or redirect to the login page. */
export async function requireAdmin(next?: string): Promise<AuthUser> {
  const user = await currentUser();
  if (!user) redirect(`/login${next ? `?next=${encodeURIComponent(next)}` : ""}`);
  return user;
}

/** Event owned by the signed-in organiser's org, or 404. */
export async function loadEvent(id: string): Promise<{ user: AuthUser; event: Event }> {
  const user = await requireAdmin(`/admin/events/${id}`);
  const event = getEvent(user.orgId, id);
  if (!event) notFound();
  return { user, event };
}

export const eventCrumbs = (event: Event, section?: string) => [
  { href: "/admin", label: "Events" },
  { href: `/admin/events/${event.id}`, label: event.name },
  ...(section ? [{ label: section }] : []),
];

import { eq } from "drizzle-orm";
import { db, schema } from "@/lib/db";
import { listEvents } from "@/lib/services/events";
import { Toaster } from "@/components/ui";
import { AdminShell } from "@/components/admin/shell";
import { requireAdmin } from "./_lib";

export const dynamic = "force-dynamic";

export default async function AdminLayout({ children }: { children: React.ReactNode }) {
  const user = await requireAdmin("/admin");
  const org = db().select().from(schema.organizations).where(eq(schema.organizations.id, user.orgId)).get();
  const events = listEvents(user.orgId).map((e) => ({ id: e.id, name: e.name, slug: e.slug, status: e.status }));
  return (
    <AdminShell user={{ name: user.name, email: user.email, role: user.role }} orgName={org?.name ?? "Organisation"} events={events}>
      {children}
      <Toaster />
    </AdminShell>
  );
}

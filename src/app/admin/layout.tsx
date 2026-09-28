import { eq } from "drizzle-orm";
import { db, schema, storageMode } from "@/lib/db";
import { listEvents } from "@/lib/services/events";
import { Toaster } from "@/components/ui";
import { AdminShell } from "@/components/admin/shell";
import { requireAdmin } from "./_lib";

export const dynamic = "force-dynamic";

export default async function AdminLayout({ children }: { children: React.ReactNode }) {
  const user = await requireAdmin("/admin");
  const org = await db().select().from(schema.organizations).where(eq(schema.organizations.id, user.orgId)).get();
  const events = (await listEvents(user.orgId)).map((e) => ({ id: e.id, name: e.name, slug: e.slug, status: e.status }));
  return (
    <AdminShell user={{ name: user.name, email: user.email, role: user.role }} orgName={org?.name ?? "Organisation"} events={events}>
      {storageMode() === "ephemeral" && (
        <div role="alert" className="mb-6 rounded-lg border border-amber-300 bg-amber-50 px-4 py-3 text-sm text-amber-900">
          <p className="font-semibold">No shared database is connected, so changes won&apos;t stick.</p>
          <p className="mt-1">On this host every page and API route runs as its own serverless function with its own temporary copy of the data. An event you create can be missing on the next page, and everything resets when the host recycles. Connect a Turso database in Vercel (Storage → Create Database → Turso → connect to this project), then redeploy.</p>
        </div>
      )}
      {children}
      <Toaster />
    </AdminShell>
  );
}

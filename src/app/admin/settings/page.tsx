import type { Metadata } from "next";
import { eq } from "drizzle-orm";
import { db, schema } from "@/lib/db";
import { requestOrigin } from "@/lib/auth/session";
import { listApiKeys } from "@/lib/services/apikeys";
import { listWebhooks } from "@/lib/services/webhooks";
import { listEvents } from "@/lib/services/events";
import { OrgSettings } from "@/components/admin/org-settings";
import { requireAdmin } from "../_lib";

export const metadata: Metadata = { title: "Organisation settings" };

export default async function OrgSettingsPage() {
  const user = await requireAdmin("/admin/settings");
  const org = db().select().from(schema.organizations).where(eq(schema.organizations.id, user.orgId)).get();
  const webhooks = listWebhooks(user.orgId).map(({ secret, ...w }) => ({ ...w, events: w.events as string[], secretPreview: `${secret.slice(0, 6)}…` }));
  return (
    <OrgSettings
      orgName={org?.name ?? "Organisation"}
      apiKeys={listApiKeys(user.orgId)}
      webhooks={webhooks}
      events={listEvents(user.orgId).map((e) => ({ id: e.id, name: e.name }))}
      origin={await requestOrigin()}
    />
  );
}

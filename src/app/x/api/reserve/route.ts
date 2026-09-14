import { z } from "zod";
import { ok, parseBody, withApi } from "@/lib/api/http";
import { reserveBooth } from "@/lib/services/orders";
import { requestOrigin } from "@/lib/auth/session";
import { requirePortal } from "../_auth";

/** Reserve a booth for the signed-in exhibitor (pre-filled from the profile). */
export const POST = withApi(async (req: Request) => {
  const { exhibitor, event } = await requirePortal();
  const { boothId, notes } = await parseBody(req, z.object({ boothId: z.string(), notes: z.string().max(2000).optional() }));
  const r = reserveBooth(event, { boothId, exhibitorId: exhibitor.id, company: exhibitor.name, contactName: exhibitor.contactName ?? exhibitor.name, contactEmail: exhibitor.email ?? `${exhibitor.slug}@example.com`, notes }, await requestOrigin());
  return ok({ order: { id: r.order.id, status: r.order.status, expiresAt: r.order.expiresAt }, checkoutUrl: r.checkoutUrl }, { status: 201 });
});

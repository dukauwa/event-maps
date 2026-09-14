import { ok, parseBody, withApi } from "@/lib/api/http";
import { exhibitorInput, updateExhibitor } from "@/lib/services/exhibitors";
import { requirePortal } from "../_auth";

const allowed = exhibitorInput.pick({ name: true, description: true, website: true, email: true, phone: true, address: true, city: true, zip: true, country: true, socials: true, videoUrl: true, customButtonTitle: true, customButtonUrl: true, gallery: true, logoUrl: true, leadingImageUrl: true, contactName: true, categoryIds: true, tags: true }).partial();

export const PATCH = withApi(async (req: Request) => {
  const { exhibitor, event } = await requirePortal();
  const patch = await parseBody(req, allowed);
  return ok(updateExhibitor(event, exhibitor.id, patch));
});

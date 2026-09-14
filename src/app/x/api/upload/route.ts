import { badRequest, ok, withApi } from "@/lib/api/http";
import { saveUpload } from "@/lib/services/media";
import { requirePortal } from "../_auth";

export const POST = withApi(async (req: Request) => {
  const { event } = await requirePortal();
  const form = await req.formData();
  const file = form.get("file");
  if (!(file instanceof File)) throw badRequest("Missing file");
  if (!file.type.startsWith("image/")) throw badRequest("Images only");
  return ok(await saveUpload(event.orgId, file), { status: 201 });
});

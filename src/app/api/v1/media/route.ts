import { badRequest, ok, optionsResponse, requirePrincipal, withApi } from "@/lib/api/http";
import { saveUpload } from "@/lib/services/media";

export const OPTIONS = () => optionsResponse();
/** multipart/form-data with a `file` field → `{ url }` (served from /media/...). */
export const POST = withApi(async (req: Request) => {
  const p = await requirePrincipal(req, "write");
  const form = await req.formData();
  const file = form.get("file");
  if (!(file instanceof File)) throw badRequest("Missing file");
  return ok(await saveUpload(p.orgId, file), { status: 201 });
});

import { ok, optionsResponse, requirePrincipal, withApi } from "@/lib/api/http";
import { geocode } from "@/lib/services/geocode";

export const OPTIONS = () => optionsResponse();
/** Venue search: `?q=ExCeL London` → `{ data: [{ name, address, lat, lng, kind }] }`. */
export const GET = withApi(async (req: Request) => {
  await requirePrincipal(req);
  const q = new URL(req.url).searchParams.get("q") ?? "";
  return ok(await geocode(q));
});

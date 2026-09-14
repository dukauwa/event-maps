import { ok, optionsResponse, parseBody, requirePrincipal, withApi } from "@/lib/api/http";
import { createEvent, eventInput, listEvents } from "@/lib/services/events";

export const OPTIONS = () => optionsResponse();
export const GET = withApi(async (req: Request) => {
  const p = await requirePrincipal(req);
  return ok(listEvents(p.orgId).map(({ settings: _s, ...e }) => { void _s; return e; }));
});
export const POST = withApi(async (req: Request) => {
  const p = await requirePrincipal(req, "write");
  const input = await parseBody(req, eventInput);
  return ok(createEvent(p.orgId, input), { status: 201 });
});

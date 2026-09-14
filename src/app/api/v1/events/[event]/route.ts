import { ok, optionsResponse, parseBody, requireEvent, withApi } from "@/lib/api/http";
import { deleteEvent, eventInput, updateEvent } from "@/lib/services/events";

type Ctx = { params: Promise<{ event: string }> };
export const OPTIONS = () => optionsResponse();
export const GET = withApi(async (req: Request, ctx: Ctx) => {
  const { event } = await requireEvent(req, (await ctx.params).event);
  return ok(event);
});
export const PATCH = withApi(async (req: Request, ctx: Ctx) => {
  const { event, principal } = await requireEvent(req, (await ctx.params).event, "write");
  const patch = await parseBody(req, eventInput.partial());
  return ok(updateEvent(principal.orgId, event.id, patch));
});
export const DELETE = withApi(async (req: Request, ctx: Ctx) => {
  const { event, principal } = await requireEvent(req, (await ctx.params).event, "admin");
  deleteEvent(principal.orgId, event.id);
  return ok({ deleted: true });
});

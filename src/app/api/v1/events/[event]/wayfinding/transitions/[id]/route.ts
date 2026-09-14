import { ok, optionsResponse, parseBody, requireEvent, withApi } from "@/lib/api/http";
import { deleteTransition, transitionInput, updateTransition } from "@/lib/services/wayfinding";

type Ctx = { params: Promise<{ event: string; id: string }> };
export const OPTIONS = () => optionsResponse();
export const PATCH = withApi(async (req: Request, ctx: Ctx) => { const p = await ctx.params; const { event } = await requireEvent(req, p.event, "write"); return ok(updateTransition(event.id, p.id, await parseBody(req, transitionInput.partial()))); });
export const DELETE = withApi(async (req: Request, ctx: Ctx) => { const p = await ctx.params; const { event } = await requireEvent(req, p.event, "write"); deleteTransition(event.id, p.id); return ok({ deleted: true }); });

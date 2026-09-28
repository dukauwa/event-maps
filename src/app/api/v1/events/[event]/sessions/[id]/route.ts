import { notFound, ok, optionsResponse, parseBody, requireEvent, withApi } from "@/lib/api/http";
import { deleteSession, getSession, sessionInput, updateSession } from "@/lib/services/sessions";

type Ctx = { params: Promise<{ event: string; id: string }> };
export const OPTIONS = () => optionsResponse();
export const GET = withApi(async (req: Request, ctx: Ctx) => { const p = await ctx.params; const { event } = await requireEvent(req, p.event); const s = await getSession(event.id, p.id); if (!s) throw notFound("session"); return ok(s); });
export const PATCH = withApi(async (req: Request, ctx: Ctx) => { const p = await ctx.params; const { event } = await requireEvent(req, p.event, "write"); const s = await getSession(event.id, p.id); if (!s) throw notFound("session"); return ok(await updateSession(event, s.id, await parseBody(req, sessionInput.partial()))); });
export const DELETE = withApi(async (req: Request, ctx: Ctx) => { const p = await ctx.params; const { event } = await requireEvent(req, p.event, "write"); await deleteSession(event, p.id); return ok({ deleted: true }); });

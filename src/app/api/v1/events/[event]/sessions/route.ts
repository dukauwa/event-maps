import { z } from "zod";
import { ok, optionsResponse, parseBody, requireEvent, withApi } from "@/lib/api/http";
import { bulkUpsertSessions, createSession, listSessions, sessionInput } from "@/lib/services/sessions";

type Ctx = { params: Promise<{ event: string }> };
export const OPTIONS = () => optionsResponse();
export const GET = withApi(async (req: Request, ctx: Ctx) => { const { event } = await requireEvent(req, (await ctx.params).event); return ok(listSessions(event.id)); });
export const POST = withApi(async (req: Request, ctx: Ctx) => {
  const { event } = await requireEvent(req, (await ctx.params).event, "write");
  const body = await parseBody(req, z.union([sessionInput, z.array(sessionInput).max(5000)]));
  if (Array.isArray(body)) return ok(bulkUpsertSessions(event, body));
  return ok(createSession(event, body), { status: 201 });
});

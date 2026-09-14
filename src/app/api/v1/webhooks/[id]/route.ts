import { z } from "zod";
import { notFound, ok, optionsResponse, parseBody, requirePrincipal, withApi } from "@/lib/api/http";
import { deleteWebhook, updateWebhook } from "@/lib/services/webhooks";
import { WEBHOOK_EVENTS } from "@/lib/domain/types";

type Ctx = { params: Promise<{ id: string }> };
const patch = z.object({ url: z.string().url().optional(), eventId: z.string().nullable().optional(), events: z.union([z.array(z.enum(WEBHOOK_EVENTS)), z.tuple([z.literal("*")])]).optional(), active: z.boolean().optional() });
export const OPTIONS = () => optionsResponse();
export const PATCH = withApi(async (req: Request, ctx: Ctx) => { const p = await requirePrincipal(req, "write"); const w = updateWebhook(p.orgId, (await ctx.params).id, await parseBody(req, patch)); if (!w) throw notFound("webhook"); const { secret: _s, ...rest } = w; void _s; return ok(rest); });
export const DELETE = withApi(async (req: Request, ctx: Ctx) => { const p = await requirePrincipal(req, "write"); deleteWebhook(p.orgId, (await ctx.params).id); return ok({ deleted: true }); });

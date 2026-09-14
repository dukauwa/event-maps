import { z } from "zod";
import { ok, optionsResponse, parseBody, requirePrincipal, withApi } from "@/lib/api/http";
import { createWebhook, listWebhooks } from "@/lib/services/webhooks";
import { WEBHOOK_EVENTS } from "@/lib/domain/types";

const input = z.object({ url: z.string().url(), eventId: z.string().nullish(), events: z.union([z.array(z.enum(WEBHOOK_EVENTS)), z.tuple([z.literal("*")])]).optional(), active: z.boolean().optional(), secret: z.string().min(16).max(200).optional() });

export const OPTIONS = () => optionsResponse();
export const GET = withApi(async (req: Request) => { const p = await requirePrincipal(req); return ok(listWebhooks(p.orgId).map(({ secret, ...w }) => ({ ...w, secretPreview: secret.slice(0, 6) + "…" }))); });
/** Create a webhook. The signing `secret` is returned once; verify `X-Tessera-Signature: t=<unix>,v1=<hmac-sha256(secret, "<t>.<body>")>`. */
export const POST = withApi(async (req: Request) => { const p = await requirePrincipal(req, "write"); return ok(createWebhook(p.orgId, await parseBody(req, input)), { status: 201 }); });

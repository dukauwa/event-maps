import { ok, optionsResponse, parseBody, requireEvent, withApi } from "@/lib/api/http";
import { deletePricingRule, pricingRuleInput, updatePricingRule } from "@/lib/services/pricing-rules";

type Ctx = { params: Promise<{ event: string; id: string }> };
export const OPTIONS = () => optionsResponse();
export const PATCH = withApi(async (req: Request, ctx: Ctx) => { const p = await ctx.params; const { event } = await requireEvent(req, p.event, "write"); return ok(updatePricingRule(event.id, p.id, await parseBody(req, pricingRuleInput.partial()))); });
export const DELETE = withApi(async (req: Request, ctx: Ctx) => { const p = await ctx.params; const { event } = await requireEvent(req, p.event, "write"); deletePricingRule(event.id, p.id); return ok({ deleted: true }); });

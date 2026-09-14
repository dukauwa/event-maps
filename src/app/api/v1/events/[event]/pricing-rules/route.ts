import { ok, optionsResponse, parseBody, requireEvent, withApi } from "@/lib/api/http";
import { createPricingRule, listPricingRules, pricingRuleInput } from "@/lib/services/pricing-rules";

type Ctx = { params: Promise<{ event: string }> };
export const OPTIONS = () => optionsResponse();
export const GET = withApi(async (req: Request, ctx: Ctx) => { const { event } = await requireEvent(req, (await ctx.params).event); return ok(listPricingRules(event.id)); });
export const POST = withApi(async (req: Request, ctx: Ctx) => { const { event } = await requireEvent(req, (await ctx.params).event, "write"); return ok(createPricingRule(event.id, await parseBody(req, pricingRuleInput), event.settings.sales.currency), { status: 201 }); });

import { z } from "zod";
import { badRequest, ok, optionsResponse, parseBody, requireEvent, withApi } from "@/lib/api/http";
import { createElement, elementInput, listElements, replaceLevelElements } from "@/lib/services/elements";

type Ctx = { params: Promise<{ event: string }> };
export const OPTIONS = () => optionsResponse();
/** GET `?levelId=` lists elements. POST creates one. PUT `{ levelId, elements }` replaces a level's elements (editor save). */
export const GET = withApi(async (req: Request, ctx: Ctx) => { const { event } = await requireEvent(req, (await ctx.params).event); return ok(listElements(event.id, new URL(req.url).searchParams.get("levelId") ?? undefined)); });
export const POST = withApi(async (req: Request, ctx: Ctx) => { const { event } = await requireEvent(req, (await ctx.params).event, "write"); return ok(createElement(event.id, await parseBody(req, elementInput)), { status: 201 }); });
export const PUT = withApi(async (req: Request, ctx: Ctx) => {
  const { event } = await requireEvent(req, (await ctx.params).event, "write");
  const { levelId, elements } = await parseBody(req, z.object({ levelId: z.string(), elements: z.array(elementInput.omit({ levelId: true }).extend({ levelId: z.string().optional() })).max(20000) }));
  if (elements.some((e) => e.levelId && e.levelId !== levelId)) throw badRequest("All elements must belong to levelId");
  return ok(replaceLevelElements(event.id, levelId, elements.map((e) => ({ ...e, levelId }))));
});

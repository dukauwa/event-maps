import { ok, optionsResponse, requirePrincipal, withApi } from "@/lib/api/http";
import { processPendingDeliveries } from "@/lib/services/webhooks";

export const OPTIONS = () => optionsResponse();
/** Deliver queued/retrying webhooks now (call from a cron if you don't rely on opportunistic delivery). */
export const POST = withApi(async (req: Request) => { await requirePrincipal(req, "write"); return ok(await processPendingDeliveries()); });

import { WEBHOOK_EVENTS } from "@/lib/domain/types";
import { H1, H2, P, Code, Inline } from "../_ui";

export const metadata = { title: "Webhooks" };

export default function WebhookDocs() {
  return (
    <>
      <H1>Webhooks</H1>
      <P>Create a webhook in <Inline>Settings → Webhooks</Inline> or via <Inline>POST /api/v1/webhooks</Inline>. Deliveries are JSON POSTs, signed, retried five times with exponential backoff, and every attempt is visible in the deliveries log.</P>
      <H2>Events</H2>
      <Code>{WEBHOOK_EVENTS.join("\n")}</Code>
      <H2>Payload</H2>
      <Code lang="json">{`{
  "id": "wd_…", "type": "booth.status_changed", "createdAt": "2026-09-14T10:00:00.000Z", "eventId": "ev_…",
  "data": { "booth": { "id": "bo_…", "label": "A101", "status": "sold", "exhibitorIds": ["ex_…"], … }, "previousStatus": "held" }
}`}</Code>
      <H2>Verify the signature</H2>
      <Code lang="js">{`import { createHmac, timingSafeEqual } from "node:crypto";
export function verify(rawBody, header, secret) {
  const { t, v1 } = Object.fromEntries(header.split(",").map((kv) => kv.split("=")));
  const expected = createHmac("sha256", secret).update(\`\${t}.\${rawBody}\`).digest("hex");
  return timingSafeEqual(Buffer.from(v1, "hex"), Buffer.from(expected, "hex")) && Math.abs(Date.now() / 1000 - Number(t)) < 300;
}
// headers: X-Tessera-Signature: t=1726300000,v1=…   X-Tessera-Event: booth.status_changed   X-Tessera-Delivery: wd_…`}</Code>
      <P>ExpoFP integrations that expect <Inline>booth_reserved</Inline>/<Inline>booth_assigned</Inline>/<Inline>exhibitor_upserted</Inline> map onto <Inline>booth.status_changed</Inline>, <Inline>booth.assigned</Inline> and <Inline>exhibitor.updated</Inline>; the payload carries our ids plus <Inline>externalId</Inline>.</P>
    </>
  );
}

import Link from "next/link";
import { BRAND } from "@/lib/brand";
import { H1, H2, P, Code, Inline } from "./_ui";

export const metadata = { title: "Developer docs" };

export default function DocsHome() {
  return (
    <>
      <H1>{BRAND.name} developer docs</H1>
      <P>{BRAND.name} is an interactive floor plan platform: a designer for organisers, booth sales, an attendee viewer with wayfinding, an embed SDK, a REST API and webhooks. Everything ExpoFP&apos;s developer portal offers has an equivalent here, and most of it is a drop-in replacement.</P>
      <H2>Five-minute start</H2>
      <P>1. Get an API key from <Link href="/admin/settings" className="text-primary underline">Organiser portal → Settings → API keys</Link>. The demo database ships with <Inline>tsr_live_demo_9f3b1c7e2a4d6f8b0c1d2e3f4a5b6c7d</Inline>.</P>
      <Code lang="bash">{`# List your events
curl -H "Authorization: Bearer tsr_live_demo_9f3b1c7e2a4d6f8b0c1d2e3f4a5b6c7d" \\
  http://localhost:3000/api/v1/events

# Create an exhibitor and put them in booth A101
curl -X POST -H "Authorization: Bearer $KEY" -H "Content-Type: application/json" \\
  -d '{"name":"Acme Robotics","externalId":"crm-42","boothLabels":["A101"],"website":"https://acme.example"}' \\
  http://localhost:3000/api/v1/events/grip-connect-2026/exhibitors`}</Code>
      <P>2. Embed the map anywhere:</P>
      <Code lang="html">{`<div id="floorplan" style="height:100vh"></div>
<script src="http://localhost:3000/sdk/tessera.js"></script>
<script>
  const fp = new Tessera.FloorPlan({ element: "#floorplan", eventId: "grip-connect-2026",
    onBoothClick: (e) => console.log("booth", e), onInit: (fp) => fp.selectBooth("A101") });
</script>`}</Code>
      <P>3. Subscribe to changes with a <Link href="/docs/webhooks" className="text-primary underline">webhook</Link>, or poll <Inline>/e/&#123;slug&#125;/version.json</Inline>.</P>
      <H2>Concepts</H2>
      <P><strong>Event</strong> → <strong>Levels</strong> (floors, each optionally georeferenced onto a world map) → <strong>Booths</strong> (polygons in metres with a label, type, status and price) and <strong>Elements</strong> (walls, zones, rooms, stages, POIs, text). <strong>Exhibitors</strong> are assigned to booths (many-to-many) and tagged with <strong>Categories</strong>. <strong>Sessions</strong> happen at a booth or a room/stage. The <strong>wayfinding network</strong> is a graph of nodes and edges per level plus <strong>transitions</strong> between levels. Publishing snapshots everything into an immutable <strong>bundle</strong> served to attendees.</P>
      <H2>Where things live</H2>
      <Code>{`/e/{slug}                 attendee viewer          /e/{slug}/embed        iframe target for the SDK
/e/{slug}/data.json       published bundle         /e/{slug}/data.expofp.json  ExpoFP-shaped feed
/x/{token}                exhibitor self-service   /e/{slug}/reserve/{boothId}  public reservation
/admin                    organiser portal         /admin/events/{id}/designer  floor plan designer
/api/v1/...               REST API                 /api/v1/compat/expofp/{action}  ExpoFP API shim
/sdk/tessera.js           embed SDK (IIFE)         /sdk/tessera.esm.js   ES module`}</Code>
    </>
  );
}

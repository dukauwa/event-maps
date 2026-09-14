import { H1, H2, P, Code, Inline, Table } from "../_ui";

export const metadata = { title: "Migrating from ExpoFP" };

export default function MigrateDocs() {
  return (
    <>
      <H1>Migrating from ExpoFP</H1>
      <P>Three compatibility layers keep existing integrations working while you switch: the embed SDK mirrors the <Inline>FloorPlan</Inline> API, an ExpoFP-shaped <Inline>data.json</Inline> is served per event, and the JSON API shim accepts ExpoFP&apos;s POST actions.</P>
      <H2>1. Embed</H2>
      <Table head={["ExpoFP", "Tessera"]} rows={[
        [<Inline key="a">new ExpoFP.FloorPlan(&#123; element, eventId &#125;)</Inline>, <Inline key="b">new Tessera.FloorPlan(&#123; element, eventId, baseUrl &#125;)</Inline>],
        [<Inline key="c">load(&#123; $ref: &quot;https://x.expofp.com/manifest.json&quot; &#125;)</Inline>, <Inline key="d">load(&#123; $ref: &quot;https://HOST/e/x&quot; &#125;)</Inline>],
        [<Inline key="e">https://x.expofp.com/packages/master/expofp.js</Inline>, <Inline key="f">https://HOST/sdk/tessera.js</Inline>],
        ["onFpConfigured / onInit / onBoothClick / onDirection / …", "identical names"],
        ["?booth=A1, ?route:A:B, ?kiosk=1, ?language=de", "?booth=A1, ?route=A,B, ?kiosk=1, ?lang=de"],
      ]} />
      <H2>2. Data feed</H2>
      <P>Point code that reads <Inline>https://&lt;event&gt;.expofp.com/data/data.json</Inline> at <Inline>https://HOST/e/&lt;slug&gt;/data.expofp.json</Inline>. Field names are identical; ids are stable integers.</P>
      <H2>3. JSON API</H2>
      <P>Change the base URL from <Inline>https://app.expofp.com/api/v1/</Inline> to <Inline>https://HOST/api/v1/compat/expofp/</Inline> and keep sending <Inline>token</Inline> in the body (a Tessera API key). Supported actions: list-events, set-webhook-url, list-exhibitors, bulk-read-exhibitors, get-exhibitor, get-exhibitor-id, add-exhibitor, update-exhibitor, delete-exhibitor, set-exhibitor-logo, set-exhibitor-leading-image, list-booths, get-booth, update-booth, add-exhibitor-booth, remove-exhibitor-booth, list-categories, add-category, update-category, remove-category, list-extras, list-exhibitor-extras, add-exhibitor-extra, remove-exhibitor-extra, sessions/get, sessions/upsert, sessions/delete.</P>
      <Code lang="bash">{`curl -X POST https://HOST/api/v1/compat/expofp/list-exhibitors \\
  -H "Content-Type: application/json" -d '{"token":"tsr_live_…","eventId":"grip-connect-2026"}'`}</Code>
      <H2>4. Moving the map itself</H2>
      <P>Export your ExpoFP booth list to Excel, save as CSV with columns <Inline>label, level, x, y, width, height</Inline> (ExpoFP&apos;s <Inline>booths.json</Inline> rect coordinates work directly, units are metres) and import it in the designer, or import the SVG ExpoFP&apos;s designer produces (<Inline>fp.svg</Inline>: every <Inline>&lt;g data-tagname=&quot;efp-booth&quot; id=&quot;b…&quot;&gt;</Inline> becomes a booth). Exhibitors import with ExpoFP&apos;s own Excel template columns.</P>
      <H2>What is better here</H2>
      <P>Automatic aisle-network generation and accessible multi-level routing with an optimised multi-stop planner; the booth array tool and SVG/CSV import in the designer; real-time holds and online checkout with Stripe or invoices; sponsorship extras with limits; heat maps and zero-result search analytics; signed, retried webhooks with a delivery log; a published-version history with instant rollback; self-hosted glyphs and open basemaps (no Google Maps or Mapbox keys); and the whole thing runs on your own infrastructure with SQLite or Postgres.</P>
    </>
  );
}

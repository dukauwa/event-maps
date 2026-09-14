import { SDK_EVENTS, SDK_METHODS } from "@/lib/sdk-protocol";
import { H1, H2, P, Code, Inline, Table } from "../_ui";
import { Playground } from "./playground";

export const metadata = { title: "Embed SDK" };

const METHOD_DOCS: Record<string, string> = {
  selectBooth: "Select booth(s) by label, id or externalId (string or array). Empty string clears.", selectExhibitor: "Select exhibitor(s) by id, slug or externalId.", select: "Open whatever matches: booth → exhibitor → category → session.", selectRoute: "selectRoute(from, to, accessible?) or selectRoute([a, b, c]) with up to 8 waypoints.", selectAccessibleRoute: "Same as selectRoute restricted to accessible edges and lifts.", clearRoute: "Clear the current route (alias deselectRoute).", getRoute: "Current route (RouteResult) or null.", getOptimizedRoutes: "Best visiting order through the given booth labels.", openPlanner: "Open the multi-stop planner, optionally pre-filled.", selectCurrentPosition: "Place the blue dot at plan coordinates (metres) and optionally centre.", deselectCurrentPosition: "Remove the blue dot.", findLocation: "Centre on the user's GPS position (georeferenced plans).", setGpsTrackingEnabled: "Toggle continuous GPS tracking.", setBookmarks: "Replace bookmarked exhibitor/booth ids.", setEntitiesBookmarks: "Typed bookmark seeding ({ type, id|name|externalId, bookmarked }).", setEntitiesVisited: "Mark exhibitors/sessions visited.", setMarkers: "Draw custom markers [{ id, x, y, levelId?, label?, color?, icon? }].", drawCircles: "Draw circles [{ x, y, radius, color? }].", highlightBooths: "Highlight booths by label without selecting.", highlightExhibitors: "Highlight exhibitors' booths.", updateLayerVisibility: "Show/hide a layer: booths, labels, pois, zones, walls, paths, basemap.", getVisibility: "Chrome visibility flags.", setVisibility: "{ controls, levels, header, overlay, searchButtons }.", zoomTo: "Fit the camera to booths/exhibitors without selecting.", setCamera: "{ x, y | lat, lng, levelId, zoom, bearing, pitch, durationMs }.", getCamera: "Current camera.", fitBounds: "Frame the whole level (or given bounds).", getBoothRect: "Plan-space rectangle + centre of a booth.", getBoothsGeometry: "All booth polygons per level (like ExpoFP's booths.json).", convertToGeo: "Plan (x, y) → [lng, lat].", convertFromGeo: "[lng, lat] → plan (x, y).", getGeoConfig: "Georeference of the current level.", getFloors: "Levels.", activateFloor: "Switch level by id, short name or index.", search: "Run the fuzzy search; returns ranked results.", showList: "Open a panel: bookmarks | exhibitors | sessions | categories | language | visited.", applyParameters: "Apply a ViewerParams object or a query string (deep links).", setLanguage: "Switch UI language (alias changeLanguage).", setKiosk: "Toggle kiosk mode.", setTheme: "light | dark.", getState: "Selection, route, level, filters, bookmarks.", reset: "Clear selection/route/filters and refit.",
};

export default function EmbedDocs() {
  return (
    <>
      <H1>Embed SDK</H1>
      <P>The viewer runs inside an iframe and the SDK proxies every method over <Inline>postMessage</Inline>. Method names, options and events mirror ExpoFP&apos;s <Inline>FloorPlan</Inline> API so existing integrations port with a find-and-replace.</P>
      <H2>Install</H2>
      <Code lang="html">{`<!-- Script tag (global Tessera) -->
<script src="https://YOUR-HOST/sdk/tessera.js"></script>

<!-- or as an ES module -->
<script type="module">
  import { load, FloorPlan } from "https://YOUR-HOST/sdk/tessera.esm.js";
  const fp = await load({ $ref: "https://YOUR-HOST/e/grip-connect-2026" });
</script>

<!-- or declaratively -->
<div data-tessera-event="grip-connect-2026" data-base-url="https://YOUR-HOST" style="height:600px"></div>`}</Code>
      <H2>Options</H2>
      <Table head={["Option", "Meaning"]} rows={[
        ["element", "Container element or selector. Defaults to #floorplan, else a full-screen div."],
        ["eventId", "Event slug or id."], ["baseUrl", "Origin of the Tessera server (defaults to where the SDK was loaded from)."],
        ["params", "Initial ViewerParams: booth, exhibitor, category, level, route, from/to/accessible, search, lang, kiosk, plan, position, view, theme, hide, tab…"],
        ["noOverlay / offHistory / ignoreQuery", "Map only; don't touch history; don't read the host URL."],
        ["kiosk, language, consent, theme", "Kiosk mode, UI language, analytics consent ('ask' | 'granted' | 'denied'), theme."],
        ["onInit(fp)", "API is live. Equivalent of ExpoFP's onInit / onFpConfigured."],
        ["on<Event>(payload)", `One handler per event: ${SDK_EVENTS.map((e) => "on" + e[0].toUpperCase() + e.slice(1)).join(", ")}.`],
        ["onEvent(name, payload)", "Catch-all."],
      ]} />
      <H2>Methods</H2>
      <P>Every method returns a Promise. Calls made before <Inline>ready</Inline> are queued.</P>
      <Table head={["Method", "Description"]} rows={SDK_METHODS.map((m) => [<Inline key={m}>{m}()</Inline>, METHOD_DOCS[m] ?? ""])} />
      <H2>Events</H2>
      <Code>{SDK_EVENTS.join(", ")}</Code>
      <P>Payloads: <Inline>boothClick</Inline> → <Inline>&#123; booth, exhibitors &#125;</Inline>; <Inline>details</Inline> → <Inline>&#123; type, id, name, externalId, boothLabels &#125;</Inline>; <Inline>direction</Inline> → RouteResult or null; <Inline>floorActivated</Inline> → level; <Inline>currentPositionChanged</Inline> → <Inline>&#123; x, y, levelId, lngLat &#125;</Inline>; <Inline>exhibitorCustomButtonClick</Inline> → <Inline>&#123; exhibitor, url &#125;</Inline>.</P>
      <H2>Deep links</H2>
      <Code>{`/e/{slug}?booth=A101
/e/{slug}?exhibitor=nimbus-cloud
/e/{slug}?route=A101,T05&accessible=1
/e/{slug}?category=<id>&level=L2&lang=de
/e/{slug}?kiosk=1&position=90,105        (kiosk with a fixed "you are here")
/e/{slug}?hide=header,controls&noOverlay=1&embed=1`}</Code>
      <H2>Playground</H2>
      <Playground />
    </>
  );
}

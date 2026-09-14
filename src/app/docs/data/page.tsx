import { H1, H2, P, Code, Inline } from "../_ui";

export const metadata = { title: "Data formats" };

export default function DataDocs() {
  return (
    <>
      <H1>Data formats</H1>
      <H2>Plan bundle</H2>
      <P>Everything the viewer needs in one JSON document: <Inline>GET /e/&#123;slug&#125;/data.json</Inline> (published) or <Inline>GET /api/v1/events/&#123;slug&#125;/bundle</Inline> (live, authenticated). Coordinates are metres, x to the right, y down; each level can carry a <Inline>georef</Inline> (origin lat/lng, rotation) so the plan can be drawn on a basemap.</P>
      <Code lang="json">{`{
  "format": "tessera.bundle", "formatVersion": 1, "version": 3,
  "event": { "slug": "grip-connect-2026", "name": "…", "venue": { "lat": 51.5083, "lng": 0.0299 }, "settings": { "terms": {…}, "branding": {…}, "features": {…}, "sales": {…} } },
  "levels": [{ "id": "lv_…", "name": "Level 1", "shortName": "L1", "widthM": 200, "heightM": 120, "georef": { "originLat": 51.509, "originLng": 0.026, "rotationDeg": 8, "metersPerUnit": 1 }, "elements": [ { "kind": "poi", "geometry": { "type": "point", "point": [90, 110] }, "props": { "poiType": "entrance", "isDefaultStart": true } } ] }],
  "booths": [{ "id": "bo_…", "levelId": "lv_…", "label": "A101", "polygon": [[14,34],[18,34],[18,38],[14,38]], "center": [16,36], "status": "sold", "boothType": "corner", "areaM2": 16, "priceCents": 744000, "currency": "GBP", "exhibitorIds": ["ex_…"] }],
  "exhibitors": [{ "id": "ex_…", "name": "Nimbus Cloud", "slug": "nimbus-cloud", "categoryIds": ["ca_…"], "boothIds": ["bo_…"], "boothLabels": ["S1"], "featured": true, "sponsorLevel": "platinum" }],
  "categories": [], "sessions": [], "banners": [], "extras": [],
  "wayfinding": { "nodes": [{ "id": "wn_…", "levelId": "lv_…", "x": 12, "y": 30 }], "edges": [{ "from": "wn_…", "to": "wn_…", "accessible": true, "oneWay": false, "virtual": false, "weight": 1 }], "transitions": [{ "kind": "elevator", "accessible": true, "nodeIds": ["wn_…", "wn_…"], "travelSeconds": 90 }] }
}`}</Code>
      <H2>ExpoFP-shaped feed</H2>
      <P><Inline>GET /e/&#123;slug&#125;/data.expofp.json</Inline> returns the same field names ExpoFP serves at <Inline>https://&lt;event&gt;.expofp.com/data/data.json</Inline> (<Inline>title, boothTerm, exhibitors[&#123;id, externalId, name, logo, gallery, description, featured, advertise, categories, country, address, city, zip, phone1, email, customButtonTitle, customButtonUrl, leadingImageUrl, videoUrl&#125;], booths[&#123;id, name, externalId, exhibitors, size&#125;], categories, poiTypes, events</Inline>) with stable integer ids derived from ours.</P>
      <H2>GeoJSON, CSV, offline</H2>
      <P><Inline>/api/v1/events/&#123;slug&#125;/export/geojson</Inline> gives booths, elements and the wayfinding network as WGS84 features (open it in QGIS or MapLibre directly). <Inline>export/booths.csv</Inline> and <Inline>export/exhibitors.csv</Inline> round-trip with the importers. <Inline>export/offline</Inline> packages the bundle with its version for mobile/offline apps; compare with <Inline>/e/&#123;slug&#125;/version.json</Inline> to know when to refresh.</P>
      <H2>CSV import columns</H2>
      <Code>{`booths.csv:     label, level, x, y, width, height, [rotation], [type], [status], [price], [external_id], [notes]
exhibitors.csv: name, [exhibitor_id], [booth(s)], [category] ("A; B" or "Parent/Child"), [description], [address], [city], [zip], [country],
                [phone], [email], [website], [facebook], [instagram], [linkedin], [twitter], [contact_name], [logo_url], [video_url], [tags], [featured]
sessions.csv:   title, start, end, [external_id], [description], [track], [booth], [location] (room/stage name), [speakers] ("Name; Name"), [url]`}</Code>
    </>
  );
}

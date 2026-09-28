"use client";
/**
 * Venue-first event creation. Mirrors the organiser's real order of work: where is the show, what does the
 * hall look like, then how do we sell it — the map is drafted before anyone opens the designer.
 */
import * as React from "react";
import { useRouter } from "next/navigation";
import { api, Button, Field, Input, Select, cn } from "@/components/ui";
import { CURRENCIES, nz, slugify, timezoneOptions } from "@/components/admin/lib";
import { FormRow, Notice, PageHeader, Switch } from "@/components/admin/primitives";
import { footprintBounds, footprintGeoref, footprintPlanOutline, isRectangle, rectFootprint, resizeFootprint, type Footprint } from "@/lib/import/footprint";
import { pointsToPlan, toPlanPolygon } from "@/lib/import/raster-booths";
import type { GeocodeHit } from "@/lib/services/geocode";
import { VenueMap, type VenueBasemap } from "./venue-map";
import { computePlanBooths, DEFAULT_PLAN_STATE, PlanImportStep, type PlanImportState } from "./plan-import-step";

const STEPS = ["Basics", "Venue", "Floor plan", "Booth sales", "Review"] as const;

interface Basics { name: string; slug: string; startsAt: string; endsAt: string; timezone: string }
interface Venue { name: string; address: string; placed: boolean; levelName: string; basemap: VenueBasemap }
interface Sales { enabled: boolean; mode: "reserve" | "buy" | "inquiry"; currency: string; pricePerM2: number; holdMinutes: number; showPrices: boolean; attendeesSeeAvailability: boolean }

const DEFAULT_VENUE: Venue = { name: "", address: "", placed: false, levelName: "Hall 1", basemap: "streets" };
const DEFAULT_FOOTPRINT: Footprint = rectFootprint(51.5074, -0.1278, 0, 200, 120);
const DEFAULT_SALES: Sales = { enabled: true, mode: "reserve", currency: "USD", pricePerM2: 450, holdMinutes: 30, showPrices: true, attendeesSeeAvailability: false };

export function NewEventWizard({ defaultTimezone }: { defaultTimezone: string }) {
  const router = useRouter();
  const [step, setStep] = React.useState(0);
  const [basics, setBasics] = React.useState<Basics>({ name: "", slug: "", startsAt: "", endsAt: "", timezone: defaultTimezone });
  const [slugTouched, setSlugTouched] = React.useState(false);
  const [venue, setVenue] = React.useState<Venue>(DEFAULT_VENUE);
  const [footprint, setFootprint] = React.useState<Footprint>(DEFAULT_FOOTPRINT);
  /** Real width of the uploaded drawing; defaults to the hall's width. */
  const [planWidthM, setPlanWidthM] = React.useState<number | null>(null);
  const [plan, setPlan] = React.useState<PlanImportState>(DEFAULT_PLAN_STATE);
  const [sales, setSales] = React.useState<Sales>(DEFAULT_SALES);
  const [planBusy, setPlanBusy] = React.useState(false);
  const [planError, setPlanError] = React.useState<string | null>(null);
  const [creating, setCreating] = React.useState<string | null>(null);
  const [createError, setCreateError] = React.useState<string | null>(null);
  const tzs = React.useMemo(() => timezoneOptions(), []);

  const loaded = plan.draft?.loaded ?? null;
  const hall = footprintBounds(footprint);
  const planWidth = planWidthM ?? Math.round(hall.width);
  const metersPerPixel = loaded ? planWidth / loaded.width : 1;
  const planHeightM = loaded ? Math.round(loaded.height * metersPerPixel * 100) / 100 : 0;
  // The level covers the hall outline and the drawing, both anchored at the outline's top-left corner.
  const levelWidthM = Math.min(5000, Math.max(hall.width, loaded ? planWidth : 0));
  const levelHeightM = Math.min(5000, Math.max(hall.height, planHeightM));
  const result = React.useMemo(() => computePlanBooths(plan, metersPerPixel), [plan, metersPerPixel]);

  const setB = (k: keyof Basics, v: string) => setBasics((s) => ({ ...s, [k]: v, ...(k === "name" && !slugTouched ? { slug: slugify(v) } : {}) }));
  const patchVenue = (p: Partial<Venue>) => setVenue((s) => ({ ...s, ...p }));
  const patchPlan = (p: Partial<PlanImportState>) => setPlan((s) => ({ ...s, ...p }));
  const patchSales = (p: Partial<Sales>) => setSales((s) => ({ ...s, ...p }));

  const loadFile = React.useCallback(async (file: File | null, page = 1) => {
    if (!file) {
      setPlan((s) => { if (s.draft) URL.revokeObjectURL(s.draft.previewUrl); return { ...s, draft: null }; });
      setPlanError(null);
      return;
    }
    setPlanBusy(true);
    setPlanError(null);
    try {
      const mod = await import("@/lib/import/plan-file");
      const loadedPlan = await mod.loadPlanFile(file, page);
      const blob = await mod.encodeForUpload(loadedPlan.canvas);
      const previewUrl = URL.createObjectURL(blob);
      setPlan((s) => { if (s.draft) URL.revokeObjectURL(s.draft.previewUrl); return { ...s, draft: { file, loaded: loadedPlan, blob, previewUrl } }; });
    } catch (e) {
      setPlanError(`Could not read this file: ${e instanceof Error ? e.message : String(e)}`);
    } finally {
      setPlanBusy(false);
    }
  }, []);

  const canNext = step === 0 ? basics.name.trim().length > 0 : step === 1 ? venue.placed : true;

  const create = async () => {
    setCreating("Creating the event…");
    setCreateError(null);
    try {
      const ev = await api<{ id: string; slug: string }>("/api/v1/events", { method: "POST", json: {
        name: basics.name.trim(), slug: basics.slug.trim() || undefined, timezone: basics.timezone,
        startsAt: basics.startsAt ? new Date(`${basics.startsAt}T09:00:00`).toISOString() : null, endsAt: basics.endsAt ? new Date(`${basics.endsAt}T18:00:00`).toISOString() : null,
        venueName: nz(venue.name), venueAddress: nz(venue.address), venueLat: venue.placed ? footprint.lat : null, venueLng: venue.placed ? footprint.lng : null,
        settings: {
          sales: { enabled: sales.enabled, mode: sales.mode, currency: sales.currency, defaultPricePerM2Cents: Math.round(sales.pricePerM2 * 100), holdMinutes: sales.holdMinutes },
          features: { showPrices: sales.showPrices, showAvailability: sales.attendeesSeeAvailability, allowReservation: sales.enabled, basemap: venue.placed },
        },
      } });
      const levels = await api<{ id: string }[]>(`/api/v1/events/${ev.id}/levels`);
      const level = levels[0];
      if (!level) throw new Error("The event was created without a level");
      let background: Record<string, unknown> | null = null;
      if (plan.draft) {
        setCreating("Uploading the floor plan…");
        const fd = new FormData();
        const ext = plan.draft.blob.type === "image/webp" ? "webp" : plan.draft.blob.type === "image/jpeg" ? "jpg" : "png";
        fd.append("file", new File([plan.draft.blob], `${ev.slug}-plan.${ext}`, { type: plan.draft.blob.type || "image/png" }));
        const media = await api<{ url: string }>("/api/v1/media", { method: "POST", body: fd });
        background = { url: media.url, x: 0, y: 0, width: Math.round(plan.draft.loaded.width * metersPerPixel * 100) / 100, height: Math.round(plan.draft.loaded.height * metersPerPixel * 100) / 100, opacity: 0.7, rotationDeg: 0 };
      }
      setCreating("Placing the hall on the map…");
      await api(`/api/v1/events/${ev.id}/levels/${level.id}`, { method: "PATCH", json: {
        name: venue.levelName.trim() || "Level 1", shortName: (venue.levelName.trim() || "L1").replace(/[^A-Za-z0-9]/g, "").slice(0, 4) || "L1",
        widthM: levelWidthM, heightM: levelHeightM,
        georef: venue.placed ? footprintGeoref(footprint) : null,
        background,
      } });
      if (venue.placed) {
        // The shape drawn on the map becomes the hall's outer walls.
        const outline = footprintPlanOutline(footprint);
        await api(`/api/v1/events/${ev.id}/elements`, { method: "POST", json: { levelId: level.id, kind: "wall", geometry: { type: "polyline", points: [...outline, outline[0]] }, props: { name: "Hall outline", blocksRouting: true }, sortIndex: 0 } });
      }
      if (result.booths.length) {
        setCreating(`Drafting ${result.booths.length} booths…`);
        const withExhibitors = plan.createExhibitors && result.source === "vector";
        const items = result.booths.map((b, i) => {
          const space = b.nameKind === "space";
          const sold = withExhibitors && b.nameKind === "exhibitor" && !!b.name;
          return {
            label: b.label, levelId: level.id, sortIndex: i,
            polygon: b.polygon ? pointsToPlan(b.polygon, { scale: metersPerPixel }) : toPlanPolygon(b.rect, { scale: metersPerPixel }),
            boothType: space ? "custom" : "standard",
            // Named spaces (stages, registration, show office) are not for sale; stands with a company on the plan are taken.
            status: space ? "unavailable" : sold ? "sold" : "available",
            notes: space && b.name ? b.name : null,
            metadata: { ...(b.labelSource === "auto" ? { autoLabel: "1" } : {}), ...(space && b.name ? { name: b.name } : {}) },
          };
        });
        for (let i = 0; i < items.length; i += 2000) await api(`/api/v1/events/${ev.id}/booths`, { method: "POST", json: items.slice(i, i + 2000) });
        if (withExhibitors) {
          // One exhibitor per company, holding every booth its name appears in.
          const byName = new Map<string, string[]>();
          for (const b of result.booths) if (b.name && b.nameKind === "exhibitor") byName.set(b.name, [...(byName.get(b.name) ?? []), b.label]);
          const exhibitors = [...byName].map(([name, boothLabels]) => ({ name, boothLabels }));
          if (exhibitors.length) {
            setCreating(`Adding ${exhibitors.length} exhibitors from the plan…`);
            for (let i = 0; i < exhibitors.length; i += 500) await api(`/api/v1/events/${ev.id}/exhibitors`, { method: "POST", json: exhibitors.slice(i, i + 500) });
          }
        }
      }
      router.push(`/admin/events/${ev.id}/designer`);
    } catch (e) {
      setCreateError(e instanceof Error ? e.message : String(e));
      setCreating(null);
    }
  };

  return (
    <>
      <PageHeader crumbs={[{ href: "/admin", label: "Events" }, { label: "New event" }]} title="Create an event" subtitle="Locate the venue, drop in the existing plan, set up booth sales. The designer opens with a first draft." />
      <ol className="mb-6 flex flex-wrap gap-2 text-sm">
        {STEPS.map((label, i) => (
          <li key={label} className="flex items-center gap-2">
            <button type="button" disabled={i > step && !canNext} onClick={() => i < step && setStep(i)} className={cn("flex items-center gap-2 rounded-full border px-3 py-1", i === step ? "border-primary bg-primary text-white" : i < step ? "border-primary/40 bg-primary/5 text-primary" : "border-border bg-surface text-gray-500")}>
              <span className="grid size-5 place-items-center rounded-full bg-white/20 text-xs font-semibold">{i + 1}</span>{label}
            </button>
            {i < STEPS.length - 1 && <span className="text-gray-300">→</span>}
          </li>
        ))}
      </ol>

      <div className="rounded-xl border border-border bg-surface p-6 shadow-sm">
        {step === 0 && (
          <div className="max-w-2xl space-y-4">
            <FormRow>
              <Field label="Event name"><Input required autoFocus value={basics.name} onChange={(e) => setB("name", e.target.value)} placeholder="Grip Connect 2027" /></Field>
              <Field label="Slug" hint="Public URL: /e/{slug}"><Input value={basics.slug} onChange={(e) => { setSlugTouched(true); setB("slug", slugify(e.target.value)); }} placeholder="grip-connect-2027" pattern="[a-z0-9-]{2,80}" /></Field>
            </FormRow>
            <FormRow cols={3}>
              <Field label="Starts"><Input type="date" value={basics.startsAt} onChange={(e) => setB("startsAt", e.target.value)} /></Field>
              <Field label="Ends"><Input type="date" value={basics.endsAt} min={basics.startsAt || undefined} onChange={(e) => setB("endsAt", e.target.value)} /></Field>
              <Field label="Timezone"><Select value={basics.timezone} onChange={(e) => setB("timezone", e.target.value)}>{tzs.map((t) => <option key={t}>{t}</option>)}</Select></Field>
            </FormRow>
          </div>
        )}

        {step === 1 && (
          <VenueStep venue={venue} footprint={footprint} onPatch={patchVenue} onFootprint={setFootprint} />
        )}

        {step === 2 && (
          <PlanImportStep state={plan} onChange={patchPlan} widthM={planWidth} onWidthM={setPlanWidthM} metersPerPixel={metersPerPixel} result={result} busy={planBusy} error={planError} onFile={(f) => void loadFile(f)} onPage={(p) => { if (plan.draft) void loadFile(plan.draft.file, p); }} />
        )}

        {step === 3 && (
          <div className="max-w-2xl space-y-5">
            <Switch checked={sales.enabled} onChange={(v) => patchSales({ enabled: v })} label="Sell booths from the floor plan" description="Exhibitors get a booking view of the map where available stands are priced and can be reserved or bought. Attendees never see it." />
            {sales.enabled && (
              <>
                <FormRow cols={3}>
                  <Field label="Sales mode" hint="Reserve = hold then invoice · Buy = pay online · Inquiry = request a quote">
                    <Select value={sales.mode} onChange={(e) => patchSales({ mode: e.target.value as Sales["mode"] })}><option value="reserve">Reserve</option><option value="buy">Buy online</option><option value="inquiry">Inquiry</option></Select>
                  </Field>
                  <Field label="Currency"><Select value={sales.currency} onChange={(e) => patchSales({ currency: e.target.value })}>{CURRENCIES.map((c) => <option key={c}>{c}</option>)}</Select></Field>
                  <Field label="Default price per m²"><Input type="number" min={0} step={1} value={sales.pricePerM2} onChange={(e) => patchSales({ pricePerM2: Math.max(0, Number(e.target.value) || 0) })} /></Field>
                </FormRow>
                <FormRow cols={3}>
                  <Field label="Hold time" hint="Minutes a reservation blocks the stand before payment"><Input type="number" min={5} step={5} value={sales.holdMinutes} onChange={(e) => patchSales({ holdMinutes: Math.max(5, Number(e.target.value) || 30) })} /></Field>
                </FormRow>
                <Switch checked={sales.showPrices} onChange={(v) => patchSales({ showPrices: v })} label="Show prices in the booking view" />
                <Switch checked={sales.attendeesSeeAvailability} onChange={(v) => patchSales({ attendeesSeeAvailability: v })} label="Attendees also see availability colours" description="Off by default: the public map shows exhibitors, not what is still for sale." />
              </>
            )}
            <p className="text-xs text-gray-500">Booth types, per-booth prices, add-ons and sponsorship packages are set up under Sales after the event exists.</p>
          </div>
        )}

        {step === 4 && (
          <div className="grid gap-6 md:grid-cols-2">
            <Review title="Event" rows={[["Name", basics.name], ["URL", `/e/${basics.slug || slugify(basics.name)}`], ["Dates", basics.startsAt ? `${basics.startsAt} → ${basics.endsAt || "?"}` : "Not set"], ["Timezone", basics.timezone]]} />
            <Review title="Venue" rows={[["Venue", venue.name || "—"], ["Address", venue.address || "—"], ["Position", venue.placed ? `${footprint.lat.toFixed(5)}, ${footprint.lng.toFixed(5)} · ${footprint.rotationDeg}°` : "Not placed (plan will not sit on a basemap)"], ["Hall outline", `${isRectangle(footprint) ? "rectangle" : `${footprint.points.length} corners`} · ${hall.width} × ${hall.height} m`], ["Level", `${venue.levelName} · ${levelWidthM} × ${levelHeightM} m`]]} />
            <Review title="Floor plan" rows={[["File", plan.draft ? plan.draft.file.name : "None — start from a blank canvas"], ["Background", plan.draft ? `${plan.draft.loaded.width} × ${plan.draft.loaded.height} px at ${metersPerPixel.toFixed(3)} m/px` : "—"], ["Drafted booths", plan.draft && plan.autoDraft ? `${result.booths.length} (${result.booths.filter((b) => b.labelSource === "text").length} named from the plan)` : "0"]]} />
            <Review title="Booth sales" rows={[["Selling", sales.enabled ? `${sales.mode} · ${sales.currency} ${sales.pricePerM2}/m²` : "Off"], ["Booking view", sales.enabled ? `/e/${basics.slug || slugify(basics.name)}/book` : "—"], ["Attendee map", sales.attendeesSeeAvailability ? "shows availability" : "exhibitors only"]]} />
            {createError && <Notice tone="error" className="md:col-span-2">{createError}</Notice>}
          </div>
        )}
      </div>

      <div className="mt-4 flex items-center justify-between">
        <Button variant="ghost" onClick={() => (step === 0 ? router.push("/admin") : setStep(step - 1))} disabled={!!creating}>{step === 0 ? "Cancel" : "Back"}</Button>
        <div className="flex items-center gap-3">
          {creating && <span className="text-sm text-gray-500">{creating}</span>}
          {step < STEPS.length - 1 ? (
            <Button onClick={() => setStep(step + 1)} disabled={!canNext || planBusy}>{step === 2 && !plan.draft ? "Skip, draw from scratch" : "Continue"}</Button>
          ) : (
            <Button onClick={() => void create()} loading={!!creating} disabled={!!creating}>Create event &amp; open designer</Button>
          )}
        </div>
      </div>
    </>
  );
}

function Review({ title, rows }: { title: string; rows: [string, string][] }) {
  return (
    <div className="rounded-lg border border-border p-4">
      <p className="mb-2 text-xs font-semibold uppercase tracking-wide text-gray-500">{title}</p>
      <dl className="space-y-1 text-sm">{rows.map(([k, v]) => <div key={k} className="flex gap-3"><dt className="w-28 shrink-0 text-gray-500">{k}</dt><dd className="min-w-0 break-words font-medium text-gray-900">{v}</dd></div>)}</dl>
    </div>
  );
}

function VenueStep({ venue, footprint, onPatch, onFootprint }: { venue: Venue; footprint: Footprint; onPatch: (p: Partial<Venue>) => void; onFootprint: (f: Footprint) => void }) {
  const [q, setQ] = React.useState("");
  const [hits, setHits] = React.useState<GeocodeHit[]>([]);
  const [searching, setSearching] = React.useState(false);
  const [searched, setSearched] = React.useState(false);
  const search = async (e?: React.FormEvent) => {
    e?.preventDefault();
    if (q.trim().length < 2) return;
    setSearching(true);
    try { setHits(await api<GeocodeHit[]>(`/api/v1/geocode?q=${encodeURIComponent(q.trim())}`)); setSearched(true); } catch { setHits([]); setSearched(true); } finally { setSearching(false); }
  };
  const placeAt = (lng: number, lat: number) => { onFootprint({ ...footprint, lat: Math.round(lat * 1e7) / 1e7, lng: Math.round(lng * 1e7) / 1e7 }); onPatch({ placed: true }); };
  const pick = (h: GeocodeHit) => { onPatch({ name: venue.name || h.name, address: h.address }); placeAt(h.lng, h.lat); setHits([]); setQ(""); setSearched(false); };
  const b = footprintBounds(footprint);
  const rect = isRectangle(footprint);
  const setCoord = (k: "lat" | "lng", v: string) => {
    const n = Number(v);
    if (v === "" || !Number.isFinite(n)) return;
    onFootprint({ ...footprint, [k]: n });
    onPatch({ placed: true });
  };
  return (
    <div className="grid gap-6 lg:grid-cols-[360px_1fr]">
      <div className="space-y-4">
        <form onSubmit={search} className="space-y-2">
          <Field label="Find the venue" hint="Search by venue name or address, or click the map to place the hall.">
            <div className="flex gap-2"><Input value={q} onChange={(e) => setQ(e.target.value)} placeholder="ExCeL London, Messe Berlin, …" /><Button type="submit" variant="outline" loading={searching}>Search</Button></div>
          </Field>
          {hits.length > 0 && (
            <ul className="max-h-56 divide-y divide-border overflow-auto rounded-lg border border-border text-sm">
              {hits.map((h, i) => <li key={i}><button type="button" onClick={() => pick(h)} className="w-full px-3 py-2 text-left hover:bg-gray-50"><span className="block font-medium">{h.name}</span><span className="block truncate text-xs text-gray-500">{h.address}</span></button></li>)}
            </ul>
          )}
          {searched && hits.length === 0 && !searching && <p className="text-xs text-amber-700">No results. Try a city or street, or click the map to place the hall.</p>}
        </form>
        <FormRow cols={1}>
          <Field label="Venue name"><Input value={venue.name} onChange={(e) => onPatch({ name: e.target.value })} placeholder="ExCeL London" /></Field>
          <Field label="Address"><Input value={venue.address} onChange={(e) => onPatch({ address: e.target.value })} /></Field>
        </FormRow>
        <FormRow>
          <Field label="Latitude"><Input type="number" step="any" value={venue.placed ? footprint.lat : ""} onChange={(e) => setCoord("lat", e.target.value)} placeholder="51.5083" /></Field>
          <Field label="Longitude"><Input type="number" step="any" value={venue.placed ? footprint.lng : ""} onChange={(e) => setCoord("lng", e.target.value)} placeholder="0.0299" /></Field>
        </FormRow>
        <div className="rounded-lg border border-border bg-gray-50 p-3">
          <div className="mb-2 flex items-center justify-between gap-2">
            <p className="text-xs font-semibold uppercase tracking-wide text-gray-500">Hall outline</p>
            <span className="text-xs text-gray-500">{rect ? "Rectangle" : `${footprint.points.length} corners`}</span>
          </div>
          <FormRow cols={3}>
            <Field label="Level name"><Input value={venue.levelName} onChange={(e) => onPatch({ levelName: e.target.value })} /></Field>
            <Field label="Width (m)"><Input type="number" min={5} max={5000} value={b.width} onChange={(e) => onFootprint(resizeFootprint(footprint, Math.min(5000, Math.max(5, Number(e.target.value) || 5)), b.height))} /></Field>
            <Field label="Depth (m)"><Input type="number" min={5} max={5000} value={b.height} onChange={(e) => onFootprint(resizeFootprint(footprint, b.width, Math.min(5000, Math.max(5, Number(e.target.value) || 5))))} /></Field>
          </FormRow>
          <Field label={`Rotation: ${footprint.rotationDeg}°`} hint="Turn the outline until it lines up with the building. Satellite view helps." className="mt-3">
            <input type="range" min={-180} max={180} step={0.5} value={footprint.rotationDeg} onChange={(e) => onFootprint({ ...footprint, rotationDeg: Number(e.target.value) })} className="w-full" />
          </Field>
          <ul className="mt-3 space-y-1 text-xs text-gray-600">
            <li><span className="font-medium text-gray-800">Drag a corner</span> to move it · <span className="font-medium text-gray-800">double-click</span> it to remove it</li>
            <li><span className="font-medium text-gray-800">Drag a side</span> to push that wall in or out</li>
            <li><span className="font-medium text-gray-800">Drag the dot</span> in the middle of a side to add a corner</li>
            <li><span className="font-medium text-gray-800">Drag inside</span> the outline to move the whole hall</li>
          </ul>
          {!rect && <Button type="button" size="sm" variant="outline" className="mt-3" onClick={() => onFootprint(rectFootprint(footprint.lat, footprint.lng, footprint.rotationDeg, b.width, b.height))}>Reset to a rectangle</Button>}
        </div>
      </div>
      <div className="relative min-h-[520px] overflow-hidden rounded-xl border border-border">
        <VenueMap footprint={footprint} basemap={venue.basemap} placed={venue.placed} onChange={onFootprint} onPlace={placeAt} className="absolute inset-0" />
        <div className="absolute left-3 top-3 z-10 flex gap-1 rounded-lg bg-white/95 p-1 shadow">
          {(["streets", "satellite"] as const).map((k) => <button key={k} type="button" onClick={() => onPatch({ basemap: k })} className={cn("rounded-md px-2.5 py-1 text-xs font-medium", venue.basemap === k ? "bg-primary text-white" : "text-gray-700 hover:bg-gray-100")}>{k === "streets" ? "Streets" : "Satellite"}</button>)}
        </div>
        {!venue.placed && <div className="pointer-events-none absolute inset-x-0 bottom-3 z-10 mx-auto w-max rounded-full bg-gray-900/85 px-3 py-1 text-xs text-white">Search for the venue or click the map to place the hall</div>}
      </div>
    </div>
  );
}

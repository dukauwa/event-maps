"use client";
import * as React from "react";
import { useRouter } from "next/navigation";
import { api, Button, Field, Input, Select, Textarea } from "@/components/ui";
import { SUPPORTED_LOCALES, type EventSettings, type Locale } from "@/lib/domain/types";
import { LOCALE_NAMES } from "@/lib/i18n";
import { eventApi, fmtDateTime, isoToLocalInput, localInputToIso, nz, slugify, timezoneOptions } from "./lib";
import { Checkbox, ConfirmButton, FormRow, ImageField, Notice, PageHeader, run, Section, Switch, useRefresh } from "./primitives";

export interface SettingsEvent { id: string; slug: string; name: string; subtitle: string | null; description: string | null; startsAt: string | null; endsAt: string | null; timezone: string | null; venueName: string | null; venueAddress: string | null; venueLat: number | null; venueLng: number | null; status: "draft" | "published" | "archived"; settings: EventSettings; publishedVersion: number }

const FEATURE_LABELS: Record<keyof EventSettings["features"], [string, string]> = {
  basemap: ["Basemap", "Show the street map under a georeferenced plan"], threeD: ["3D view", "Extrude booths and zones"], wayfinding: ["Wayfinding", "Route between booths, POIs and entrances"], accessibleRouting: ["Accessible routing", "Step-free option (lifts, ramps)"],
  bookmarks: ["Bookmarks", "Attendees can save booths and sessions"], sharing: ["Sharing", "Share links and personal plans"], kiosk: ["Kiosk mode", "Idle reset and “You are here”"], gps: ["GPS position", "Blue dot when on site"],
  showAvailability: ["Show availability", "Colour booths by status"], showPrices: ["Show prices", "Display booth prices publicly"], allowReservation: ["Allow reservation", "Reserve / buy buttons in the viewer"], search: ["Search", "Exhibitor, booth, category and session search"],
  sessions: ["Sessions", "Agenda tab"], sponsorBanners: ["Sponsor banners", "Rotating banner placements"], exhibitorList: ["Exhibitor list", "Alphabetical list tab"], heatmapAnalytics: ["Heatmap analytics", "Record tap positions for the heatmap"],
};

export function EventSettingsForm({ event, levels, gripConfigured }: { event: SettingsEvent; levels: { id: string; name: string }[]; gripConfigured: boolean }) {
  const { refresh, pending } = useRefresh();
  const router = useRouter();
  const base = eventApi(event.id);
  const s = event.settings;
  const nav = [["general", "General"], ["branding", "Branding"], ["terminology", "Terminology"], ["languages", "Languages"], ["features", "Features"], ["embed", "Embed & links"], ["grip", "Grip integration"], ["danger", "Danger zone"]];
  return (
    <>
      <PageHeader crumbs={[{ href: "/admin", label: "Events" }, { href: `/admin/events/${event.id}`, label: event.name }, { label: "Settings" }]} title="Settings" subtitle={pending ? "Refreshing…" : `${levels.length} level${levels.length === 1 ? "" : "s"} · ${event.status}${event.publishedVersion ? ` · v${event.publishedVersion}` : ""}`} />
      <div className="grid gap-6 lg:grid-cols-[180px_1fr]">
        <nav className="hidden lg:block">
          <ul className="sticky top-6 space-y-0.5 text-sm">{nav.map(([id, label]) => <li key={id}><a href={`#${id}`} className="block rounded-lg px-3 py-1.5 text-gray-600 hover:bg-gray-100 hover:text-gray-900">{label}</a></li>)}</ul>
        </nav>
        <div className="min-w-0 space-y-6">
          <General event={event} base={base} onSaved={refresh} />
          <Branding settings={s} base={base} onSaved={refresh} />
          <Terminology settings={s} base={base} onSaved={refresh} />
          <Languages settings={s} base={base} onSaved={refresh} />
          <Features settings={s} base={base} onSaved={refresh} />
          <EmbedLinks settings={s} base={base} onSaved={refresh} />
          <Grip event={event} base={base} onSaved={refresh} gripConfigured={gripConfigured} />
          <Section id="danger" title="Danger zone" className="border-red-200">
            <div className="space-y-3 text-sm">
              {event.status === "published" && <div className="flex flex-wrap items-center justify-between gap-2"><span>Take the published plan offline. The last snapshot stays available to embeds until you delete the event.</span><ConfirmButton variant="outline" message="Unpublish?" onConfirm={() => run(() => api(`${base}/unpublish`, { method: "POST" }), { success: "Unpublished", onDone: refresh })}>Unpublish</ConfirmButton></div>}
              <div className="flex flex-wrap items-center justify-between gap-2"><span>{event.status === "archived" ? "Restore this archived event to draft." : "Archive the event: hidden from lists, API and viewer still work."}</span><ConfirmButton variant="outline" message={event.status === "archived" ? "Restore?" : "Archive?"} onConfirm={() => run(() => api(base, { method: "PATCH", json: { status: event.status === "archived" ? "draft" : "archived" } }), { success: event.status === "archived" ? "Restored to draft" : "Archived", onDone: refresh })}>{event.status === "archived" ? "Restore" : "Archive"}</ConfirmButton></div>
              <div className="flex flex-wrap items-center justify-between gap-2 border-t border-border pt-3"><span className="text-red-700">Delete the event with all levels, booths, exhibitors, orders and analytics. This cannot be undone.</span><ConfirmButton message={`Delete “${event.name}” permanently?`} onConfirm={() => run(() => api(base, { method: "DELETE" }), { success: "Event deleted", onDone: () => { router.push("/admin"); router.refresh(); } })}>Delete event</ConfirmButton></div>
            </div>
          </Section>
        </div>
      </div>
    </>
  );
}

function SaveBar({ busy, dirty }: { busy: boolean; dirty: boolean }) {
  return <div className="flex items-center justify-end gap-3 pt-2">{dirty && <span className="text-xs text-gray-500">Unsaved changes</span>}<Button type="submit" loading={busy} disabled={!dirty}>Save</Button></div>;
}

function useSection<T>(initial: T, save: (v: T) => Promise<unknown>, onSaved: () => void) {
  const [v, setV] = React.useState<T>(initial);
  const [saved, setSaved] = React.useState(JSON.stringify(initial));
  const [busy, setBusy] = React.useState(false);
  const dirty = JSON.stringify(v) !== saved;
  const submit = async (e: React.FormEvent) => { e.preventDefault(); setBusy(true); const r = await run(() => save(v), { success: "Saved" }); setBusy(false); if (r !== null) { setSaved(JSON.stringify(v)); onSaved(); } };
  const set = <K extends keyof T>(k: K, val: T[K]) => setV((x) => ({ ...x, [k]: val }));
  return { v, set, setV, busy, dirty, submit };
}

function General({ event, base, onSaved }: { event: SettingsEvent; base: string; onSaved: () => void }) {
  const tzs = React.useMemo(() => timezoneOptions(), []);
  const { v, set, busy, dirty, submit } = useSection(
    { name: event.name, slug: event.slug, subtitle: event.subtitle ?? "", description: event.description ?? "", startsAt: isoToLocalInput(event.startsAt, event.timezone), endsAt: isoToLocalInput(event.endsAt, event.timezone), timezone: event.timezone ?? "UTC", venueName: event.venueName ?? "", venueAddress: event.venueAddress ?? "", lat: event.venueLat?.toString() ?? "", lng: event.venueLng?.toString() ?? "", seoTitle: event.settings.seo?.title ?? "", seoDescription: event.settings.seo?.description ?? "" },
    (f) => api(base, { method: "PATCH", json: { name: f.name.trim(), slug: f.slug.trim(), subtitle: nz(f.subtitle), description: nz(f.description), startsAt: localInputToIso(f.startsAt, f.timezone), endsAt: localInputToIso(f.endsAt, f.timezone), timezone: f.timezone, venueName: nz(f.venueName), venueAddress: nz(f.venueAddress), venueLat: f.lat ? Number(f.lat) : null, venueLng: f.lng ? Number(f.lng) : null, settings: { seo: { title: nz(f.seoTitle) ?? undefined, description: nz(f.seoDescription) ?? undefined } } } }),
    onSaved,
  );
  return (
    <Section id="general" title="General" description="Name, dates, venue and public URL.">
      <form onSubmit={submit} className="space-y-4">
        <FormRow><Field label="Name"><Input required value={v.name} onChange={(e) => set("name", e.target.value)} /></Field><Field label="Slug" hint={`Public URL /e/${v.slug || "…"} — changing it breaks existing links`}><Input required value={v.slug} onChange={(e) => set("slug", slugify(e.target.value))} pattern="[a-z0-9-]{2,80}" /></Field></FormRow>
        <Field label="Subtitle"><Input value={v.subtitle} onChange={(e) => set("subtitle", e.target.value)} /></Field>
        <Field label="Description"><Textarea value={v.description} onChange={(e) => set("description", e.target.value)} className="min-h-20" /></Field>
        <FormRow cols={3}><Field label="Starts"><Input type="datetime-local" value={v.startsAt} onChange={(e) => set("startsAt", e.target.value)} /></Field><Field label="Ends"><Input type="datetime-local" value={v.endsAt} onChange={(e) => set("endsAt", e.target.value)} /></Field><Field label="Timezone"><Select value={v.timezone} onChange={(e) => set("timezone", e.target.value)}>{[...new Set([v.timezone, ...tzs])].map((t) => <option key={t}>{t}</option>)}</Select></Field></FormRow>
        <FormRow><Field label="Venue name"><Input value={v.venueName} onChange={(e) => set("venueName", e.target.value)} /></Field><Field label="Venue address"><Input value={v.venueAddress} onChange={(e) => set("venueAddress", e.target.value)} /></Field></FormRow>
        <FormRow cols={4}><Field label="Latitude"><Input type="number" step="any" value={v.lat} onChange={(e) => set("lat", e.target.value)} /></Field><Field label="Longitude"><Input type="number" step="any" value={v.lng} onChange={(e) => set("lng", e.target.value)} /></Field><Field label="SEO title" className="sm:col-span-2"><Input value={v.seoTitle} onChange={(e) => set("seoTitle", e.target.value)} placeholder={event.name} /></Field></FormRow>
        <Field label="SEO description"><Input value={v.seoDescription} onChange={(e) => set("seoDescription", e.target.value)} /></Field>
        <SaveBar busy={busy} dirty={dirty} />
      </form>
    </Section>
  );
}

function ColorInput({ label, value, onChange }: { label: string; value: string; onChange: (v: string) => void }) {
  return (
    <Field label={label}>
      <div className="flex items-center gap-2">
        <input type="color" value={/^#[0-9a-f]{6}$/i.test(value) ? value : "#000000"} onChange={(e) => onChange(e.target.value)} className="h-10 w-12 shrink-0 cursor-pointer rounded-lg border border-border" aria-label={label} />
        <Input value={value} onChange={(e) => onChange(e.target.value)} className="font-mono" />
      </div>
    </Field>
  );
}

function Branding({ settings, base, onSaved }: { settings: EventSettings; base: string; onSaved: () => void }) {
  const b = settings.branding;
  const { v, set, busy, dirty, submit } = useSection(
    { primaryColor: b.primaryColor, accentColor: b.accentColor, logoUrl: b.logoUrl ?? "", fontFamily: b.fontFamily ?? "", mapStyle: b.mapStyle, backgroundColor: b.backgroundColor, customCss: b.customCss ?? "", boothColors: { ...b.boothColors } },
    (f) => api(base, { method: "PATCH", json: { settings: { branding: { primaryColor: f.primaryColor, accentColor: f.accentColor, logoUrl: nz(f.logoUrl) ?? undefined, fontFamily: nz(f.fontFamily) ?? undefined, mapStyle: f.mapStyle, backgroundColor: f.backgroundColor, customCss: nz(f.customCss) ?? undefined, boothColors: f.boothColors } } } }),
    onSaved,
  );
  return (
    <Section id="branding" title="Branding" description="Colours, logo and map style of the public viewer.">
      <form onSubmit={submit} className="space-y-4">
        <FormRow cols={3}><ColorInput label="Primary colour" value={v.primaryColor} onChange={(x) => set("primaryColor", x)} /><ColorInput label="Accent colour" value={v.accentColor} onChange={(x) => set("accentColor", x)} /><ColorInput label="Plan background" value={v.backgroundColor} onChange={(x) => set("backgroundColor", x)} /></FormRow>
        <FormRow><ImageField label="Logo" value={v.logoUrl} onChange={(x) => set("logoUrl", x)} /><div className="space-y-3"><Field label="Map style" hint="Basemap under georeferenced plans"><Select value={v.mapStyle} onChange={(e) => set("mapStyle", e.target.value as typeof v.mapStyle)}><option value="light">Light</option><option value="dark">Dark</option><option value="streets">Streets</option><option value="none">None (plan only)</option></Select></Field><Field label="Font family"><Input value={v.fontFamily} onChange={(e) => set("fontFamily", e.target.value)} placeholder="Inter, system-ui, sans-serif" /></Field></div></FormRow>
        <div>
          <p className="mb-2 text-xs font-medium uppercase tracking-wide text-gray-500">Booth status colours</p>
          <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
            {(Object.keys(v.boothColors) as (keyof typeof v.boothColors)[]).map((k) => <ColorInput key={k} label={k} value={v.boothColors[k]} onChange={(x) => set("boothColors", { ...v.boothColors, [k]: x })} />)}
          </div>
          <div className="mt-3 flex flex-wrap gap-2">{(["available", "held", "reserved", "sold", "unavailable", "sponsor"] as const).map((k) => <span key={k} className="inline-flex items-center gap-1.5 rounded-md px-2 py-1 text-xs" style={{ background: v.boothColors[k], color: v.boothColors.label, border: `1px solid ${v.boothColors.border}` }}>A1 · {k}</span>)}</div>
        </div>
        <Field label="Custom CSS" hint="Injected into the viewer; use sparingly."><Textarea value={v.customCss} onChange={(e) => set("customCss", e.target.value)} className="min-h-24 font-mono text-xs" spellCheck={false} placeholder=".tsr-panel { border-radius: 0 }" /></Field>
        <SaveBar busy={busy} dirty={dirty} />
      </form>
    </Section>
  );
}

function Terminology({ settings, base, onSaved }: { settings: EventSettings; base: string; onSaved: () => void }) {
  const { v, set, busy, dirty, submit } = useSection({ ...settings.terms }, (f) => api(base, { method: "PATCH", json: { settings: { terms: f } } }), onSaved);
  const labels: Record<keyof typeof v, string> = { booth: "Booth (singular)", booths: "Booths (plural)", exhibitor: "Exhibitor (singular)", exhibitors: "Exhibitors (plural)", level: "Level (singular)", levels: "Levels (plural)", reserveButton: "Reserve button" };
  return (
    <Section id="terminology" title="Terminology" description="Rename booths to stands, exhibitors to partners… used across the viewer and this portal.">
      <form onSubmit={submit} className="space-y-4">
        <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-4">{(Object.keys(labels) as (keyof typeof v)[]).map((k) => <Field key={k} label={labels[k]}><Input required value={v[k]} onChange={(e) => set(k, e.target.value)} /></Field>)}</div>
        <SaveBar busy={busy} dirty={dirty} />
      </form>
    </Section>
  );
}

function Languages({ settings, base, onSaved }: { settings: EventSettings; base: string; onSaved: () => void }) {
  const { v, set, busy, dirty, submit } = useSection({ languages: [...settings.languages], locale: settings.locale }, (f) => api(base, { method: "PATCH", json: { settings: { languages: f.languages, locale: f.locale } } }), onSaved);
  const toggle = (l: Locale, on: boolean) => { const next = on ? [...new Set([...v.languages, l])] : v.languages.filter((x) => x !== l); if (!next.length) return; set("languages", next); if (!next.includes(v.locale)) set("locale", next[0]); };
  return (
    <Section id="languages" title="Languages" description="Viewer UI translations. Exhibitor content is shown as entered.">
      <form onSubmit={submit} className="space-y-4">
        <div className="grid grid-cols-2 gap-2 sm:grid-cols-3 lg:grid-cols-5">{SUPPORTED_LOCALES.map((l) => <Checkbox key={l} checked={v.languages.includes(l)} onChange={(on) => toggle(l, on)} label={<span>{LOCALE_NAMES[l]} <span className="text-xs text-gray-400">{l}</span></span>} />)}</div>
        <Field label="Default language" className="max-w-xs"><Select value={v.locale} onChange={(e) => set("locale", e.target.value as Locale)}>{v.languages.map((l) => <option key={l} value={l}>{LOCALE_NAMES[l]}</option>)}</Select></Field>
        <SaveBar busy={busy} dirty={dirty} />
      </form>
    </Section>
  );
}

function Features({ settings, base, onSaved }: { settings: EventSettings; base: string; onSaved: () => void }) {
  const { v, set, busy, dirty, submit } = useSection({ ...settings.features }, (f) => api(base, { method: "PATCH", json: { settings: { features: f } } }), onSaved);
  return (
    <Section id="features" title="Features" description="Turn viewer capabilities on or off.">
      <form onSubmit={submit} className="space-y-4">
        <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">{(Object.keys(FEATURE_LABELS) as (keyof typeof v)[]).map((k) => <Switch key={k} checked={v[k]} onChange={(on) => set(k, on)} label={FEATURE_LABELS[k][0]} description={FEATURE_LABELS[k][1]} />)}</div>
        <SaveBar busy={busy} dirty={dirty} />
      </form>
    </Section>
  );
}

function EmbedLinks({ settings, base, onSaved }: { settings: EventSettings; base: string; onSaved: () => void }) {
  const { v, set, busy, dirty, submit } = useSection({ origins: settings.embed.allowedOrigins.join("\n"), registerUrl: settings.registerUrl ?? "", websiteUrl: settings.websiteUrl ?? "" }, (f) => api(base, { method: "PATCH", json: { settings: { embed: { allowedOrigins: f.origins.split(/\n|,/).map((x) => x.trim()).filter(Boolean) }, registerUrl: nz(f.registerUrl) ?? undefined, websiteUrl: nz(f.websiteUrl) ?? undefined } } }), onSaved);
  return (
    <Section id="embed" title="Embed & links" description="Where the viewer may be embedded and where its buttons send people.">
      <form onSubmit={submit} className="space-y-4">
        <Field label="Allowed embed origins" hint="One per line. * allows any site. Example: https://www.example.com"><Textarea value={v.origins} onChange={(e) => set("origins", e.target.value)} className="min-h-20 font-mono text-xs" spellCheck={false} /></Field>
        <FormRow><Field label="Register URL" hint="“Register” button in the viewer"><Input value={v.registerUrl} onChange={(e) => set("registerUrl", e.target.value)} placeholder="https://" /></Field><Field label="Event website"><Input value={v.websiteUrl} onChange={(e) => set("websiteUrl", e.target.value)} placeholder="https://" /></Field></FormRow>
        <SaveBar busy={busy} dirty={dirty} />
      </form>
    </Section>
  );
}

interface SyncResult { dryRun?: boolean; parsed: number; mapped: number; sample?: { name: string; boothLabels?: string[]; gripId?: string | null }[]; created?: number; updated?: number; errors?: { index: number; error: string }[] }

function Grip({ event, base, onSaved, gripConfigured }: { event: SettingsEvent; base: string; onSaved: () => void; gripConfigured: boolean }) {
  const g = event.settings.grip ?? {};
  const { v, set, busy, dirty, submit } = useSection({ eventId: g.eventId ?? "", sync: g.syncExhibitors ?? false }, (f) => api(base, { method: "PATCH", json: { settings: { grip: { eventId: nz(f.eventId) ?? undefined, syncExhibitors: f.sync } } } }), onSaved);
  const [sourceUrl, setSourceUrl] = React.useState("");
  const [syncing, setSyncing] = React.useState<"dry" | "run" | null>(null);
  const [result, setResult] = React.useState<SyncResult | null>(null);
  const sync = async (dryRun: boolean) => {
    setSyncing(dryRun ? "dry" : "run");
    const r = await run(() => api<SyncResult>(`${base}/integrations/grip/sync`, { method: "POST", json: { ...(sourceUrl.trim() ? { sourceUrl: sourceUrl.trim() } : {}), dryRun } }), { success: dryRun ? undefined : "Sync complete", onDone: () => { if (!dryRun) onSaved(); } });
    setResult(r);
    setSyncing(null);
  };
  return (
    <Section id="grip" title="Grip integration" description="Pull companies from Grip (or any JSON/CSV feed) into this event's exhibitors, matched by Grip id, external id, then name.">
      <form onSubmit={submit} className="space-y-4">
        <FormRow><Field label="Grip event id"><Input value={v.eventId} onChange={(e) => set("eventId", e.target.value)} placeholder="grip-connect-2026" /></Field><div className="pt-5"><Switch checked={v.sync} onChange={(on) => set("sync", on)} label="Keep exhibitors in sync" description="Scheduled sync uses GRIP_API_BASE / GRIP_API_KEY on the server." /></div></FormRow>
        <Notice tone={gripConfigured ? "success" : "info"}>{gripConfigured ? "Grip API credentials are configured on this server." : "GRIP_API_BASE / GRIP_API_KEY are not set on this server — provide a source URL below to sync from an export."}{g.lastSyncAt && <span className="block text-xs">Last sync {fmtDateTime(g.lastSyncAt, event.timezone)}</span>}</Notice>
        <SaveBar busy={busy} dirty={dirty} />
      </form>
      <div className="mt-4 space-y-3 border-t border-border pt-4">
        <Field label="Source URL (optional)" hint="JSON array / { data: [] } or CSV with name, description, website, email, booth, categories…"><Input value={sourceUrl} onChange={(e) => setSourceUrl(e.target.value)} placeholder="https://…/companies.json" /></Field>
        <div className="flex flex-wrap gap-2"><Button variant="outline" loading={syncing === "dry"} disabled={!!syncing} onClick={() => sync(true)}>Preview (dry run)</Button><Button loading={syncing === "run"} disabled={!!syncing} onClick={() => sync(false)}>Sync now</Button></div>
        {result && (
          <Notice tone={result.errors?.length ? "warn" : "success"}>
            <p className="font-medium">{result.dryRun ? "Preview: " : ""}{result.parsed} rows parsed · {result.mapped} exhibitors mapped{!result.dryRun && ` · ${result.created ?? 0} created · ${result.updated ?? 0} updated · ${result.errors?.length ?? 0} errors`}</p>
            {result.sample && result.sample.length > 0 && <ul className="mt-2 list-inside list-disc text-xs">{result.sample.map((x, i) => <li key={i}>{x.name}{x.boothLabels?.length ? ` → ${x.boothLabels.join(", ")}` : ""}{x.gripId ? ` (grip ${x.gripId})` : ""}</li>)}</ul>}
            {result.errors && result.errors.length > 0 && <ul className="mt-2 max-h-32 list-inside list-disc overflow-y-auto text-xs">{result.errors.slice(0, 20).map((e, i) => <li key={i}>Row {e.index + 1}: {e.error}</li>)}</ul>}
          </Notice>
        )}
      </div>
    </Section>
  );
}

"use client";
import * as React from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { api, Badge, Button, Dialog, EmptyState, Field, Input, Select, statusTone } from "@/components/ui";
import { CURRENCIES, fmtDateRange, nz, slugify, timezoneOptions } from "./lib";
import { FormRow, PageHeader, run, Switch } from "./primitives";

export interface EventCard {
  id: string; slug: string; name: string; subtitle: string | null; status: "draft" | "published" | "archived";
  startsAt: string | null; endsAt: string | null; timezone: string | null; venueName: string | null; venueAddress: string | null;
  publishedVersion: number; booths: number; sold: number; available: number; exhibitors: number;
}

export function EventsList({ events }: { events: EventCard[] }) {
  const router = useRouter();
  const [creating, setCreating] = React.useState(false);
  const [dup, setDup] = React.useState<EventCard | null>(null);
  return (
    <>
      <PageHeader title="Events" subtitle={`${events.length} event${events.length === 1 ? "" : "s"} in your organisation`} actions={<Button onClick={() => setCreating(true)}>New event</Button>} />
      {events.length === 0 ? (
        <EmptyState title="No events yet" hint="Create your first event to start designing its floor plan." action={<Button onClick={() => setCreating(true)}>New event</Button>} />
      ) : (
        <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-3">
          {events.map((e) => (
            <article key={e.id} className="flex flex-col rounded-xl border border-border bg-surface p-5 shadow-sm">
              <div className="flex items-start justify-between gap-2">
                <div className="min-w-0">
                  <Link href={`/admin/events/${e.id}`} className="block truncate text-base font-semibold hover:underline">{e.name}</Link>
                  {e.subtitle && <p className="truncate text-sm text-gray-500">{e.subtitle}</p>}
                </div>
                <Badge tone={statusTone[e.status] ?? "gray"}>{e.status}{e.status === "published" ? ` v${e.publishedVersion}` : ""}</Badge>
              </div>
              <dl className="mt-3 space-y-1 text-sm text-gray-600">
                <div className="flex gap-2"><dt className="w-14 shrink-0 text-gray-400">When</dt><dd>{fmtDateRange(e.startsAt, e.endsAt, e.timezone)}</dd></div>
                <div className="flex gap-2"><dt className="w-14 shrink-0 text-gray-400">Where</dt><dd className="truncate">{e.venueName ?? "Venue not set"}</dd></div>
              </dl>
              <div className="mt-4 grid grid-cols-3 gap-2 text-center text-sm">
                <div className="rounded-lg bg-gray-50 py-2"><p className="font-semibold tabular-nums">{e.booths}</p><p className="text-xs text-gray-500">booths</p></div>
                <div className="rounded-lg bg-gray-50 py-2"><p className="font-semibold tabular-nums text-blue-700">{e.sold}</p><p className="text-xs text-gray-500">sold</p></div>
                <div className="rounded-lg bg-gray-50 py-2"><p className="font-semibold tabular-nums text-green-700">{e.available}</p><p className="text-xs text-gray-500">available</p></div>
              </div>
              <div className="mt-4 flex flex-wrap items-center gap-2 border-t border-border pt-3 text-sm">
                <Link href={`/admin/events/${e.id}`} className="font-medium text-primary hover:underline">Open</Link>
                <span className="text-gray-300">·</span>
                <Link href={`/admin/events/${e.id}/designer`} className="text-gray-700 hover:underline">Designer</Link>
                <span className="text-gray-300">·</span>
                <a href={`/e/${e.slug}`} target="_blank" rel="noreferrer" className="text-gray-700 hover:underline">Viewer ↗</a>
                <button type="button" className="ml-auto text-gray-500 hover:text-gray-900" onClick={() => setDup(e)}>Duplicate</button>
              </div>
            </article>
          ))}
        </div>
      )}
      <NewEventDialog open={creating} onClose={() => setCreating(false)} onCreated={(id) => { setCreating(false); router.push(`/admin/events/${id}`); router.refresh(); }} />
      <DuplicateDialog source={dup} onClose={() => setDup(null)} onCreated={(id) => { setDup(null); router.push(`/admin/events/${id}`); router.refresh(); }} />
    </>
  );
}

function NewEventDialog({ open, onClose, onCreated }: { open: boolean; onClose: () => void; onCreated: (id: string) => void }) {
  const [f, setF] = React.useState({ name: "", slug: "", startsAt: "", endsAt: "", timezone: "UTC", venueName: "", venueAddress: "", lat: "", lng: "", currency: "USD" });
  const [slugTouched, setSlugTouched] = React.useState(false);
  const [busy, setBusy] = React.useState(false);
  const tzs = React.useMemo(() => timezoneOptions(), []);
  const set = (k: keyof typeof f, v: string) => setF((s) => ({ ...s, [k]: v, ...(k === "name" && !slugTouched ? { slug: slugify(v) } : {}) }));
  const [prevOpen, setPrevOpen] = React.useState(open);
  if (open !== prevOpen) {
    setPrevOpen(open);
    if (open) { setF({ name: "", slug: "", startsAt: "", endsAt: "", timezone: Intl.DateTimeFormat().resolvedOptions().timeZone || "UTC", venueName: "", venueAddress: "", lat: "", lng: "", currency: "USD" }); setSlugTouched(false); }
  }
  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    setBusy(true);
    const r = await run(() => api<{ id: string }>("/api/v1/events", { method: "POST", json: {
      name: f.name.trim(), slug: f.slug.trim() || undefined, timezone: f.timezone,
      startsAt: f.startsAt ? new Date(`${f.startsAt}T09:00:00`).toISOString() : null, endsAt: f.endsAt ? new Date(`${f.endsAt}T18:00:00`).toISOString() : null,
      venueName: nz(f.venueName), venueAddress: nz(f.venueAddress), venueLat: f.lat ? Number(f.lat) : null, venueLng: f.lng ? Number(f.lng) : null,
      settings: { sales: { currency: f.currency } },
    } }), { success: "Event created" });
    setBusy(false);
    if (r) onCreated(r.id);
  };
  return (
    <Dialog open={open} onClose={onClose} title="New event" wide>
      <form onSubmit={submit} className="space-y-4">
        <FormRow>
          <Field label="Name"><Input required value={f.name} onChange={(e) => set("name", e.target.value)} placeholder="Grip Connect 2027" /></Field>
          <Field label="Slug" hint="Public URL: /e/{slug}"><Input value={f.slug} onChange={(e) => { setSlugTouched(true); set("slug", slugify(e.target.value)); }} placeholder="grip-connect-2027" pattern="[a-z0-9-]{2,80}" /></Field>
        </FormRow>
        <FormRow cols={3}>
          <Field label="Starts"><Input type="date" value={f.startsAt} onChange={(e) => set("startsAt", e.target.value)} /></Field>
          <Field label="Ends"><Input type="date" value={f.endsAt} onChange={(e) => set("endsAt", e.target.value)} min={f.startsAt || undefined} /></Field>
          <Field label="Timezone"><Select value={f.timezone} onChange={(e) => set("timezone", e.target.value)}>{tzs.map((t) => <option key={t}>{t}</option>)}</Select></Field>
        </FormRow>
        <FormRow>
          <Field label="Venue name"><Input value={f.venueName} onChange={(e) => set("venueName", e.target.value)} placeholder="ExCeL London" /></Field>
          <Field label="Venue address"><Input value={f.venueAddress} onChange={(e) => set("venueAddress", e.target.value)} /></Field>
        </FormRow>
        <FormRow cols={3}>
          <Field label="Latitude"><Input type="number" step="any" value={f.lat} onChange={(e) => set("lat", e.target.value)} placeholder="51.5083" /></Field>
          <Field label="Longitude"><Input type="number" step="any" value={f.lng} onChange={(e) => set("lng", e.target.value)} placeholder="0.0299" /></Field>
          <Field label="Currency"><Select value={f.currency} onChange={(e) => set("currency", e.target.value)}>{CURRENCIES.map((c) => <option key={c}>{c}</option>)}</Select></Field>
        </FormRow>
        <div className="flex justify-end gap-2 pt-2">
          <Button type="button" variant="ghost" onClick={onClose}>Cancel</Button>
          <Button type="submit" loading={busy} disabled={!f.name.trim()}>Create event</Button>
        </div>
      </form>
    </Dialog>
  );
}

function DuplicateDialog({ source, onClose, onCreated }: { source: EventCard | null; onClose: () => void; onCreated: (id: string) => void }) {
  const [name, setName] = React.useState("");
  const [slug, setSlug] = React.useState("");
  const [withEx, setWithEx] = React.useState(false);
  const [busy, setBusy] = React.useState(false);
  const [prevSource, setPrevSource] = React.useState<typeof source>(null);
  if (source !== prevSource) {
    setPrevSource(source);
    if (source) {
      const m = source.name.match(/(\d{4})/);
      const next = m ? source.name.replace(m[1], String(Number(m[1]) + 1)) : `${source.name} (copy)`;
      setName(next); setSlug(slugify(next)); setWithEx(false);
    }
  }
  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!source) return;
    setBusy(true);
    const r = await run(() => api<{ id: string }>(`/api/v1/events/${source.id}/duplicate`, { method: "POST", json: { name: name.trim(), slug: slug.trim() || undefined, includeExhibitors: withEx } }), { success: "Event duplicated" });
    setBusy(false);
    if (r) onCreated(r.id);
  };
  return (
    <Dialog open={!!source} onClose={onClose} title="Duplicate for next year">
      <form onSubmit={submit} className="space-y-4">
        <p className="text-sm text-gray-600">Copies the map (levels, booths, elements, wayfinding), pricing rules, categories and settings of <span className="font-medium">{source?.name}</span> into a new draft. Booth statuses reset to available.</p>
        <Field label="Name"><Input required value={name} onChange={(e) => { setName(e.target.value); setSlug(slugify(e.target.value)); }} /></Field>
        <Field label="Slug"><Input value={slug} onChange={(e) => setSlug(slugify(e.target.value))} /></Field>
        <Switch checked={withEx} onChange={setWithEx} label="Include exhibitors" description="Copy exhibitor profiles (booth assignments are not carried over)." />
        <div className="flex justify-end gap-2 pt-2">
          <Button type="button" variant="ghost" onClick={onClose}>Cancel</Button>
          <Button type="submit" loading={busy} disabled={!name.trim()}>Duplicate</Button>
        </div>
      </form>
    </Dialog>
  );
}

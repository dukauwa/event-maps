"use client";
import * as React from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { api, Badge, Button, Dialog, EmptyState, Field, Input, statusTone } from "@/components/ui";
import { fmtDateRange, slugify } from "./lib";
import { PageHeader, run, Switch } from "./primitives";
import { AdminIcon } from "./icons";

export interface EventCard {
  id: string; slug: string; name: string; subtitle: string | null; status: "draft" | "published" | "archived";
  startsAt: string | null; endsAt: string | null; timezone: string | null; venueName: string | null; venueAddress: string | null;
  publishedVersion: number; booths: number; sold: number; available: number; exhibitors: number;
}

export function EventsList({ events }: { events: EventCard[] }) {
  const router = useRouter();
  const [dup, setDup] = React.useState<EventCard | null>(null);
  const newEvent = (
    <Link href="/admin/events/new" className="inline-flex h-9 items-center gap-1.5 rounded-lg bg-primary px-3.5 text-sm font-medium text-white shadow-[inset_0_1px_0_rgba(255,255,255,0.12)] hover:bg-gray-800">
      <AdminIcon name="plus" size={15} /> New event
    </Link>
  );
  return (
    <>
      <PageHeader title="Events" subtitle={`${events.length} event${events.length === 1 ? "" : "s"} in your organisation`} actions={newEvent} />
      {events.length === 0 ? (
        <EmptyState title="No events yet" hint="Locate the venue, drop in the existing plan and the designer opens with a first draft." action={newEvent} />
      ) : (
        <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-3">
          {events.map((e) => {
            const pct = e.booths ? Math.round((e.sold / e.booths) * 100) : 0;
            return (
              <article key={e.id} className="group relative flex flex-col rounded-xl border border-border bg-surface shadow-[var(--shadow-card)] transition-[border-color,box-shadow] hover:border-border-strong hover:shadow-[var(--shadow-pop)]">
                <div className="flex items-start justify-between gap-3 p-5 pb-4">
                  <div className="min-w-0">
                    <h2 className="truncate text-[15px] font-semibold tracking-tight text-gray-900">
                      {/* The stretched link makes the whole card clickable; the footer links sit above it. */}
                      <Link href={`/admin/events/${e.id}`} className="after:absolute after:inset-0 after:rounded-xl focus-visible:outline-none focus-visible:after:ring-[3px] focus-visible:after:ring-[var(--ring)]">{e.name}</Link>
                    </h2>
                    <p className="mt-0.5 truncate text-[13px] text-gray-500">{e.subtitle ?? e.venueName ?? "Venue not set"}</p>
                  </div>
                  <Badge tone={statusTone[e.status] ?? "gray"} className="shrink-0">{e.status}{e.status === "published" ? ` · v${e.publishedVersion}` : ""}</Badge>
                </div>
                <dl className="grid gap-1.5 px-5 text-[13px]">
                  <div className="flex gap-2"><dt className="w-12 shrink-0 text-gray-500">When</dt><dd className="text-gray-800">{fmtDateRange(e.startsAt, e.endsAt, e.timezone)}</dd></div>
                  <div className="flex gap-2"><dt className="w-12 shrink-0 text-gray-500">Where</dt><dd className="truncate text-gray-800">{e.venueName ?? "Not set"}</dd></div>
                </dl>
                <div className="mt-5 px-5">
                  <div className="flex items-baseline justify-between text-[13px]">
                    <span className="text-gray-500">Booths sold</span>
                    <span className="tabular-nums text-gray-900"><span className="font-semibold">{e.sold}</span><span className="text-gray-500"> / {e.booths}</span></span>
                  </div>
                  <div className="mt-2 h-1.5 overflow-hidden rounded-full bg-gray-100" role="progressbar" aria-label={`${e.sold} of ${e.booths} booths sold`} aria-valuemin={0} aria-valuemax={100} aria-valuenow={pct}>
                    <div className="h-full rounded-full bg-brand" style={{ width: `${pct}%` }} />
                  </div>
                  <p className="mt-2 text-xs text-gray-500"><span className="tabular-nums">{e.available}</span> available · <span className="tabular-nums">{e.exhibitors}</span> exhibitor{e.exhibitors === 1 ? "" : "s"}</p>
                </div>
                <div className="relative mt-5 flex items-center gap-1 border-t border-border px-3 py-2 text-[13px]">
                  <Link href={`/admin/events/${e.id}/designer`} className="inline-flex h-8 items-center gap-1.5 rounded-lg px-2 text-gray-700 hover:bg-gray-100 hover:text-gray-900"><AdminIcon name="designer" size={15} />Designer</Link>
                  <a href={`/e/${e.slug}`} target="_blank" rel="noreferrer" className="inline-flex h-8 items-center gap-1.5 rounded-lg px-2 text-gray-700 hover:bg-gray-100 hover:text-gray-900"><AdminIcon name="map" size={15} />Viewer<span className="sr-only"> (opens in a new tab)</span></a>
                  <button type="button" className="ml-auto inline-flex h-8 items-center rounded-lg px-2 text-gray-600 hover:bg-gray-100 hover:text-gray-900" onClick={() => setDup(e)}>Duplicate</button>
                </div>
              </article>
            );
          })}
        </div>
      )}
      <DuplicateDialog source={dup} onClose={() => setDup(null)} onCreated={(id) => { setDup(null); router.push(`/admin/events/${id}`); router.refresh(); }} />
    </>
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

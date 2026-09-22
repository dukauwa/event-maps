"use client";
import * as React from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { api, Badge, Button, Dialog, EmptyState, Field, Input, statusTone } from "@/components/ui";
import { fmtDateRange, slugify } from "./lib";
import { PageHeader, run, Switch } from "./primitives";

export interface EventCard {
  id: string; slug: string; name: string; subtitle: string | null; status: "draft" | "published" | "archived";
  startsAt: string | null; endsAt: string | null; timezone: string | null; venueName: string | null; venueAddress: string | null;
  publishedVersion: number; booths: number; sold: number; available: number; exhibitors: number;
}

export function EventsList({ events }: { events: EventCard[] }) {
  const router = useRouter();
  const [dup, setDup] = React.useState<EventCard | null>(null);
  const newEvent = <Link href="/admin/events/new" className="inline-flex h-10 items-center rounded-lg bg-primary px-4 text-sm font-medium text-white hover:opacity-90">New event</Link>;
  return (
    <>
      <PageHeader title="Events" subtitle={`${events.length} event${events.length === 1 ? "" : "s"} in your organisation`} actions={newEvent} />
      {events.length === 0 ? (
        <EmptyState title="No events yet" hint="Locate the venue, drop in the existing plan and the designer opens with a first draft." action={newEvent} />
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

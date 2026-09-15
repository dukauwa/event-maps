"use client";
import * as React from "react";
import { api, Badge, Button, Dialog, EmptyState, Field, Input, Select, Textarea } from "@/components/ui";
import { eventApi, fmtDate, fmtTime, isoToLocalInput, localInputToIso, nz } from "./lib";
import { ConfirmButton, FormRow, PageHeader, run, SearchInput, useRefresh } from "./primitives";
import { CsvImportDialog } from "./csv-import";

export interface SessionRow { id: string; externalId: string | null; title: string; description: string | null; startsAt: string; endsAt: string; boothId: string | null; elementId: string | null; speakers: { name: string; title?: string; company?: string; avatarUrl?: string }[]; track: string | null; url: string | null }
export interface BoothRef { id: string; label: string }
export interface PlaceRef { id: string; name: string; kind: string; levelName: string }
export interface SessionsEvent { id: string; name: string; timezone: string | null; startsAt: string | null; booth: string }

export function SessionsManager({ event, sessions, booths, places }: { event: SessionsEvent; sessions: SessionRow[]; booths: BoothRef[]; places: PlaceRef[] }) {
  const { refresh, pending } = useRefresh();
  const [q, setQ] = React.useState("");
  const [track, setTrack] = React.useState("");
  const [dialog, setDialog] = React.useState<{ row: SessionRow | null } | null>(null);
  const [importing, setImporting] = React.useState(false);
  const base = eventApi(event.id);
  const boothLabel = React.useMemo(() => new Map(booths.map((b) => [b.id, b.label])), [booths]);
  const placeName = React.useMemo(() => new Map(places.map((p) => [p.id, p.name])), [places]);
  const tracks = React.useMemo(() => [...new Set(sessions.map((s) => s.track).filter((t): t is string => !!t))].sort(), [sessions]);

  const rows = React.useMemo(() => {
    const needle = q.trim().toLowerCase();
    return sessions.filter((s) => (!track || s.track === track) && (!needle || s.title.toLowerCase().includes(needle) || s.speakers.some((sp) => sp.name.toLowerCase().includes(needle)) || s.track?.toLowerCase().includes(needle)));
  }, [sessions, q, track]);
  const days = React.useMemo(() => {
    const m = new Map<string, SessionRow[]>();
    for (const s of rows) { const d = fmtDate(s.startsAt, event.timezone, { weekday: "long", day: "numeric", month: "long", year: "numeric" }); m.set(d, [...(m.get(d) ?? []), s]); }
    return [...m.entries()];
  }, [rows, event.timezone]);
  const location = (s: SessionRow) => s.boothId ? `${event.booth} ${boothLabel.get(s.boothId) ?? "?"}` : s.elementId ? placeName.get(s.elementId) ?? "Unknown location" : null;

  return (
    <>
      <PageHeader crumbs={[{ href: "/admin", label: "Events" }, { href: `/admin/events/${event.id}`, label: event.name }, { label: "Sessions" }]} title="Sessions" subtitle={`${sessions.length} sessions · ${tracks.length} tracks · times in ${event.timezone ?? "UTC"}`}
        actions={<><Button variant="outline" onClick={() => setImporting(true)}>Import CSV</Button><Button onClick={() => setDialog({ row: null })}>New session</Button></>} />
      <div className="mb-4 flex flex-wrap items-center gap-2">
        <SearchInput value={q} onChange={setQ} placeholder="Search title, speaker, track…" className="w-64" />
        <Select value={track} onChange={(e) => setTrack(e.target.value)} className="h-9 w-auto"><option value="">All tracks</option>{tracks.map((t) => <option key={t}>{t}</option>)}</Select>
        <span className="ml-auto text-sm text-gray-500">{rows.length} shown{pending ? " · refreshing…" : ""}</span>
      </div>
      {sessions.length === 0 ? <EmptyState title="No sessions yet" hint="Add talks, workshops and demos; attendees can route to the stage or booth from the agenda." action={<Button onClick={() => setDialog({ row: null })}>New session</Button>} /> : rows.length === 0 ? <EmptyState title="Nothing matches" /> : (
        <div className="space-y-6">
          {days.map(([day, list]) => (
            <section key={day}>
              <h2 className="mb-2 text-sm font-semibold text-gray-700">{day} <span className="font-normal text-gray-400">· {list.length}</span></h2>
              <ul className="divide-y divide-border overflow-hidden rounded-xl border border-border bg-surface">
                {list.map((s) => (
                  <li key={s.id} className="flex flex-wrap items-center gap-3 px-4 py-3 hover:bg-gray-50">
                    <span className="w-28 shrink-0 text-sm tabular-nums text-gray-600">{fmtTime(s.startsAt, event.timezone)} – {fmtTime(s.endsAt, event.timezone)}</span>
                    <div className="min-w-0 flex-1">
                      <button type="button" className="block truncate text-left font-medium hover:underline" onClick={() => setDialog({ row: s })}>{s.title}</button>
                      <p className="truncate text-xs text-gray-500">{[location(s), s.speakers.map((sp) => sp.name).join(", ")].filter(Boolean).join(" · ") || "No location or speakers"}</p>
                    </div>
                    {s.track && <Badge tone="blue">{s.track}</Badge>}
                    <Button size="sm" variant="ghost" onClick={() => setDialog({ row: s })}>Edit</Button>
                  </li>
                ))}
              </ul>
            </section>
          ))}
        </div>
      )}
      {dialog && <SessionDialog event={event} row={dialog.row} booths={booths} places={places} tracks={tracks} onClose={() => setDialog(null)} onSaved={() => { setDialog(null); refresh(); }} />}
      <CsvImportDialog open={importing} onClose={() => { setImporting(false); refresh(); }} endpoint={`${base}/sessions/import`} title="Import sessions from CSV" columns="title, starts_at, ends_at (ISO 8601), description, track, booth (label), location (stage/room name), speakers (name; name), url, external_id" sample={"title,starts_at,ends_at,location,track,speakers\nOpening keynote,2026-11-17T09:30:00Z,2026-11-17T10:15:00Z,Grip Stage,Keynote,Dana Whitfield"} />
    </>
  );
}

function SessionDialog({ event, row, booths, places, tracks, onClose, onSaved }: { event: SessionsEvent; row: SessionRow | null; booths: BoothRef[]; places: PlaceRef[]; tracks: string[]; onClose: () => void; onSaved: () => void }) {
  const defaultStart = row?.startsAt ?? event.startsAt ?? new Date().toISOString();
  const [f, setF] = React.useState({
    title: row?.title ?? "", description: row?.description ?? "", start: isoToLocalInput(defaultStart, event.timezone), end: isoToLocalInput(row?.endsAt ?? new Date(new Date(defaultStart).getTime() + 45 * 60000).toISOString(), event.timezone),
    locType: row?.boothId ? "booth" : row?.elementId ? "place" : "none", boothLabel: row?.boothId ? booths.find((b) => b.id === row.boothId)?.label ?? "" : "", elementId: row?.elementId ?? "", track: row?.track ?? "", url: row?.url ?? "", externalId: row?.externalId ?? "",
    speakers: row?.speakers?.length ? row.speakers.map((s) => ({ name: s.name, title: s.title ?? "", company: s.company ?? "", avatarUrl: s.avatarUrl ?? "" })) : [],
  });
  const [busy, setBusy] = React.useState(false);
  const set = <K extends keyof typeof f>(k: K, v: (typeof f)[K]) => setF((s) => ({ ...s, [k]: v }));
  const save = async (e: React.FormEvent) => {
    e.preventDefault();
    const startsAt = localInputToIso(f.start, event.timezone), endsAt = localInputToIso(f.end, event.timezone);
    if (!startsAt || !endsAt) return;
    const booth = f.locType === "booth" ? booths.find((b) => b.label.toLowerCase() === f.boothLabel.trim().toLowerCase()) : null;
    const body = {
      title: f.title.trim(), description: nz(f.description), startsAt, endsAt, track: nz(f.track), url: nz(f.url), externalId: nz(f.externalId),
      boothId: f.locType === "booth" ? booth?.id ?? null : null, elementId: f.locType === "place" ? f.elementId || null : null,
      speakers: f.speakers.filter((s) => s.name.trim()).map((s) => ({ name: s.name.trim(), ...(s.title.trim() ? { title: s.title.trim() } : {}), ...(s.company.trim() ? { company: s.company.trim() } : {}), ...(s.avatarUrl.trim() ? { avatarUrl: s.avatarUrl.trim() } : {}) })),
    };
    setBusy(true);
    const r = await run(() => row ? api(`${eventApi(event.id)}/sessions/${row.id}`, { method: "PATCH", json: body }) : api(`${eventApi(event.id)}/sessions`, { method: "POST", json: body }), { success: row ? "Saved" : "Session created" });
    setBusy(false);
    if (r) onSaved();
  };
  const boothMatch = f.locType === "booth" && f.boothLabel.trim() ? booths.some((b) => b.label.toLowerCase() === f.boothLabel.trim().toLowerCase()) : true;
  return (
    <Dialog open onClose={onClose} title={row ? "Edit session" : "New session"} wide>
      <form onSubmit={save} className="space-y-4">
        <Field label="Title"><Input required value={f.title} onChange={(e) => set("title", e.target.value)} autoFocus /></Field>
        <FormRow>
          <Field label={`Starts (${event.timezone ?? "UTC"})`}><Input type="datetime-local" required value={f.start} onChange={(e) => set("start", e.target.value)} /></Field>
          <Field label={`Ends (${event.timezone ?? "UTC"})`}><Input type="datetime-local" required value={f.end} onChange={(e) => set("end", e.target.value)} min={f.start || undefined} /></Field>
        </FormRow>
        <FormRow cols={3}>
          <Field label="Location">
            <Select value={f.locType} onChange={(e) => set("locType", e.target.value)}><option value="none">No location</option><option value="booth">{event.booth}</option><option value="place">Stage / room / zone</option></Select>
          </Field>
          {f.locType === "booth" && (
            <Field label={`${event.booth} label`} hint={!boothMatch ? "No booth with this label" : undefined} className="sm:col-span-2">
              <Input list="session-booths" value={f.boothLabel} onChange={(e) => set("boothLabel", e.target.value)} placeholder="A101" />
              <datalist id="session-booths">{booths.slice(0, 500).map((b) => <option key={b.id} value={b.label} />)}</datalist>
            </Field>
          )}
          {f.locType === "place" && (
            <Field label="Named element" hint={places.length === 0 ? "Name a stage, room or zone in the designer first" : undefined} className="sm:col-span-2">
              <Select value={f.elementId} onChange={(e) => set("elementId", e.target.value)}><option value="">Choose…</option>{places.map((p) => <option key={p.id} value={p.id}>{p.name} ({p.kind}, {p.levelName})</option>)}</Select>
            </Field>
          )}
        </FormRow>
        <FormRow cols={3}>
          <Field label="Track"><Input list="session-tracks" value={f.track} onChange={(e) => set("track", e.target.value)} placeholder="Keynote" /><datalist id="session-tracks">{tracks.map((t) => <option key={t} value={t} />)}</datalist></Field>
          <Field label="URL"><Input value={f.url} onChange={(e) => set("url", e.target.value)} placeholder="https://" /></Field>
          <Field label="External id"><Input value={f.externalId} onChange={(e) => set("externalId", e.target.value)} /></Field>
        </FormRow>
        <Field label="Description"><Textarea value={f.description} onChange={(e) => set("description", e.target.value)} className="min-h-20" /></Field>
        <div>
          <span className="mb-1 block text-xs font-medium uppercase tracking-wide text-gray-500">Speakers</span>
          <div className="space-y-2">
            {f.speakers.map((s, i) => (
              <div key={i} className="grid grid-cols-[1fr_1fr_1fr_auto] gap-2">
                <Input placeholder="Name" value={s.name} onChange={(e) => set("speakers", f.speakers.map((x, j) => (j === i ? { ...x, name: e.target.value } : x)))} className="h-9" />
                <Input placeholder="Title" value={s.title} onChange={(e) => set("speakers", f.speakers.map((x, j) => (j === i ? { ...x, title: e.target.value } : x)))} className="h-9" />
                <Input placeholder="Company" value={s.company} onChange={(e) => set("speakers", f.speakers.map((x, j) => (j === i ? { ...x, company: e.target.value } : x)))} className="h-9" />
                <Button type="button" size="sm" variant="ghost" onClick={() => set("speakers", f.speakers.filter((_, j) => j !== i))} aria-label="Remove speaker">✕</Button>
              </div>
            ))}
            <Button type="button" size="sm" variant="outline" onClick={() => set("speakers", [...f.speakers, { name: "", title: "", company: "", avatarUrl: "" }])}>Add speaker</Button>
          </div>
        </div>
        <div className="flex items-center justify-between pt-2">
          {row ? <ConfirmButton message="Delete this session?" onConfirm={() => run(() => api(`${eventApi(event.id)}/sessions/${row.id}`, { method: "DELETE" }), { success: "Deleted", onDone: onSaved })}>Delete</ConfirmButton> : <span />}
          <div className="flex gap-2"><Button type="button" variant="ghost" onClick={onClose}>Cancel</Button><Button type="submit" loading={busy} disabled={!f.title.trim() || !boothMatch}>{row ? "Save" : "Create"}</Button></div>
        </div>
      </form>
    </Dialog>
  );
}

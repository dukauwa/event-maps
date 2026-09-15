"use client";
import * as React from "react";
import Link from "next/link";
import { api, Badge, Button, Dialog, EmptyState, Field, Input, Select, Table, Td, Th } from "@/components/ui";
import { BANNER_PLACEMENTS, type BannerPlacement } from "@/lib/domain/types";
import { eventApi, fmtDate, isoToLocalInput, localInputToIso, nz, pct } from "./lib";
import { ConfirmButton, FormRow, ImageField, PageHeader, run, Section, Switch, useRefresh } from "./primitives";

export interface BannerRow { id: string; exhibitorId: string | null; placement: BannerPlacement; title: string | null; imageUrl: string; linkUrl: string | null; active: boolean; weight: number; startsAt: string | null; endsAt: string | null; impressions: number; clicks: number; createdAt: string }
export interface ExhibitorRef { id: string; name: string; logoUrl: string | null; featured: boolean; sponsorLevel: string | null; boothLabels: string[] }
export interface SponsorsEvent { id: string; name: string; timezone: string | null; exhibitors: string }

const PLACEMENT_LABEL: Record<BannerPlacement, string> = { search_top: "Top of search", list_inline: "Inline in exhibitor list", map_corner: "Map corner", detail_top: "Top of exhibitor details", splash: "Splash on open" };

export function SponsorsManager({ event, banners, exhibitors }: { event: SponsorsEvent; banners: BannerRow[]; exhibitors: ExhibitorRef[] }) {
  const { refresh, pending } = useRefresh();
  const [dialog, setDialog] = React.useState<{ row: BannerRow | null } | null>(null);
  const base = eventApi(event.id);
  const exName = React.useMemo(() => new Map(exhibitors.map((e) => [e.id, e.name])), [exhibitors]);
  const featured = exhibitors.filter((e) => e.featured || e.sponsorLevel);
  const totals = banners.reduce((a, b) => ({ impressions: a.impressions + b.impressions, clicks: a.clicks + b.clicks }), { impressions: 0, clicks: 0 });
  const toggle = async (b: BannerRow) => run(() => api(`${base}/banners/${b.id}`, { method: "PATCH", json: { active: !b.active } }), { success: b.active ? "Banner paused" : "Banner active", onDone: refresh });
  return (
    <>
      <PageHeader crumbs={[{ href: "/admin", label: "Events" }, { href: `/admin/events/${event.id}`, label: event.name }, { label: "Sponsorship & ads" }]} title="Sponsorship & ads" subtitle={`${banners.length} banners · ${totals.impressions.toLocaleString()} impressions · ${totals.clicks.toLocaleString()} clicks (${pct(totals.clicks, totals.impressions)} CTR)${pending ? " · refreshing…" : ""}`} actions={<Button onClick={() => setDialog({ row: null })}>New banner</Button>} />
      <div className="space-y-6">
        <Section title="Banners" description="Weighted rotation per placement; inactive or out-of-date banners are excluded from the published bundle.">
          {banners.length === 0 ? <EmptyState title="No banners yet" hint="Upload a sponsor creative and choose where it appears in the viewer." action={<Button onClick={() => setDialog({ row: null })}>New banner</Button>} /> : (
            <Table>
              <thead><tr><Th>Banner</Th><Th>Placement</Th><Th>Sponsor</Th><Th>Schedule</Th><Th className="text-right">Weight</Th><Th className="text-right">Impr.</Th><Th className="text-right">Clicks</Th><Th>Active</Th><Th className="w-24" /></tr></thead>
              <tbody>
                {banners.map((b) => (
                  <tr key={b.id} className="hover:bg-gray-50">
                    <Td>
                      <button type="button" className="flex items-center gap-3 text-left" onClick={() => setDialog({ row: b })}>
                        {/* eslint-disable-next-line @next/next/no-img-element */}
                        <img src={b.imageUrl} alt="" className="h-10 w-20 rounded border border-border bg-white object-contain" />
                        <span className="min-w-0"><span className="block truncate font-medium hover:underline">{b.title || "Untitled banner"}</span>{b.linkUrl && <span className="block max-w-56 truncate text-xs text-gray-500">{b.linkUrl}</span>}</span>
                      </button>
                    </Td>
                    <Td className="text-gray-600">{PLACEMENT_LABEL[b.placement]}</Td>
                    <Td className="text-gray-600">{b.exhibitorId ? exName.get(b.exhibitorId) ?? "—" : "—"}</Td>
                    <Td className="whitespace-nowrap text-xs text-gray-600">{b.startsAt || b.endsAt ? `${b.startsAt ? fmtDate(b.startsAt, event.timezone) : "…"} → ${b.endsAt ? fmtDate(b.endsAt, event.timezone) : "…"}` : "Always"}</Td>
                    <Td className="text-right tabular-nums">{b.weight}</Td>
                    <Td className="text-right tabular-nums">{b.impressions.toLocaleString()}</Td>
                    <Td className="text-right tabular-nums">{b.clicks.toLocaleString()} <span className="text-xs text-gray-400">{pct(b.clicks, b.impressions)}</span></Td>
                    <Td><Switch checked={b.active} onChange={() => toggle(b)} /></Td>
                    <Td className="text-right"><span className="inline-flex gap-1"><Button size="sm" variant="ghost" onClick={() => setDialog({ row: b })}>Edit</Button><ConfirmButton variant="ghost" onConfirm={() => run(() => api(`${base}/banners/${b.id}`, { method: "DELETE" }), { success: "Banner deleted", onDone: refresh })}>Delete</ConfirmButton></span></Td>
                  </tr>
                ))}
              </tbody>
            </Table>
          )}
        </Section>
        <Section title={`Featured ${event.exhibitors.toLowerCase()} & sponsors`} description="Shown first in lists and in the sponsors strip of the viewer. Manage flags from the exhibitors page." actions={<Link href={`/admin/events/${event.id}/exhibitors?flag=featured`} className="text-sm font-medium text-primary hover:underline">Manage →</Link>}>
          {featured.length === 0 ? <EmptyState title={`No featured ${event.exhibitors.toLowerCase()}`} hint="Mark exhibitors as featured or give them a sponsor level." /> : (
            <ul className="grid gap-2 sm:grid-cols-2 lg:grid-cols-3">
              {featured.map((e) => (
                <li key={e.id} className="flex items-center gap-3 rounded-lg border border-border px-3 py-2">
                  <span className="grid size-9 shrink-0 place-items-center overflow-hidden rounded-md border border-border bg-white">
                    {/* eslint-disable-next-line @next/next/no-img-element */}
                    {e.logoUrl ? <img src={e.logoUrl} alt="" className="max-h-full max-w-full object-contain" /> : <span className="text-xs font-semibold text-gray-400">{e.name[0]}</span>}
                  </span>
                  <span className="min-w-0 flex-1"><span className="block truncate text-sm font-medium">{e.name}</span><span className="block truncate text-xs text-gray-500">{e.boothLabels.join(", ") || "no booth"}</span></span>
                  <span className="flex flex-col items-end gap-1">{e.featured && <Badge tone="purple">featured</Badge>}{e.sponsorLevel && <Badge tone="yellow">{e.sponsorLevel}</Badge>}</span>
                </li>
              ))}
            </ul>
          )}
        </Section>
      </div>
      {dialog && <BannerDialog event={event} row={dialog.row} exhibitors={exhibitors} onClose={() => setDialog(null)} onSaved={() => { setDialog(null); refresh(); }} />}
    </>
  );
}

function BannerDialog({ event, row, exhibitors, onClose, onSaved }: { event: SponsorsEvent; row: BannerRow | null; exhibitors: ExhibitorRef[]; onClose: () => void; onSaved: () => void }) {
  const [f, setF] = React.useState({ title: row?.title ?? "", placement: row?.placement ?? "search_top", imageUrl: row?.imageUrl ?? "", linkUrl: row?.linkUrl ?? "", exhibitorId: row?.exhibitorId ?? "", startsAt: isoToLocalInput(row?.startsAt, event.timezone), endsAt: isoToLocalInput(row?.endsAt, event.timezone), weight: String(row?.weight ?? 1), active: row?.active ?? true });
  const [busy, setBusy] = React.useState(false);
  const save = async (e: React.FormEvent) => {
    e.preventDefault();
    const body = { title: nz(f.title), placement: f.placement, imageUrl: f.imageUrl.trim(), linkUrl: nz(f.linkUrl), exhibitorId: f.exhibitorId || null, startsAt: localInputToIso(f.startsAt, event.timezone), endsAt: localInputToIso(f.endsAt, event.timezone), weight: Math.min(100, Math.max(0, Number(f.weight) || 1)), active: f.active };
    setBusy(true);
    const r = await run(() => row ? api(`${eventApi(event.id)}/banners/${row.id}`, { method: "PATCH", json: body }) : api(`${eventApi(event.id)}/banners`, { method: "POST", json: body }), { success: "Banner saved" });
    setBusy(false);
    if (r) onSaved();
  };
  return (
    <Dialog open onClose={onClose} title={row ? "Edit banner" : "New banner"} wide>
      <form onSubmit={save} className="space-y-4">
        <ImageField label="Creative" value={f.imageUrl} onChange={(v) => setF({ ...f, imageUrl: v })} />
        <FormRow>
          <Field label="Title (internal / alt text)"><Input value={f.title} onChange={(e) => setF({ ...f, title: e.target.value })} /></Field>
          <Field label="Placement"><Select value={f.placement} onChange={(e) => setF({ ...f, placement: e.target.value as BannerPlacement })}>{BANNER_PLACEMENTS.map((p) => <option key={p} value={p}>{PLACEMENT_LABEL[p]}</option>)}</Select></Field>
        </FormRow>
        <FormRow>
          <Field label="Link URL" hint="Leave empty to open the sponsor's exhibitor profile"><Input value={f.linkUrl} onChange={(e) => setF({ ...f, linkUrl: e.target.value })} placeholder="https://" /></Field>
          <Field label="Sponsor (exhibitor)"><Select value={f.exhibitorId} onChange={(e) => setF({ ...f, exhibitorId: e.target.value })}><option value="">None</option>{exhibitors.map((x) => <option key={x.id} value={x.id}>{x.name}</option>)}</Select></Field>
        </FormRow>
        <FormRow cols={3}>
          <Field label={`Starts (${event.timezone ?? "UTC"})`}><Input type="datetime-local" value={f.startsAt} onChange={(e) => setF({ ...f, startsAt: e.target.value })} /></Field>
          <Field label={`Ends (${event.timezone ?? "UTC"})`}><Input type="datetime-local" value={f.endsAt} onChange={(e) => setF({ ...f, endsAt: e.target.value })} /></Field>
          <Field label="Weight (0–100)" hint="Higher = shown more often"><Input type="number" min={0} max={100} value={f.weight} onChange={(e) => setF({ ...f, weight: e.target.value })} /></Field>
        </FormRow>
        <Switch checked={f.active} onChange={(v) => setF({ ...f, active: v })} label="Active" />
        <div className="flex justify-end gap-2"><Button type="button" variant="ghost" onClick={onClose}>Cancel</Button><Button type="submit" loading={busy} disabled={!f.imageUrl.trim()}>{row ? "Save" : "Create"}</Button></div>
      </form>
    </Dialog>
  );
}

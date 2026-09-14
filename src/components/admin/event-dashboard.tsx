"use client";
import * as React from "react";
import Link from "next/link";
import { api, Badge, Button, Dialog, Field, Input, statusTone } from "@/components/ui";
import { formatMoney } from "@/lib/pricing";
import { BRAND } from "@/lib/brand";
import { eventApi, fmtDateRange, fmtDateTime, pct } from "./lib";
import { BarChart, ConfirmButton, CopyButton, Kpi, PageHeader, run, Section, useRefresh } from "./primitives";

export interface DashboardEvent { id: string; slug: string; name: string; subtitle: string | null; status: "draft" | "published" | "archived"; startsAt: string | null; endsAt: string | null; timezone: string | null; venueName: string | null; publishedVersion: number; publishedAt: string | null; updatedAt: string; currency: string }
export interface DashboardSummary { booths: number; byStatus: Record<string, number>; inventoryValueCents: number; soldValueCents: number; paidCents: number; pendingCents: number; areaTotal: number; areaSold: number; currency: string; orders: number }
export interface DashboardAnalytics { uniqueSessions: number; totals: Record<string, number>; byDay: { day: string; views: number; sessions: number; searches: number; routes: number }[]; topExhibitors: { id: string; name: string; views: number }[]; topSearches: { query: string; count: number }[] }
export interface DashboardCounts { exhibitors: number; unassignedExhibitors: number; categories: number; sessions: number; levels: number; banners: number; pendingOrders: number }
export interface VersionRow { id: string; version: number; note: string | null; createdAt: string }

export function EventDashboard({ event, summary, analytics, counts, versions, origin }: { event: DashboardEvent; summary: DashboardSummary; analytics: DashboardAnalytics; counts: DashboardCounts; versions: VersionRow[]; origin: string }) {
  const base = `/admin/events/${event.id}`;
  const s = summary.byStatus;
  const publicUrl = `${origin}/e/${event.slug}`;
  const links: { href: string; label: string; hint: string }[] = [
    { href: `${base}/designer`, label: "Designer", hint: `${counts.levels} level${counts.levels === 1 ? "" : "s"}` },
    { href: `${base}/booths`, label: "Booths", hint: `${summary.booths} booths · ${s.available ?? 0} available` },
    { href: `${base}/exhibitors`, label: "Exhibitors", hint: `${counts.exhibitors} exhibitors · ${counts.unassignedExhibitors} unassigned` },
    { href: `${base}/categories`, label: "Categories", hint: `${counts.categories} categories` },
    { href: `${base}/sessions`, label: "Sessions", hint: `${counts.sessions} sessions` },
    { href: `${base}/sales`, label: "Sales", hint: `${summary.orders} orders · ${counts.pendingOrders} pending` },
    { href: `${base}/sponsors`, label: "Sponsorship & ads", hint: `${counts.banners} banners` },
    { href: `${base}/analytics`, label: "Analytics", hint: `${analytics.uniqueSessions} sessions / 30 d` },
    { href: `${base}/settings`, label: "Settings", hint: "Branding, features, Grip" },
  ];
  const views = analytics.byDay.map((d) => ({ label: d.day.slice(5), value: d.views, sub: `${d.sessions} sessions` }));
  return (
    <>
      <PageHeader
        crumbs={[{ href: "/admin", label: "Events" }, { label: event.name }]}
        title={<span className="flex items-center gap-3">{event.name} <Badge tone={statusTone[event.status] ?? "gray"}>{event.status}</Badge></span>}
        subtitle={<>{fmtDateRange(event.startsAt, event.endsAt, event.timezone)}{event.venueName ? ` · ${event.venueName}` : ""}{event.timezone ? ` · ${event.timezone}` : ""}</>}
        actions={<>
          <Link href={`${base}/designer`} className="inline-flex h-10 items-center rounded-lg border border-border bg-surface px-4 text-sm font-medium hover:bg-gray-50">Open designer</Link>
          <a href={`${publicUrl}?preview=1`} target="_blank" rel="noreferrer" className="inline-flex h-10 items-center rounded-lg border border-border bg-surface px-4 text-sm font-medium hover:bg-gray-50">Preview draft ↗</a>
        </>}
      />

      <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
        <Kpi label="Booths sold" value={<>{s.sold ?? 0} <span className="text-base font-normal text-gray-400">/ {summary.booths}</span></>} hint={`${pct(s.sold ?? 0, summary.booths)} of inventory · ${Math.round(summary.areaSold)} of ${Math.round(summary.areaTotal)} m²`} tone="blue" />
        <Kpi label="Available" value={s.available ?? 0} hint={`${s.held ?? 0} held · ${s.reserved ?? 0} reserved · ${s.unavailable ?? 0} unavailable`} tone="green" />
        <Kpi label="Sold value" value={formatMoney(summary.soldValueCents, summary.currency)} hint={`Inventory ${formatMoney(summary.inventoryValueCents, summary.currency)}`} />
        <Kpi label="Paid / pending" value={formatMoney(summary.paidCents, summary.currency)} hint={`${formatMoney(summary.pendingCents, summary.currency)} pending across ${summary.orders} orders`} tone="orange" />
      </div>

      <div className="mt-6 grid gap-6 lg:grid-cols-3">
        <Section title="Traffic · last 30 days" description={`${analytics.uniqueSessions.toLocaleString()} unique sessions · ${(analytics.totals.view ?? 0).toLocaleString()} views · ${(analytics.totals.search ?? 0).toLocaleString()} searches · ${(analytics.totals.route ?? 0).toLocaleString()} routes`} actions={<Link href={`${base}/analytics`} className="text-sm font-medium text-primary hover:underline">Full analytics →</Link>} className="lg:col-span-2">
          <BarChart data={views} valueLabel="views" />
          <div className="mt-5 grid gap-5 sm:grid-cols-2">
            <div>
              <p className="mb-2 text-xs font-semibold uppercase tracking-wide text-gray-500">Top exhibitors</p>
              {analytics.topExhibitors.length === 0 ? <p className="text-sm text-gray-500">No exhibitor views yet.</p> : (
                <ol className="space-y-1 text-sm">{analytics.topExhibitors.slice(0, 5).map((e, i) => <li key={e.id} className="flex justify-between gap-2"><span className="truncate"><span className="mr-2 text-gray-400">{i + 1}.</span>{e.name}</span><span className="tabular-nums text-gray-500">{e.views}</span></li>)}</ol>
              )}
            </div>
            <div>
              <p className="mb-2 text-xs font-semibold uppercase tracking-wide text-gray-500">Top searches</p>
              {analytics.topSearches.length === 0 ? <p className="text-sm text-gray-500">No searches yet.</p> : (
                <ol className="space-y-1 text-sm">{analytics.topSearches.slice(0, 5).map((q, i) => <li key={q.query} className="flex justify-between gap-2"><span className="truncate"><span className="mr-2 text-gray-400">{i + 1}.</span>{q.query}</span><span className="tabular-nums text-gray-500">{q.count}</span></li>)}</ol>
              )}
            </div>
          </div>
        </Section>

        <PublishPanel event={event} versions={versions} publicUrl={publicUrl} origin={origin} />
      </div>

      <h2 className="mb-3 mt-8 text-base font-semibold">Manage</h2>
      <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
        {links.map((l) => (
          <Link key={l.href} href={l.href} className="group rounded-xl border border-border bg-surface p-4 shadow-sm transition-colors hover:border-primary/40 hover:bg-primary/5">
            <p className="font-medium group-hover:text-primary">{l.label} →</p>
            <p className="mt-0.5 text-sm text-gray-500">{l.hint}</p>
          </Link>
        ))}
      </div>
    </>
  );
}

function PublishPanel({ event, versions, publicUrl, origin }: { event: DashboardEvent; versions: VersionRow[]; publicUrl: string; origin: string }) {
  const { refresh, pending } = useRefresh();
  const [open, setOpen] = React.useState(false);
  const [note, setNote] = React.useState("");
  const [busy, setBusy] = React.useState(false);
  const [showEmbed, setShowEmbed] = React.useState(false);
  const embed = `<div id="floorplan" style="height:100vh"></div>\n<script src="${origin}/sdk/tessera.js"></script>\n<script>\n  new ${BRAND.sdkGlobal}.FloorPlan({ element: "#floorplan", eventId: "${event.slug}", baseUrl: "${origin}" });\n</script>`;
  const iframe = `<iframe src="${publicUrl}/embed" style="width:100%;height:100vh;border:0" allow="geolocation" title="${event.name} floor plan"></iframe>`;
  const publish = async () => {
    setBusy(true);
    const r = await run(() => api<{ version: number }>(`${eventApi(event.id)}/publish`, { method: "POST", json: { note: note.trim() || undefined } }), { success: "Published" });
    setBusy(false);
    if (r) { setOpen(false); setNote(""); refresh(); }
  };
  const unpublish = async () => {
    await run(() => api(`${eventApi(event.id)}/unpublish`, { method: "POST" }), { success: "Unpublished — the public link now returns the last snapshot only if it exists", onDone: refresh });
  };
  const stale = event.publishedAt && event.updatedAt > event.publishedAt;
  return (
    <Section title="Publishing" description={event.status === "published" ? `Version ${event.publishedVersion} · published ${fmtDateTime(event.publishedAt, event.timezone)}` : event.publishedVersion > 0 ? `Draft · last published v${event.publishedVersion}` : "Never published"}>
      <div className="space-y-4">
        {stale && event.status === "published" && <p className="rounded-lg border border-yellow-200 bg-yellow-50 px-3 py-2 text-xs text-yellow-900">Changes since the last publish are not visible to attendees yet.</p>}
        <div className="flex flex-wrap gap-2">
          <Button onClick={() => setOpen(true)} loading={pending}>Publish now</Button>
          {event.status === "published" && <ConfirmButton variant="outline" size="md" message="Take the plan offline?" onConfirm={unpublish}>Unpublish</ConfirmButton>}
        </div>
        <div>
          <p className="mb-1 text-xs font-medium uppercase tracking-wide text-gray-500">Public link</p>
          <div className="flex gap-2">
            <Input readOnly value={publicUrl} className="font-mono text-xs" onFocus={(e) => e.currentTarget.select()} />
            <CopyButton text={publicUrl} size="md" />
          </div>
        </div>
        <div>
          <div className="mb-1 flex items-center justify-between">
            <p className="text-xs font-medium uppercase tracking-wide text-gray-500">Embed</p>
            <button type="button" className="text-xs text-primary hover:underline" onClick={() => setShowEmbed((v) => !v)}>{showEmbed ? "Hide" : "Show snippet"}</button>
          </div>
          {showEmbed && (
            <div className="space-y-2">
              <pre className="overflow-x-auto rounded-lg bg-gray-900 p-3 text-[11px] leading-relaxed text-gray-100"><code>{embed}</code></pre>
              <div className="flex gap-2"><CopyButton text={embed} label="Copy SDK snippet" /><CopyButton text={iframe} label="Copy iframe" /></div>
              <p className="text-xs text-gray-500">Restrict where it can be embedded under Settings → Embed.</p>
            </div>
          )}
        </div>
        {versions.length > 0 && (
          <div>
            <p className="mb-1 text-xs font-medium uppercase tracking-wide text-gray-500">Recent versions</p>
            <ul className="divide-y divide-border rounded-lg border border-border text-sm">
              {versions.slice(0, 4).map((v) => (
                <li key={v.id} className="flex items-center justify-between gap-2 px-3 py-1.5">
                  <span><span className="font-medium">v{v.version}</span>{v.note ? <span className="text-gray-500"> · {v.note}</span> : null}</span>
                  <span className="shrink-0 text-xs text-gray-500">{fmtDateTime(v.createdAt, event.timezone)}</span>
                </li>
              ))}
            </ul>
          </div>
        )}
      </div>
      <Dialog open={open} onClose={() => setOpen(false)} title="Publish floor plan">
        <p className="mb-4 text-sm text-gray-600">Snapshots the current plan, booths, exhibitors and sessions as version {event.publishedVersion + 1}. Attendees and embeds pick it up within a few minutes.</p>
        <Field label="Release note (optional)"><Input value={note} onChange={(e) => setNote(e.target.value)} placeholder="e.g. Added Hall 3, updated sponsor booths" maxLength={500} /></Field>
        <div className="mt-4 flex justify-end gap-2">
          <Button variant="ghost" onClick={() => setOpen(false)}>Cancel</Button>
          <Button onClick={publish} loading={busy}>Publish v{event.publishedVersion + 1}</Button>
        </div>
      </Dialog>
    </Section>
  );
}

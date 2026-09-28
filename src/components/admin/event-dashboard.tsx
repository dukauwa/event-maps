"use client";
import * as React from "react";
import Link from "next/link";
import { api, Badge, Button, Dialog, Field, Input, statusTone } from "@/components/ui";
import { formatMoney } from "@/lib/pricing";
import { BRAND } from "@/lib/brand";
import { eventApi, fmtDateRange, fmtDateTime, pct } from "./lib";
import { BarChart, ConfirmButton, CopyButton, Kpi, Notice, PageHeader, run, Section, useRefresh } from "./primitives";
import { AdminIcon, type AdminIconName } from "./icons";
import { PreviewMenu } from "./preview-menu";

export interface DashboardEvent { id: string; slug: string; name: string; subtitle: string | null; status: "draft" | "published" | "archived"; startsAt: string | null; endsAt: string | null; timezone: string | null; venueName: string | null; publishedVersion: number; publishedAt: string | null; updatedAt: string; currency: string; salesEnabled: boolean }
export interface DashboardSummary { booths: number; byStatus: Record<string, number>; inventoryValueCents: number; soldValueCents: number; paidCents: number; pendingCents: number; areaTotal: number; areaSold: number; currency: string; orders: number }
export interface DashboardAnalytics { uniqueSessions: number; totals: Record<string, number>; byDay: { day: string; views: number; sessions: number; searches: number; routes: number }[]; topExhibitors: { id: string; name: string; views: number }[]; topSearches: { query: string; count: number }[] }
export interface DashboardCounts { exhibitors: number; unassignedExhibitors: number; categories: number; sessions: number; levels: number; banners: number; pendingOrders: number }
export interface VersionRow { id: string; version: number; note: string | null; createdAt: string }

export function EventDashboard({ event, summary, analytics, counts, versions, origin }: { event: DashboardEvent; summary: DashboardSummary; analytics: DashboardAnalytics; counts: DashboardCounts; versions: VersionRow[]; origin: string }) {
  const base = `/admin/events/${event.id}`;
  const s = summary.byStatus;
  const publicUrl = `${origin}/e/${event.slug}`;
  const links: { href: string; label: string; hint: string; icon: AdminIconName }[] = [
    { href: `${base}/designer`, label: "Designer", icon: "designer", hint: `${counts.levels} level${counts.levels === 1 ? "" : "s"}` },
    { href: `${base}/booths`, label: "Booths", icon: "booths", hint: `${summary.booths} booths · ${s.available ?? 0} available` },
    { href: `${base}/exhibitors`, label: "Exhibitors", icon: "exhibitors", hint: `${counts.exhibitors} exhibitors · ${counts.unassignedExhibitors} unassigned` },
    { href: `${base}/categories`, label: "Categories", icon: "tag", hint: `${counts.categories} categories` },
    { href: `${base}/sessions`, label: "Sessions", icon: "sessions", hint: `${counts.sessions} sessions` },
    { href: `${base}/sales`, label: "Sales", icon: "sales", hint: `${summary.orders} orders · ${counts.pendingOrders} pending` },
    { href: `${base}/sponsors`, label: "Sponsorship & ads", icon: "megaphone", hint: `${counts.banners} banners` },
    { href: `${base}/analytics`, label: "Analytics", icon: "analytics", hint: `${analytics.uniqueSessions} sessions / 30 d` },
    { href: `${base}/settings`, label: "Settings", icon: "settings", hint: "Branding, features, Grip" },
  ];
  const views = analytics.byDay.map((d) => ({ label: d.day.slice(5), value: d.views, sub: `${d.sessions} sessions` }));
  return (
    <>
      <PageHeader
        crumbs={[{ href: "/admin", label: "Events" }, { label: event.name }]}
        title={<span className="flex items-center gap-3">{event.name} <Badge tone={statusTone[event.status] ?? "gray"}>{event.status}</Badge></span>}
        subtitle={<>{fmtDateRange(event.startsAt, event.endsAt, event.timezone)}{event.venueName ? ` · ${event.venueName}` : ""}{event.timezone ? ` · ${event.timezone}` : ""}</>}
        actions={<>
          <Link href={`${base}/designer`} className="inline-flex h-9 items-center gap-1.5 rounded-lg border border-border bg-surface px-3.5 text-sm font-medium text-gray-900 shadow-[var(--shadow-card)] hover:border-border-strong hover:bg-gray-50"><AdminIcon name="designer" size={15} />Open designer</Link>
          <PreviewMenu eventId={event.id} slug={event.slug} salesEnabled={event.salesEnabled} />
        </>}
      />

      <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
        <Kpi label="Booths sold" value={<>{s.sold ?? 0} <span className="text-base font-normal text-gray-500">/ {summary.booths}</span></>} hint={`${pct(s.sold ?? 0, summary.booths)} of inventory · ${Math.round(summary.areaSold)} of ${Math.round(summary.areaTotal)} m²`} tone="blue" />
        <Kpi label="Available" value={s.available ?? 0} hint={`${s.held ?? 0} held · ${s.reserved ?? 0} reserved · ${s.unavailable ?? 0} unavailable`} tone="green" />
        <Kpi label="Sold value" value={formatMoney(summary.soldValueCents, summary.currency)} hint={`Inventory ${formatMoney(summary.inventoryValueCents, summary.currency)}`} />
        <Kpi label="Paid / pending" value={formatMoney(summary.paidCents, summary.currency)} hint={`${formatMoney(summary.pendingCents, summary.currency)} pending across ${summary.orders} orders`} tone="orange" />
      </div>

      <div className="mt-6 grid gap-6 lg:grid-cols-3">
        <Section title="Traffic · last 30 days" description={`${analytics.uniqueSessions.toLocaleString()} unique sessions · ${(analytics.totals.view ?? 0).toLocaleString()} views · ${(analytics.totals.search ?? 0).toLocaleString()} searches · ${(analytics.totals.route ?? 0).toLocaleString()} routes`} actions={<Link href={`${base}/analytics`} className="text-sm font-medium text-brand hover:underline underline-offset-4">Full analytics →</Link>} className="lg:col-span-2">
          <BarChart data={views} valueLabel="views" />
          <div className="mt-5 grid gap-5 sm:grid-cols-2">
            <div>
              <p className="mb-2 text-[13px] font-medium text-gray-900">Top exhibitors</p>
              {analytics.topExhibitors.length === 0 ? <p className="text-sm text-gray-500">No exhibitor views yet.</p> : (
                <ol className="divide-y divide-gray-100 text-sm">{analytics.topExhibitors.slice(0, 5).map((e, i) => <li key={e.id} className="flex justify-between gap-2 py-1.5 text-gray-800"><span className="truncate"><span className="mr-2 inline-block w-4 tabular-nums text-gray-500">{i + 1}</span>{e.name}</span><span className="tabular-nums text-gray-500">{e.views}</span></li>)}</ol>
              )}
            </div>
            <div>
              <p className="mb-2 text-[13px] font-medium text-gray-900">Top searches</p>
              {analytics.topSearches.length === 0 ? <p className="text-sm text-gray-500">No searches yet.</p> : (
                <ol className="divide-y divide-gray-100 text-sm">{analytics.topSearches.slice(0, 5).map((q, i) => <li key={q.query} className="flex justify-between gap-2 py-1.5 text-gray-800"><span className="truncate"><span className="mr-2 inline-block w-4 tabular-nums text-gray-500">{i + 1}</span>{q.query}</span><span className="tabular-nums text-gray-500">{q.count}</span></li>)}</ol>
              )}
            </div>
          </div>
        </Section>

        <PublishPanel event={event} versions={versions} publicUrl={publicUrl} origin={origin} />
      </div>

      <h2 className="mb-3 mt-10 text-[15px] font-semibold tracking-tight text-gray-900">Manage</h2>
      <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
        {links.map((l) => (
          <Link key={l.href} href={l.href} className="group flex items-center gap-3.5 rounded-xl border border-border bg-surface p-4 shadow-[var(--shadow-card)] transition-[border-color,box-shadow] hover:border-border-strong hover:shadow-[var(--shadow-pop)]">
            <span className="grid size-9 shrink-0 place-items-center rounded-lg border border-border bg-subtle text-gray-700" aria-hidden><AdminIcon name={l.icon} size={17} /></span>
            <span className="min-w-0 flex-1">
              <span className="block text-sm font-medium text-gray-900">{l.label}</span>
              <span className="mt-0.5 block truncate text-[13px] text-gray-500">{l.hint}</span>
            </span>
            <AdminIcon name="chevron" size={15} className="text-gray-400 transition-transform group-hover:translate-x-0.5 group-hover:text-gray-700" />
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
        {stale && event.status === "published" && <Notice tone="warn" className="text-[13px]">Changes since the last publish are not visible to attendees yet.</Notice>}
        <div className="flex flex-wrap gap-2">
          <Button onClick={() => setOpen(true)} loading={pending}>Publish now</Button>
          {event.status === "published" && <ConfirmButton variant="outline" size="md" message="Take the plan offline?" onConfirm={unpublish}>Unpublish</ConfirmButton>}
        </div>
        <div>
          <p className="mb-1 text-[13px] font-medium text-gray-700">Public link</p>
          <div className="flex gap-2">
            <Input readOnly value={publicUrl} className="font-mono text-xs" onFocus={(e) => e.currentTarget.select()} />
            <CopyButton text={publicUrl} size="md" />
          </div>
        </div>
        <div>
          <div className="mb-1 flex items-center justify-between">
            <p className="text-[13px] font-medium text-gray-700">Embed</p>
            <button type="button" className="text-xs text-brand hover:underline underline-offset-4" onClick={() => setShowEmbed((v) => !v)}>{showEmbed ? "Hide" : "Show snippet"}</button>
          </div>
          {showEmbed && (
            <div className="space-y-2">
              <pre className="overflow-x-auto rounded-lg bg-[#0f1219] p-3 font-mono text-[11px] leading-relaxed text-gray-100"><code>{embed}</code></pre>
              <div className="flex gap-2"><CopyButton text={embed} label="Copy SDK snippet" /><CopyButton text={iframe} label="Copy iframe" /></div>
              <p className="text-xs text-gray-500">Restrict where it can be embedded under Settings → Embed.</p>
            </div>
          )}
        </div>
        {versions.length > 0 && (
          <div>
            <p className="mb-1 text-[13px] font-medium text-gray-700">Recent versions</p>
            <ul className="divide-y divide-border overflow-hidden rounded-lg border border-border text-sm">
              {versions.slice(0, 4).map((v) => (
                <li key={v.id} className="flex items-center justify-between gap-2 px-3 py-2">
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

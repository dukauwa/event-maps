"use client";
import * as React from "react";
import { useRouter } from "next/navigation";
import { Button, Input, Select } from "@/components/ui";
import type { AnalyticsSummary } from "@/lib/services/analytics";
import { downloadText, fmtDate, pct, toCsv } from "./lib";
import { BarChart, Kpi, PageHeader, Section } from "./primitives";

export interface HeatLevel { id: string; name: string; shortName: string; widthM: number; heightM: number; booths: { id: string; label: string; polygon: [number, number][]; status: string }[]; outline: [number, number][][] }
export interface AnalyticsEvent { id: string; name: string; slug: string; timezone: string | null; boothColors: Record<string, string> }

const METRICS = [{ key: "views", label: "Views" }, { key: "sessions", label: "Sessions" }, { key: "searches", label: "Searches" }, { key: "routes", label: "Routes" }] as const;

export function AnalyticsView({ event, summary, levels, from, to }: { event: AnalyticsEvent; summary: AnalyticsSummary; levels: HeatLevel[]; from: string; to: string }) {
  const router = useRouter();
  const [range, setRange] = React.useState({ from, to });
  const [metric, setMetric] = React.useState<(typeof METRICS)[number]["key"]>("views");
  const [levelId, setLevelId] = React.useState(levels.find((l) => summary.heatmap.some((h) => h.levelId === l.id))?.id ?? levels[0]?.id ?? "");
  const t = summary.totals;
  const apply = (f: string, tt: string) => router.push(`/admin/events/${event.id}/analytics?from=${f}&to=${tt}`);
  const preset = (days: number) => { const end = new Date(); const start = new Date(end.getTime() - days * 86400e3); const f = start.toISOString().slice(0, 10), tt = end.toISOString().slice(0, 10); setRange({ from: f, to: tt }); apply(f, tt); };
  const chart = summary.byDay.map((d) => ({ label: d.day.slice(5), value: d[metric], sub: d.day }));
  const deviceTotal = Object.values(summary.devices).reduce((a, b) => a + b, 0);
  const exportCsv = () => {
    const rows = [
      ...summary.byDay.map((d) => ({ section: "by_day", key: d.day, views: d.views, sessions: d.sessions, searches: d.searches, routes: d.routes })),
      ...summary.topExhibitors.map((e) => ({ section: "top_exhibitors", key: e.name, views: e.views, bookmarks: e.bookmarks, routes: e.routes })),
      ...summary.topBooths.map((b) => ({ section: "top_booths", key: b.label, clicks: b.clicks })),
      ...summary.topCategories.map((c) => ({ section: "top_categories", key: c.name, count: c.count })),
      ...summary.topSearches.map((s) => ({ section: "top_searches", key: s.query, count: s.count })),
      ...summary.zeroResultSearches.map((s) => ({ section: "zero_result_searches", key: s.query, count: s.count })),
      ...Object.entries(summary.devices).map(([k, v]) => ({ section: "devices", key: k, count: v })),
    ];
    downloadText(`${event.slug}-analytics-${from}-${to}.csv`, toCsv(rows, ["section", "key", "views", "sessions", "searches", "routes", "bookmarks", "clicks", "count"]));
  };
  const level = levels.find((l) => l.id === levelId);
  const heat = summary.heatmap.filter((h) => h.levelId === levelId);
  const maxW = Math.max(1, ...heat.map((h) => h.weight));

  return (
    <>
      <PageHeader crumbs={[{ href: "/admin", label: "Events" }, { href: `/admin/events/${event.id}`, label: event.name }, { label: "Analytics" }]} title="Analytics" subtitle={`${fmtDate(summary.range.from, event.timezone)} – ${fmtDate(summary.range.to, event.timezone)}`}
        actions={<>
          <div className="flex items-center gap-1 rounded-lg border border-border bg-surface p-1">
            {[7, 14, 30, 90].map((d) => <Button key={d} size="sm" variant="ghost" onClick={() => preset(d)}>{d}d</Button>)}
          </div>
          <Input type="date" value={range.from} onChange={(e) => setRange({ ...range, from: e.target.value })} className="w-40" aria-label="From" />
          <Input type="date" value={range.to} onChange={(e) => setRange({ ...range, to: e.target.value })} className="w-40" aria-label="To" />
          <Button variant="outline" onClick={() => apply(range.from, range.to)}>Apply</Button>
          <Button variant="outline" onClick={exportCsv}>Export CSV</Button>
        </>} />

      <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
        <Kpi label="Unique sessions" value={summary.uniqueSessions.toLocaleString()} hint={`${(t.view ?? 0).toLocaleString()} views`} tone="blue" />
        <Kpi label="Searches" value={(t.search ?? 0).toLocaleString()} hint={`${summary.zeroResultSearches.reduce((a, s) => a + s.count, 0)} with no results`} />
        <Kpi label="Routes" value={(t.route ?? 0).toLocaleString()} hint={`${(t.booth_click ?? 0).toLocaleString()} booth clicks`} tone="green" />
        <Kpi label="Engagement" value={((t.exhibitor_view ?? 0) + (t.bookmark ?? 0) + (t.share ?? 0)).toLocaleString()} hint={`${(t.exhibitor_view ?? 0).toLocaleString()} exhibitor views · ${(t.bookmark ?? 0).toLocaleString()} bookmarks · ${(t.share ?? 0).toLocaleString()} shares`} tone="orange" />
      </div>

      <div className="mt-6 grid gap-6 lg:grid-cols-3">
        <Section title="By day" className="lg:col-span-2" actions={<Select value={metric} onChange={(e) => setMetric(e.target.value as typeof metric)} className="h-8 w-auto">{METRICS.map((m) => <option key={m.key} value={m.key}>{m.label}</option>)}</Select>}>
          <BarChart data={chart} valueLabel={metric} />
        </Section>
        <Section title="Devices">
          {deviceTotal === 0 ? <p className="text-sm text-gray-500">No views yet.</p> : (
            <ul className="space-y-3">
              {Object.entries(summary.devices).sort((a, b) => b[1] - a[1]).map(([k, v]) => (
                <li key={k}>
                  <div className="mb-1 flex justify-between text-sm"><span className="capitalize">{k}</span><span className="tabular-nums text-gray-500">{v.toLocaleString()} · {pct(v, deviceTotal)}</span></div>
                  <div className="h-2 overflow-hidden rounded-full bg-gray-100"><div className="h-full rounded-full bg-primary" style={{ width: pct(v, deviceTotal) }} /></div>
                </li>
              ))}
            </ul>
          )}
          <div className="mt-6 space-y-1 text-sm">
            <p className="text-xs font-semibold uppercase tracking-wide text-gray-500">All events</p>
            {Object.entries(t).sort((a, b) => b[1] - a[1]).map(([k, v]) => <div key={k} className="flex justify-between"><span className="text-gray-600">{k.replace(/_/g, " ")}</span><span className="tabular-nums">{v.toLocaleString()}</span></div>)}
          </div>
        </Section>
      </div>

      <div className="mt-6 grid gap-6 md:grid-cols-2 xl:grid-cols-3">
        <TopList title="Top exhibitors" rows={summary.topExhibitors.map((e) => ({ id: e.id, label: e.name, value: e.views, sub: `${e.bookmarks} bookmarks · ${e.routes} routes` }))} unit="views" />
        <TopList title="Top booths" rows={summary.topBooths.map((b) => ({ id: b.id, label: b.label, value: b.clicks }))} unit="clicks" />
        <TopList title="Top categories" rows={summary.topCategories.map((c) => ({ id: c.id, label: c.name, value: c.count }))} unit="selections" />
        <TopList title="Top searches" rows={summary.topSearches.map((s) => ({ id: s.query, label: s.query, value: s.count }))} unit="searches" />
        <TopList title="Zero-result searches" description="Attendees looked for these and found nothing — add exhibitors, tags or aliases." rows={summary.zeroResultSearches.map((s) => ({ id: s.query, label: s.query, value: s.count }))} unit="searches" tone="warn" />
      </div>

      <Section title="Heatmap" description="Where attendees tapped and routed on the plan, bucketed to 4 m cells." className="mt-6" actions={<Select value={levelId} onChange={(e) => setLevelId(e.target.value)} className="h-8 w-auto">{levels.map((l) => <option key={l.id} value={l.id}>{l.name}</option>)}</Select>}>
        {!level ? <p className="text-sm text-gray-500">No levels.</p> : (
          <div className="overflow-x-auto">
            <svg viewBox={`0 0 ${level.widthM} ${level.heightM}`} className="mx-auto h-auto w-full max-w-4xl rounded-lg border border-border bg-gray-50" role="img" aria-label={`Heatmap of ${level.name}`}>
              {level.outline.map((pts, i) => <polyline key={i} points={pts.map((p) => p.join(",")).join(" ")} fill="none" stroke="#9ca3af" strokeWidth={0.4} />)}
              {level.booths.map((b) => <polygon key={b.id} points={b.polygon.map((p) => p.join(",")).join(" ")} fill={event.boothColors[b.status] ?? "#d1d5db"} fillOpacity={0.35} stroke="#ffffff" strokeWidth={0.2}><title>{b.label}</title></polygon>)}
              {heat.map((h, i) => <circle key={i} cx={h.x} cy={h.y} r={1.5 + 4 * Math.sqrt(h.weight / maxW)} fill="var(--accent)" fillOpacity={0.25 + 0.5 * (h.weight / maxW)}><title>{h.weight} interactions</title></circle>)}
            </svg>
            {heat.length === 0 && <p className="mt-2 text-center text-sm text-gray-500">No positioned interactions on this level in the selected range.</p>}
          </div>
        )}
      </Section>
    </>
  );
}

function TopList({ title, description, rows, unit, tone }: { title: string; description?: string; rows: { id: string; label: string; value: number; sub?: string }[]; unit: string; tone?: "warn" }) {
  const max = Math.max(1, ...rows.map((r) => r.value));
  return (
    <Section title={title} description={description}>
      {rows.length === 0 ? <p className="text-sm text-gray-500">Nothing recorded in this range.</p> : (
        <ol className="space-y-2">
          {rows.slice(0, 10).map((r, i) => (
            <li key={r.id} className="text-sm">
              <div className="flex justify-between gap-2"><span className="truncate"><span className="mr-2 text-gray-400">{i + 1}.</span>{r.label}</span><span className="shrink-0 tabular-nums text-gray-500">{r.value.toLocaleString()} {unit}</span></div>
              <div className="mt-1 h-1 overflow-hidden rounded-full bg-gray-100"><div className={`h-full rounded-full ${tone === "warn" ? "bg-orange-400" : "bg-primary/70"}`} style={{ width: `${(r.value / max) * 100}%` }} /></div>
              {r.sub && <p className="text-xs text-gray-400">{r.sub}</p>}
            </li>
          ))}
        </ol>
      )}
    </Section>
  );
}

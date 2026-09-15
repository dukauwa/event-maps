"use client";
import { useCallback, useMemo, useState } from "react";
import type { BundleExhibitor } from "@/lib/domain/types";
import { Banner } from "./Banner";
import { useT, useViewer, useViewerState } from "./context";
import { ExhibitorRow, SearchResultRow } from "./rows";
import { VirtualList } from "./VirtualList";

type Row = { kind: "letter"; letter: string } | { kind: "ex"; ex: BundleExhibitor } | { kind: "banner"; index: number } | { kind: "result"; index: number };

const ROW_H = 72, LETTER_H = 28, BANNER_H = 104;

function initial(name: string): string {
  const c = name.trim().charAt(0).toUpperCase();
  return /[A-Z]/.test(c) ? c : /\d/.test(c) ? "#" : c || "#";
}

export function ExhibitorsTab() {
  const { controller, isMobile } = useViewer();
  const s = useViewerState();
  const t = useT();
  const b = s.bundle;
  const q = s.searchQuery.trim();
  const [letter, setLetter] = useState<string | null>(null);
  const kiosk = s.kiosk;
  const rowH = kiosk ? ROW_H + 12 : ROW_H;

  const results = useMemo(() => (q ? controller.search(q, { limit: 100 }) : []), [controller, q, s.categoryIds, s.bundleRevision]); // eslint-disable-line react-hooks/exhaustive-deps

  const rows = useMemo<Row[]>(() => {
    if (q) return results.map((_, index) => ({ kind: "result", index }));
    const cats = s.categoryIds;
    const list = b.exhibitors.filter((e) => !cats.length || e.categoryIds.some((c) => cats.includes(c)));
    const featured = list.filter((e) => e.featured || e.sponsorLevel).sort((a, c) => rank(a) - rank(c) || a.name.localeCompare(c.name));
    const rest = list.filter((e) => !(e.featured || e.sponsorLevel)).sort((a, c) => a.name.localeCompare(c.name, undefined, { sensitivity: "base" }));
    const out: Row[] = [];
    if (featured.length) { out.push({ kind: "letter", letter: t("featured") }); for (const ex of featured) out.push({ kind: "ex", ex }); }
    let cur = "";
    let n = 0;
    const hasInline = b.event.settings.features.sponsorBanners && b.banners.some((x) => x.placement === "list_inline");
    for (const ex of rest) {
      const l = initial(ex.name);
      if (l !== cur) { cur = l; out.push({ kind: "letter", letter: l }); }
      out.push({ kind: "ex", ex });
      n++;
      if (hasInline && n % 8 === 0) out.push({ kind: "banner", index: n / 8 });
    }
    return out;
  }, [b, q, results, s.categoryIds, t]);

  const rowHeight = useCallback((r: Row) => (r.kind === "letter" ? LETTER_H : r.kind === "banner" ? BANNER_H : rowH), [rowH]);
  const rowKey = useCallback((r: Row, i: number) => (r.kind === "ex" ? r.ex.id : r.kind === "result" ? `r${results[r.index].type}:${results[r.index].id}` : `${r.kind}${i}`), [results]);
  const onFirst = useCallback((r: Row | null) => {
    if (!r || r.kind === "result") { setLetter(null); return; }
    setLetter(r.kind === "letter" ? r.letter : r.kind === "ex" ? initial(r.ex.name) : null);
  }, []);
  const current = s.panel.kind === "exhibitor" ? s.panel.id : null;

  const render = useCallback((r: Row) => {
    if (r.kind === "letter") return <div className="tv-letter" style={{ position: "static" }}>{r.letter}</div>;
    if (r.kind === "banner") return <div className="px-3 py-2"><Banner placement="list_inline" index={r.index} /></div>;
    if (r.kind === "result") return <SearchResultRow r={results[r.index]} />;
    return <ExhibitorRow ex={r.ex} current={r.ex.id === current} onSelect={(ex) => controller.openExhibitor(ex.id)} />;
  }, [results, controller, current]);

  const catNames = s.categoryIds.map((id) => b.categories.find((c) => c.id === id)?.name).filter(Boolean);
  const header = (
    <div className="px-3 pt-2 pb-1 flex flex-col gap-2">
      <Banner placement="search_top" />
      {catNames.length > 0 && (
        <div className="flex items-center gap-2 flex-wrap">
          {catNames.map((n) => <span key={n} className="tv-chip tv-chip-primary">{n}</span>)}
          <button type="button" className="tv-btn tv-btn-ghost tv-btn-sm" onClick={() => controller.clearCategory()}>{t("clearFilter")}</button>
        </div>
      )}
      <div className="tv-muted text-xs">
        {q ? (results.length ? t("results", { n: results.length }) : t("noResults", { q })) : t("exhibitorsCount", { n: rows.filter((r) => r.kind === "ex").length })}
      </div>
    </div>
  );

  return (
    <div className="relative flex-1 min-h-0 flex flex-col">
      {!q && letter && letter !== t("featured") && !isMobile && <div className="tv-letter absolute top-0 left-0 right-0 z-10" aria-hidden="true">{letter}</div>}
      <VirtualList rows={rows} rowHeight={rowHeight} render={render} rowKey={rowKey} header={header} onFirstVisible={onFirst} ariaLabel={t("exhibitors")} />
    </div>
  );
}

const SPONSOR_RANK: Record<string, number> = { platinum: 0, gold: 1, silver: 2, bronze: 3, partner: 4 };
function rank(e: BundleExhibitor): number { return e.sponsorLevel ? SPONSOR_RANK[e.sponsorLevel] ?? 5 : 6; }

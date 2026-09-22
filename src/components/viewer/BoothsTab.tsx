"use client";
/**
 * Booking view list: every booth that can still be bought, with size and price, filtered by level and type.
 * Clicking a row selects the booth on the map and opens its details (where the Reserve / Buy button lives).
 */
import { useCallback, useMemo, useState } from "react";
import type { BundleBooth } from "@/lib/domain/types";
import { formatPrice, useT, useViewer, useViewerState } from "./context";
import { Icon } from "./icons";
import { VirtualList } from "./VirtualList";

type Sort = "label" | "price" | "size";
const ROW_H = 64;

function naturalLabel(a: string, b: string): number { return a.localeCompare(b, undefined, { numeric: true, sensitivity: "base" }); }

export function BoothsTab() {
  const { controller, terms, locale, isMobile } = useViewer();
  const s = useViewerState();
  const t = useT();
  const b = s.bundle;
  const st = b.event.settings;
  const colors = st.branding.boothColors;
  const [levelId, setLevelId] = useState<string>("");
  const [type, setType] = useState<string>("");
  const [sort, setSort] = useState<Sort>("label");
  const [onlyAvailable, setOnlyAvailable] = useState(true);
  const kiosk = s.kiosk;
  const rowH = kiosk ? ROW_H + 10 : ROW_H;

  const forSale = useMemo(() => b.booths.filter((x) => x.status !== "unavailable"), [b]);
  const types = useMemo(() => [...new Set(forSale.map((x) => x.boothType))].sort(), [forSale]);
  const rows = useMemo(() => {
    const q = s.searchQuery.trim().toLowerCase();
    const list = forSale.filter((x) => (!onlyAvailable || x.status === "available") && (!levelId || x.levelId === levelId) && (!type || x.boothType === type) && (!q || x.label.toLowerCase().includes(q)));
    const price = (x: BundleBooth) => x.priceCents ?? Number.POSITIVE_INFINITY;
    return list.sort((x, y) => (sort === "price" ? price(x) - price(y) || naturalLabel(x.label, y.label) : sort === "size" ? y.areaM2 - x.areaM2 || naturalLabel(x.label, y.label) : naturalLabel(x.label, y.label)));
  }, [forSale, onlyAvailable, levelId, type, sort, s.searchQuery]);

  const available = forSale.filter((x) => x.status === "available").length;
  const current = s.panel.kind === "booth" ? (s.panel as { id: string }).id : s.selectedBoothIds[0] ?? null;
  const rowKey = useCallback((x: BundleBooth) => x.id, []);
  const rowHeight = useCallback(() => rowH, [rowH]);
  const render = useCallback((x: BundleBooth) => {
    const level = b.levels.find((l) => l.id === x.levelId);
    const statusKey = x.status === "available" ? "statusAvailable" : x.status === "held" ? "statusHeld" : x.status === "reserved" ? "statusReserved" : x.status === "sold" ? "statusSold" : "statusUnavailable";
    return (
      <div className="tv-row h-full" role="listitem" aria-current={x.id === current || undefined} tabIndex={0} style={{ cursor: "pointer" }} onClick={() => controller.openBooth(x.id)} onKeyDown={(e) => { if (e.key === "Enter" || e.key === " ") { e.preventDefault(); controller.openBooth(x.id); } }}>
        <span className="tv-booth-swatch" style={{ background: colors[x.status] }} aria-hidden />
        <div className="flex-1 min-w-0">
          <div className="flex items-center gap-2 min-w-0"><span className="font-semibold truncate">{terms.booth} {x.label}</span>{b.levels.length > 1 && level && <span className="tv-chip">{level.shortName}</span>}</div>
          <div className="tv-muted text-sm truncate">{x.widthM && x.heightM ? `${x.widthM} × ${x.heightM} m · ` : ""}{x.areaM2} m² · {x.boothType}{x.status !== "available" ? ` · ${t(statusKey)}` : ""}</div>
        </div>
        <div className="text-end flex-none">
          {x.priceCents != null ? <div className="font-semibold">{formatPrice(x.priceCents, x.currency ?? st.sales.currency, locale)}</div> : <div className="tv-muted text-sm">{t("priceOnRequest")}</div>}
        </div>
        <Icon name="chevron" size={16} className="tv-muted flex-none" />
      </div>
    );
  }, [b.levels, colors, controller, current, locale, st.sales.currency, t, terms.booth]);

  const header = (
    <div className="px-3 pt-3 pb-2 flex flex-col gap-2 border-b" style={{ borderColor: "var(--tv-border)" }}>
      <div className="tv-card !py-2 text-sm"><strong>{t("boothsForSale", { n: available })}</strong><div className="tv-muted">{t("bookingIntro")}</div></div>
      <div className="flex gap-2 flex-wrap">
        {b.levels.length > 1 && (
          <select className="tv-input !min-h-[36px] !w-auto flex-1" value={levelId} onChange={(e) => setLevelId(e.target.value)} aria-label={t("level")}>
            <option value="">{t("allLevels")}</option>
            {b.levels.map((l) => <option key={l.id} value={l.id}>{l.name}</option>)}
          </select>
        )}
        {types.length > 1 && (
          <select className="tv-input !min-h-[36px] !w-auto flex-1" value={type} onChange={(e) => setType(e.target.value)} aria-label={t("boothType")}>
            <option value="">{t("anyType")}</option>
            {types.map((x) => <option key={x} value={x}>{x}</option>)}
          </select>
        )}
        <select className="tv-input !min-h-[36px] !w-auto flex-1" value={sort} onChange={(e) => setSort(e.target.value as Sort)} aria-label={t("sortBy")}>
          <option value="label">{t("sortNumber")}</option>
          <option value="price">{t("sortPrice")}</option>
          <option value="size">{t("sortSize")}</option>
        </select>
      </div>
      <label className="flex items-center gap-2 text-sm cursor-pointer"><input type="checkbox" checked={onlyAvailable} onChange={(e) => setOnlyAvailable(e.target.checked)} />{t("onlyAvailable")}</label>
    </div>
  );

  return (
    <div className="flex flex-col flex-1 min-h-0">
      {rows.length === 0 ? (
        <>{header}<div className="p-6 text-center tv-muted">{t("noBoothsForSale", { booths: terms.booths.toLowerCase() })}</div></>
      ) : (
        <VirtualList rows={rows} rowHeight={rowHeight} rowKey={rowKey} render={render} header={header} ariaLabel={t("booking")} className={isMobile ? undefined : "tv-scrollbar"} />
      )}
    </div>
  );
}

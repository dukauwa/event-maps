"use client";
import type { BundleBooth } from "@/lib/domain/types";
import { Banner } from "./Banner";
import { formatPrice, useT, useViewer, useViewerState } from "./context";
import { Icon } from "./icons";
import { ExhibitorRow, PanelHeader } from "./rows";

const STATUS_KEY = { available: "statusAvailable", held: "statusHeld", reserved: "statusReserved", sold: "statusSold", unavailable: "statusUnavailable" } as const;

export function BoothDetails({ booth }: { booth: BundleBooth }) {
  const { controller, terms, locale } = useViewer();
  const s = useViewerState();
  const t = useT();
  const b = s.bundle;
  const st = b.event.settings;
  const f = st.features;
  const level = b.levels.find((l) => l.id === booth.levelId);
  const exs = booth.exhibitorIds.map((id) => b.exhibitors.find((e) => e.id === id)).filter((x): x is NonNullable<typeof x> => !!x);
  const reserve = controller.reserveUrl(booth);
  const bookmarked = controller.isBookmarked("booth", booth.id);
  const sessions = b.sessions.filter((se) => se.boothId === booth.id);
  const title = `${terms.booth} ${booth.label}`;
  const statusColor = st.branding.boothColors[booth.status];

  return (
    <div className="flex flex-col flex-1 min-h-0">
      <PanelHeader title={title} onBack={() => controller.back()} actions={f.sharing ? <button type="button" className="tv-icon-btn !border-0" aria-label={t("share")} onClick={() => void controller.share("booth", { title })}><Icon name="share" /></button> : undefined} />
      <div className="tv-panel-content tv-scrollbar">
        <div className="px-4 pt-3"><Banner placement="detail_top" /></div>
        <div className="px-4 py-3 flex flex-col gap-3">
          <div className="flex items-center gap-2 flex-wrap">
            {level && b.levels.length > 1 && <span className="tv-chip"><Icon name="layers" size={14} />{level.name}</span>}
            <span className="tv-chip"><Icon name="fit" size={14} />{booth.widthM && booth.heightM ? `${booth.widthM} × ${booth.heightM} m · ` : ""}{booth.areaM2} m²</span>
            {f.showAvailability && <span className="tv-chip" style={{ borderColor: statusColor }}><span className="tv-chip-dot" style={{ background: statusColor }} />{t(STATUS_KEY[booth.status])}</span>}
            {f.showPrices && booth.priceCents != null && <span className="tv-chip tv-chip-primary">{formatPrice(booth.priceCents, booth.currency ?? st.sales.currency, locale)}</span>}
          </div>
          <div className="flex gap-2 flex-wrap">
            {f.wayfinding && <button type="button" className="tv-btn tv-btn-primary" onClick={() => controller.startDirections({ type: "booth", id: booth.id })}><Icon name="directions" />{t("directions")}</button>}
            {f.bookmarks && <button type="button" className="tv-btn tv-btn-outline" aria-pressed={bookmarked} onClick={() => controller.toggleBookmark("booth", booth.id)} style={bookmarked ? { color: "var(--tv-accent)" } : undefined}><Icon name="bookmark" filled={bookmarked} />{bookmarked ? t("bookmarked") : t("bookmark")}</button>}
          </div>
          {reserve && (
            <div className="tv-card flex flex-col gap-2">
              {st.sales.reserveInstructions && <p className="m-0 text-sm tv-muted">{st.sales.reserveInstructions}</p>}
              <button type="button" className="tv-btn tv-btn-accent" onClick={() => controller.reserveClick(booth)}><Icon name="ticket" />{terms.reserveButton || t("reserveBooth")}</button>
            </div>
          )}
          {exs.length > 0 && (
            <div>
              <h3 className="m-0 mb-1 text-sm font-semibold">{exs.length > 1 ? terms.exhibitors : terms.exhibitor}</h3>
              <div className="-mx-4">{exs.map((ex) => <div key={ex.id} style={{ height: 72 }}><ExhibitorRow ex={ex} onSelect={(x) => controller.openExhibitor(x.id, { fromBooth: booth.id })} /></div>)}</div>
            </div>
          )}
          {sessions.length > 0 && (
            <div>
              <h3 className="m-0 mb-1 text-sm font-semibold">{t("sessionsAtBooth")}</h3>
              <ul className="m-0 p-0 list-none">{sessions.map((se) => <li key={se.id}><button type="button" className="tv-row rounded-lg !px-2" onClick={() => controller.openSession(se.id)}><Icon name="calendar" className="tv-muted" /><span className="flex-1 text-start truncate">{se.title}</span></button></li>)}</ul>
            </div>
          )}
          {Object.keys(booth.metadata).length > 0 && (
            <dl className="m-0 grid gap-1 text-sm" style={{ gridTemplateColumns: "auto 1fr" }}>
              {Object.entries(booth.metadata).map(([k, v]) => <div key={k} className="contents"><dt className="tv-muted">{k}</dt><dd className="m-0">{v}</dd></div>)}
            </dl>
          )}
        </div>
      </div>
    </div>
  );
}

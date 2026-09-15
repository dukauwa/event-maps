"use client";
import { useState } from "react";
import { Banner } from "./Banner";
import { useT, useViewer, useViewerState } from "./context";
import { Icon } from "./icons";

/** Floating map chrome: level pills, zoom/fit/3D/locate buttons, legend, corner banner. */
export function MapControls() {
  const { controller, isMobile } = useViewer();
  const s = useViewerState();
  const t = useT();
  const [legendOpen, setLegendOpen] = useState(true);
  const b = s.bundle;
  const f = b.event.settings.features;
  const level = b.levels.find((l) => l.id === s.levelId);
  const showControls = s.visibility.controls && !s.noOverlay;
  const showLevels = s.visibility.levels && b.levels.length > 1;
  const colors = b.event.settings.branding.boothColors;

  return (
    <>
      {showLevels && (
        <div className="tv-floating" style={{ top: 12, insetInlineStart: 12, flexWrap: "wrap", maxWidth: "70%" }} role="group" aria-label={t("levelSwitcher")}>
          {b.levels.map((l) => (
            <button key={l.id} type="button" className="tv-pill" aria-pressed={l.id === s.levelId} title={l.name} onClick={() => controller.activateFloor(l.id)}>
              {l.shortName}
            </button>
          ))}
        </div>
      )}
      {showControls && (
        <div className="tv-floating tv-floating-col" style={{ top: 12, insetInlineEnd: 12 }} role="group" aria-label={t("mapControls")}>
          <button type="button" className="tv-icon-btn" onClick={() => controller.fitBounds()} aria-label={t("fitToPlan")} title={t("fitToPlan")}><Icon name="fit" /></button>
          {!isMobile && <>
            <button type="button" className="tv-icon-btn" onClick={() => controller.zoomIn()} aria-label={t("zoomIn")} title={t("zoomIn")}><Icon name="plus" /></button>
            <button type="button" className="tv-icon-btn" onClick={() => controller.zoomOut()} aria-label={t("zoomOut")} title={t("zoomOut")}><Icon name="minus" /></button>
          </>}
          {f.threeD && (
            <button type="button" className="tv-icon-btn" aria-pressed={s.view === "3d"} onClick={() => controller.switchView()} aria-label={s.view === "3d" ? t("view2d") : t("view3d")} title={s.view === "3d" ? t("view2d") : t("view3d")}>
              <span className="text-xs font-bold">{s.view === "3d" ? "2D" : "3D"}</span>
            </button>
          )}
          {f.gps && level?.georef && !s.kiosk && (
            <button type="button" className="tv-icon-btn" aria-pressed={s.gpsTracking} onClick={() => { if (s.gpsTracking) controller.setGpsTrackingEnabled(false); else { void controller.findLocation(); controller.setGpsTrackingEnabled(true); } }} aria-label={t("locateMe")} title={t("locateMe")}>
              <Icon name="locate" />
            </button>
          )}
          {s.position && s.kiosk && (
            <button type="button" className="tv-icon-btn" onClick={() => controller.selectCurrentPosition(s.position!.x, s.position!.y, true, s.position!.levelId)} aria-label={t("youAreHere")} title={t("youAreHere")}><Icon name="pin" /></button>
          )}
        </div>
      )}
      {f.showAvailability && showControls && (
        legendOpen ? (
          <div className="tv-legend" role="note" aria-label={t("legend")} style={{ bottom: isMobile ? "calc(var(--tv-peek) + 12px)" : 12 }}>
            <span style={{ "--sw": colors.available } as React.CSSProperties}>{t("statusAvailable")}</span>
            <span style={{ "--sw": colors.held } as React.CSSProperties}>{t("statusHeld")}</span>
            <span style={{ "--sw": colors.reserved } as React.CSSProperties}>{t("statusReserved")}</span>
            <span style={{ "--sw": colors.sold } as React.CSSProperties}>{t("statusSold")}</span>
            <button type="button" className="tv-btn tv-btn-ghost tv-btn-sm col-span-2 justify-start !min-h-0 !p-0 !text-[0.95em]" onClick={() => setLegendOpen(false)} aria-label={t("hideLegend")}>{t("hideLegend")}</button>
          </div>
        ) : (
          <button type="button" className="tv-icon-btn" style={{ position: "absolute", zIndex: 10, insetInlineStart: 12, bottom: isMobile ? "calc(var(--tv-peek) + 12px)" : 12 }} onClick={() => setLegendOpen(true)} aria-label={t("legend")} title={t("legend")}><Icon name="info" /></button>
        )
      )}
      {!isMobile && showControls && (
        <div className="tv-floating" style={{ bottom: 12, insetInlineEnd: 12, maxWidth: 320 }}>
          <Banner placement="map_corner" />
        </div>
      )}
    </>
  );
}

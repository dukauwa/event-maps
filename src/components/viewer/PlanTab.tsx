"use client";
import { useState } from "react";
import { useT, useViewer, useViewerState } from "./context";
import { Icon } from "./icons";
import { ExhibitorRow, SessionRow } from "./rows";

export function PlanTab() {
  const { controller, terms } = useViewer();
  const s = useViewerState();
  const t = useT();
  const b = s.bundle;
  const items = controller.plannerItems();
  const [returnToStart, setReturnToStart] = useState(false);
  const f = b.event.settings.features;
  const start = controller.defaultStart();
  const startLabel = s.position ? t("yourLocation") : start ? controller.endpointLabel(start) : "";
  const opt = s.optimized;

  return (
    <div className="tv-panel-content tv-scrollbar">
      <div className="px-3 py-3 flex flex-col gap-2">
        {items.length === 0 ? (
          <p className="tv-muted m-0">{t("emptyPlan")}</p>
        ) : (
          <>
            {f.wayfinding && <p className="tv-muted text-xs m-0">{t("plannerHint", { start: startLabel || t("entrance") })}</p>}
            <div className="flex gap-2 flex-wrap">
              {f.wayfinding && <button type="button" className="tv-btn tv-btn-primary" onClick={() => controller.optimisePlan({ returnToStart })}><Icon name="directions" />{t("optimiseRoute")}</button>}
              {f.sharing && <button type="button" className="tv-btn tv-btn-outline" onClick={() => void controller.share("plan", { title: t("myPlan") })}><Icon name="share" />{t("sharePlan")}</button>}
              {!s.kiosk && <button type="button" className="tv-btn tv-btn-outline" onClick={() => window.print()}><Icon name="print" />{t("print")}</button>}
            </div>
            {f.wayfinding && (
              <label className="tv-toggle text-sm"><input type="checkbox" checked={returnToStart} onChange={(e) => setReturnToStart(e.target.checked)} />{t("returnToStart")}</label>
            )}
            {s.routeError && !opt && <p className="text-sm m-0" style={{ color: "#dc2626" }}>{s.routeError === "chooseStart" ? t("noEntrance") : t("routeNotFound")}</p>}
          </>
        )}
      </div>
      {opt && s.route && (
        <div className="px-3 pb-3">
          <div className="tv-card">
            <div className="flex items-center justify-between gap-2">
              <strong>{t("optimisedRoute")}</strong>
              <button type="button" className="tv-btn tv-btn-ghost tv-btn-sm" onClick={() => controller.clearRoute()}>{t("clearRoute")}</button>
            </div>
            <div className="tv-muted text-sm mt-1">{t("stops", { n: opt.order.length })} · {t("meters", { n: Math.round(opt.distanceM) })} · {t("minutes", { n: Math.max(1, Math.round(opt.durationSeconds / 60)) })}</div>
            <ol className="m-0 mt-2 p-0 list-none flex flex-col gap-1">
              <li className="flex items-center gap-2 text-sm"><span className="tv-step-icon"><Icon name="flag" /></span><span>{t("tourStart")}: {startLabel || t("entrance")}</span></li>
              {opt.order.map((ep, i) => (
                <li key={i} className="flex items-center gap-2 text-sm">
                  <span className="tv-step-icon font-bold" style={{ fontSize: 12 }}>{i + 1}</span>
                  <button type="button" className="tv-btn tv-btn-ghost tv-btn-sm !justify-start flex-1 truncate" onClick={() => { const leg = opt.legs[i]; if (leg) { controller.showRouteLevel(leg.steps.find((st) => st.points.length)?.levelId ?? s.levelId); } }}>
                    {controller.endpointLabel(ep)}
                  </button>
                </li>
              ))}
            </ol>
          </div>
        </div>
      )}
      <div role="list" aria-label={t("bookmarks")}>
        {items.map((it) => (
          <div key={it.key} style={{ height: s.kiosk ? 84 : 72 }}>
            {it.kind === "exhibitor" && it.exhibitor && <ExhibitorRow ex={it.exhibitor} onSelect={(ex) => controller.openExhibitor(ex.id)} />}
            {it.kind === "session" && it.session && <SessionRow se={it.session} />}
            {it.kind === "booth" && it.booth && (
              <button type="button" className="tv-row h-full" onClick={() => controller.openBooth(it.booth!.id)}>
                <span className="tv-step-icon" style={{ width: 40, height: 40 }}><Icon name="pin" /></span>
                <span className="flex-1 text-start font-semibold">{terms.booth} {it.booth.label}</span>
                <button type="button" className="tv-icon-btn !border-0 !bg-transparent" style={{ color: "var(--tv-accent)" }} aria-label={t("removeBookmark")} onClick={(e) => { e.stopPropagation(); controller.toggleBookmark("booth", it.booth!.id, false); }}><Icon name="bookmark" filled /></button>
              </button>
            )}
          </div>
        ))}
      </div>
    </div>
  );
}

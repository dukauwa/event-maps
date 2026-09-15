"use client";
import { useMemo, useState } from "react";
import type { RouteEndpoint, RouteStep } from "@/lib/domain/types";
import { useT, useViewer, useViewerState } from "./context";
import { Icon, type IconName } from "./icons";
import { PanelHeader } from "./rows";

const TRANSITION_ICON: Record<string, IconName> = { escalator: "escalator", elevator: "elevator", stairs: "stairs", ramp: "accessible", door: "flag", bridge: "walk" };

/** Localise the engine's English instruction strings. */
function stepText(step: RouteStep, t: ReturnType<typeof useT>, levelName: (id: string) => string): string {
  const ins = step.instruction ?? "";
  if (step.transition) return t("takeTo", { kind: t(step.transition.kind), level: levelName(step.transition.toLevelId) });
  if (ins.startsWith("Turn left")) return t("turnLeft");
  if (ins.startsWith("Turn right")) return t("turnRight");
  if (ins.startsWith("Make a U-turn")) return t("uTurn");
  if (ins.startsWith("Head along")) return t("headAlong");
  if (ins.startsWith("Arrive at ")) return t("arriveAt", { name: ins.slice(10) });
  if (ins.startsWith("Stop at ")) return t("stopAt", { name: ins.slice(8) });
  return ins;
}

function stepIcon(step: RouteStep): IconName {
  const ins = step.instruction ?? "";
  if (step.transition) return TRANSITION_ICON[step.transition.kind] ?? "stairs";
  if (ins.startsWith("Turn left")) return "turnLeft";
  if (ins.startsWith("Turn right")) return "turnRight";
  if (ins.startsWith("Make a U-turn")) return "uturn";
  if (ins.startsWith("Arrive") || ins.startsWith("Stop")) return "flag";
  return "walk";
}

function EndpointPicker({ label, value, onPick, onClear, placeholder, icon, allowPosition }: { label: string; value: string; onPick: (ep: RouteEndpoint | string) => void; onClear?: () => void; placeholder: string; icon: IconName; allowPosition?: boolean }) {
  const { controller } = useViewer();
  const s = useViewerState();
  const t = useT();
  const [q, setQ] = useState("");
  const [editing, setEditing] = useState(!value);
  const results = useMemo(() => (q.trim() ? controller.search(q, { limit: 8 }).filter((r) => r.type !== "category") : []), [controller, q]);
  const entrances = useMemo(() => s.bundle.levels.flatMap((l) => l.elements.filter((e) => e.kind === "entrance" || (e.kind === "poi" && e.props.poiType === "entrance"))), [s.bundle]);
  const pick = (ep: RouteEndpoint | string) => { onPick(ep); setQ(""); setEditing(false); };
  return (
    <div className="flex flex-col gap-1">
      <label className="tv-muted text-xs font-semibold uppercase tracking-wide">{label}</label>
      {!editing && value ? (
        <button type="button" className="tv-input flex items-center gap-2 text-start" onClick={() => setEditing(true)} aria-label={`${label}: ${value}`}>
          <Icon name={icon} size={16} className="tv-muted flex-none" /><span className="flex-1 truncate">{value}</span><Icon name="chevronDown" size={16} className="tv-muted" />
        </button>
      ) : (
        <div className="relative">
          <input className="tv-input" value={q} placeholder={placeholder} onChange={(e) => setQ(e.target.value)} autoFocus={!!value} aria-label={label} onKeyDown={(e) => { if (e.key === "Escape" && value) setEditing(false); if (e.key === "Enter" && results[0]) pick(results[0].type === "exhibitor" ? { type: "exhibitor", id: results[0].id } : results[0].type === "booth" ? { type: "booth", id: results[0].id } : results[0].type === "poi" ? { type: "element", id: results[0].id } : results[0].id); }} />
          {(q.trim() || !value) && (
            <ul className="m-0 mt-1 p-1 list-none tv-card flex flex-col gap-0.5 max-h-64 overflow-auto" role="listbox">
              {!q.trim() && allowPosition && s.position && <li><button type="button" role="option" aria-selected={false} className="tv-row rounded-md !py-2" onClick={() => pick({ type: "point", ...s.position! })}><Icon name="locate" size={16} className="tv-muted" /><span className="flex-1 truncate">{t("yourLocation")}</span></button></li>}
              {!q.trim() && entrances.map((e) => <li key={e.id}><button type="button" role="option" aria-selected={false} className="tv-row rounded-md !py-2" onClick={() => pick({ type: "element", id: e.id })}><Icon name="flag" size={16} className="tv-muted" /><span className="flex-1 truncate">{String(e.props.name ?? t("entrance"))}</span></button></li>)}
              {!q.trim() && <li className="tv-muted text-xs px-3 py-1">{t("tapBoothOnMap")}</li>}
              {results.map((r) => (
                <li key={`${r.type}:${r.id}`}>
                  <button type="button" role="option" aria-selected={false} className="tv-row rounded-md !py-2" onClick={() => pick(r.type === "exhibitor" ? { type: "exhibitor", id: r.id } : r.type === "booth" ? { type: "booth", id: r.id } : r.type === "poi" ? { type: "element", id: r.id } : r.id)}>
                    <Icon name={r.type === "booth" ? "pin" : r.type === "poi" ? "info" : r.type === "session" ? "calendar" : "search"} size={16} className="tv-muted" />
                    <span className="flex-1 min-w-0 text-start"><span className="block truncate">{r.title}</span>{r.subtitle && <span className="block tv-muted text-xs truncate">{r.subtitle}</span>}</span>
                  </button>
                </li>
              ))}
              {q.trim() && !results.length && <li className="tv-muted text-xs px-3 py-1">{t("noResults", { q })}</li>}
              {value && <li><button type="button" className="tv-btn tv-btn-ghost tv-btn-sm w-full" onClick={() => { setEditing(false); setQ(""); onClear?.(); }}>{t("cancel")}</button></li>}
            </ul>
          )}
        </div>
      )}
    </div>
  );
}

export function DirectionsPanel() {
  const { controller } = useViewer();
  const s = useViewerState();
  const t = useT();
  const b = s.bundle;
  const req = s.routeRequest;
  const route = s.route;
  const levelName = (id: string) => b.levels.find((l) => l.id === id)?.name ?? id;
  const fromLabel = req?.from ? (req.from.type === "point" && s.position && req.from.x === s.position.x && req.from.y === s.position.y ? t("yourLocation") : controller.endpointLabel(req.from)) : "";
  const toLabel = req ? controller.endpointLabel(req.to) : "";
  const accessibleOn = b.event.settings.features.accessibleRouting;

  return (
    <div className="flex flex-col flex-1 min-h-0">
      <PanelHeader title={t("directions")} onBack={() => controller.back()} actions={<button type="button" className="tv-btn tv-btn-ghost tv-btn-sm" onClick={() => controller.clearRoute()}>{t("clearRoute")}</button>} />
      <div className="tv-panel-content tv-scrollbar px-4 py-3 flex flex-col gap-3">
        <div className="flex gap-2 items-end">
          <div className="flex-1 flex flex-col gap-3 min-w-0">
            <EndpointPicker label={t("from")} value={fromLabel} placeholder={t("searchStart")} icon="flag" allowPosition onPick={(ep) => controller.setRouteFrom(ep)} onClear={() => controller.setRouteFrom(null)} />
            <EndpointPicker label={t("to")} value={toLabel} placeholder={t("chooseDestination")} icon="pin" onPick={(ep) => controller.setRouteTo(ep)} />
          </div>
          {req?.from && <button type="button" className="tv-icon-btn mb-0.5" onClick={() => controller.swapRoute()} aria-label={t("swap")} title={t("swap")}><Icon name="swap" /></button>}
        </div>
        {accessibleOn && (
          <label className="tv-toggle"><input type="checkbox" checked={!!req?.accessible} onChange={(e) => controller.setRouteAccessible(e.target.checked)} /><Icon name="accessible" size={18} />{t("accessibleRoute")}</label>
        )}
        {s.routeError && !route && (
          <p className="tv-card m-0 text-sm" role="alert">{s.routeError === "chooseStart" ? t("noEntrance") : t("routeNotFound")}</p>
        )}
        {route && (
          <>
            <div className="flex items-center gap-4 tv-card">
              <div><div className="tv-muted text-xs">{t("walkingTime")}</div><div className="text-lg font-bold">{t("minutes", { n: Math.max(1, Math.round(route.durationSeconds / 60)) })}</div></div>
              <div><div className="tv-muted text-xs">{t("distance")}</div><div className="text-lg font-bold">{t("meters", { n: Math.round(route.distanceM) })}</div></div>
              {route.levelIds.length > 1 && <div className="flex gap-1 ms-auto">{route.levelIds.map((id) => <button key={id} type="button" className="tv-pill" style={{ height: 28, minWidth: 0 }} aria-pressed={id === s.levelId} onClick={() => controller.showRouteLevel(id)}>{b.levels.find((l) => l.id === id)?.shortName ?? id}</button>)}</div>}
            </div>
            {s.kiosk && b.event.settings.features.sharing && (
              <button type="button" className="tv-btn tv-btn-primary" onClick={() => controller.openDialog({ kind: "qr", url: controller.shareUrl(), title: t("sendToPhone") })}><Icon name="qr" />{t("sendToPhone")}</button>
            )}
            <ol className="m-0 p-0 list-none" aria-label={t("steps")}>
              {route.steps.map((step, i) => {
                const onLevel = step.levelId === s.levelId;
                const transition = step.transition;
                return (
                  <li key={i} className="tv-step" style={{ opacity: onLevel || transition ? 1 : 0.55 }}>
                    <span className="tv-step-icon" style={transition ? { background: "var(--tv-primary)", color: "var(--tv-primary-fg)" } : undefined}><Icon name={stepIcon(step)} /></span>
                    <div className="flex-1 min-w-0">
                      {transition ? (
                        <button type="button" className="tv-btn tv-btn-outline tv-btn-sm !whitespace-normal text-start" onClick={() => controller.showRouteLevel(transition.toLevelId)}>{stepText(step, t, levelName)}<Icon name="chevron" size={14} /></button>
                      ) : (
                        <button type="button" className="text-start w-full bg-transparent border-0 p-0 cursor-pointer" onClick={() => { if (!onLevel) controller.showRouteLevel(step.levelId); }}>
                          <div className="font-medium">{stepText(step, t, levelName)}</div>
                          {step.distanceM > 0 && <div className="tv-muted text-xs">{t("meters", { n: Math.round(step.distanceM) })}{b.levels.length > 1 ? ` · ${b.levels.find((l) => l.id === step.levelId)?.shortName ?? ""}` : ""}</div>}
                        </button>
                      )}
                    </div>
                  </li>
                );
              })}
            </ol>
          </>
        )}
      </div>
    </div>
  );
}

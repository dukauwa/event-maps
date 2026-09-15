"use client";
import type { BundleElement, BundleSession } from "@/lib/domain/types";
import { formatDay, formatTime, useT, useViewer, useViewerState } from "./context";
import { Icon } from "./icons";
import { PanelHeader } from "./rows";

export function SessionDetails({ se }: { se: BundleSession }) {
  const { controller, locale } = useViewer();
  const s = useViewerState();
  const t = useT();
  const tz = s.bundle.event.timezone;
  const where = controller.sessionLocationName(se);
  const bookmarked = controller.isBookmarked("session", se.id);
  const ep = se.boothId ? { type: "booth" as const, id: se.boothId } : se.elementId ? { type: "element" as const, id: se.elementId } : null;
  const now = Date.now();
  const live = Date.parse(se.startsAt) <= now && Date.parse(se.endsAt) >= now;
  return (
    <div className="flex flex-col flex-1 min-h-0">
      <PanelHeader title={se.title} onBack={() => controller.back()} />
      <div className="tv-panel-content tv-scrollbar px-4 py-3 flex flex-col gap-3">
        <h1 className="m-0 text-lg font-bold leading-tight">{se.title}</h1>
        <div className="flex items-center gap-2 flex-wrap text-sm">
          <span className="tv-chip"><Icon name="calendar" size={14} />{formatDay(se.startsAt, locale, tz)}</span>
          <span className="tv-chip"><Icon name="clock" size={14} />{formatTime(se.startsAt, locale, tz)} – {formatTime(se.endsAt, locale, tz)}</span>
          {live && <span className="tv-badge" style={{ background: "#dc2626" }}>{t("liveSession")}</span>}
          {se.track && <span className="tv-chip">{t("track")}: {se.track}</span>}
          {where && <span className="tv-chip tv-chip-primary"><Icon name="pin" size={14} />{where}</span>}
        </div>
        <div className="flex gap-2 flex-wrap">
          {ep && <button type="button" className="tv-btn tv-btn-outline" onClick={() => controller.showSessionLocation(se)}><Icon name="map" />{t("showOnMap")}</button>}
          {ep && s.bundle.event.settings.features.wayfinding && <button type="button" className="tv-btn tv-btn-primary" onClick={() => controller.startDirections(ep)}><Icon name="directions" />{t("directions")}</button>}
          {s.bundle.event.settings.features.bookmarks && <button type="button" className="tv-btn tv-btn-outline" aria-pressed={bookmarked} onClick={() => controller.toggleBookmark("session", se.id)} style={bookmarked ? { color: "var(--tv-accent)" } : undefined}><Icon name="bookmark" filled={bookmarked} />{bookmarked ? t("removeFromPlan") : t("addToPlan")}</button>}
        </div>
        {se.description && <p className="m-0 whitespace-pre-line">{se.description}</p>}
        {se.speakers.length > 0 && (
          <div>
            <h3 className="m-0 mb-1 text-sm font-semibold">{t("speakers")}</h3>
            <ul className="m-0 p-0 list-none flex flex-col gap-2">
              {se.speakers.map((sp, i) => (
                <li key={i} className="flex items-center gap-2">
                  {sp.avatarUrl ? (
                    // eslint-disable-next-line @next/next/no-img-element -- speaker avatar
                    <img src={sp.avatarUrl} alt="" className="w-9 h-9 rounded-full object-cover" />
                  ) : <span className="tv-step-icon" style={{ width: 36, height: 36 }}><Icon name="info" /></span>}
                  <span><span className="font-medium block">{sp.name}</span><span className="tv-muted text-xs">{[sp.title, sp.company].filter(Boolean).join(" · ")}</span></span>
                </li>
              ))}
            </ul>
          </div>
        )}
        {se.url && <button type="button" className="tv-btn tv-btn-outline self-start" onClick={() => controller.openExternal(se.url!, se.title)}><Icon name="link" />{t("moreInfo")}</button>}
      </div>
    </div>
  );
}

export function PoiDetails({ el }: { el: BundleElement }) {
  const { controller } = useViewer();
  const s = useViewerState();
  const t = useT();
  const name = typeof el.props.name === "string" ? el.props.name : t("poi");
  const type = typeof el.props.poiType === "string" ? el.props.poiType.replace(/_/g, " ") : el.kind === "room" ? t("room") : el.kind === "stage" ? t("stage") : el.kind === "zone" ? t("zone") : t("poi");
  const level = s.bundle.levels.find((l) => l.id === el.levelId);
  const desc = typeof el.props.description === "string" ? el.props.description : "";
  const sessions = s.bundle.sessions.filter((se) => se.elementId === el.id);
  const url = typeof el.props.url === "string" ? el.props.url : "";
  return (
    <div className="flex flex-col flex-1 min-h-0">
      <PanelHeader title={name} onBack={() => controller.back()} />
      <div className="tv-panel-content tv-scrollbar px-4 py-3 flex flex-col gap-3">
        <div className="flex items-center gap-2 flex-wrap">
          <span className="tv-chip capitalize">{type}</span>
          {level && s.bundle.levels.length > 1 && <span className="tv-chip"><Icon name="layers" size={14} />{level.shortName}</span>}
        </div>
        {desc && <p className="m-0">{desc}</p>}
        <div className="flex gap-2 flex-wrap">
          <button type="button" className="tv-btn tv-btn-outline" onClick={() => controller.openPoi(el.id, { fly: true })}><Icon name="map" />{t("showOnMap")}</button>
          {s.bundle.event.settings.features.wayfinding && <button type="button" className="tv-btn tv-btn-primary" onClick={() => controller.startDirections({ type: "element", id: el.id })}><Icon name="directions" />{t("directions")}</button>}
          {url && <button type="button" className="tv-btn tv-btn-outline" onClick={() => controller.openExternal(url, name)}><Icon name="link" />{t("moreInfo")}</button>}
        </div>
        {sessions.length > 0 && (
          <div>
            <h3 className="m-0 mb-1 text-sm font-semibold">{t("sessions")}</h3>
            <ul className="m-0 p-0 list-none">{sessions.map((se) => <li key={se.id}><button type="button" className="tv-row rounded-lg !px-2" onClick={() => controller.openSession(se.id, { show: false })}><Icon name="calendar" className="tv-muted" /><span className="flex-1 text-start truncate">{se.title}</span></button></li>)}</ul>
          </div>
        )}
      </div>
    </div>
  );
}

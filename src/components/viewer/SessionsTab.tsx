"use client";
import { useMemo, useState } from "react";
import { dayKey, formatDay, useT, useViewer, useViewerState } from "./context";
import { SessionRow } from "./rows";

export function SessionsTab() {
  const { locale } = useViewer();
  const s = useViewerState();
  const t = useT();
  const b = s.bundle;
  const tz = b.event.timezone;
  const [nowOnly, setNowOnly] = useState(false);
  const days = useMemo(() => {
    const groups = new Map<string, typeof b.sessions>();
    for (const se of [...b.sessions].sort((x, y) => x.startsAt.localeCompare(y.startsAt))) {
      const k = dayKey(se.startsAt, tz);
      groups.set(k, [...(groups.get(k) ?? []), se]);
    }
    return [...groups.entries()];
  }, [b, tz]);
  const todayKey = dayKey(new Date().toISOString(), tz);
  const [day, setDay] = useState<string>(() => days.find(([k]) => k === todayKey)?.[0] ?? days[0]?.[0] ?? "");
  const now = Date.now();
  const live = b.sessions.filter((se) => Date.parse(se.startsAt) <= now && Date.parse(se.endsAt) >= now);
  const list = nowOnly ? live : days.find(([k]) => k === day)?.[1] ?? [];
  const current = s.panel.kind === "session" ? s.panel.id : null;
  if (!b.sessions.length) return <p className="tv-muted p-4">{t("noSessions")}</p>;
  return (
    <div className="flex flex-col flex-1 min-h-0">
      <div className="flex gap-2 px-3 py-2 overflow-x-auto flex-none" role="tablist" aria-label={t("sessions")}>
        {live.length > 0 && <button type="button" role="tab" aria-selected={nowOnly} className="tv-pill" aria-pressed={nowOnly} onClick={() => setNowOnly(true)}>{t("now")} · {live.length}</button>}
        {days.map(([k, items]) => (
          <button key={k} type="button" role="tab" aria-selected={!nowOnly && k === day} className="tv-pill" aria-pressed={!nowOnly && k === day} onClick={() => { setNowOnly(false); setDay(k); }} title={t("sessionsOnDay", { n: items.length })}>
            {k === todayKey ? t("today") : formatDay(items[0].startsAt, locale, tz)}
          </button>
        ))}
      </div>
      <div className="tv-panel-content tv-scrollbar" role="list">
        {list.length === 0 && <p className="tv-muted px-4 py-3">{t("noSessions")}</p>}
        {list.map((se) => <div key={se.id} style={{ height: s.kiosk ? 84 : 72 }}><SessionRow se={se} current={se.id === current} /></div>)}
      </div>
    </div>
  );
}

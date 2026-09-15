"use client";
import { useCallback, useEffect, useRef, useState } from "react";
import { BoothDetails } from "./BoothDetails";
import { CategoriesTab } from "./CategoriesTab";
import { useT, useViewer, useViewerState } from "./context";
import { DirectionsPanel } from "./DirectionsPanel";
import { ExhibitorDetails } from "./ExhibitorDetails";
import { ExhibitorsTab } from "./ExhibitorsTab";
import { PlanTab } from "./PlanTab";
import { SessionsTab } from "./SessionsTab";
import { PoiDetails, SessionDetails } from "./SmallDetails";
import type { ViewerTab } from "@/lib/viewer/controller";

type Sheet = "peek" | "half" | "full";

/** Desktop side panel / mobile bottom sheet. Same content, different container behaviour (CSS + drag). */
export function Panel() {
  const { controller, isMobile } = useViewer();
  const s = useViewerState();
  const t = useT();
  const b = s.bundle;
  const f = b.event.settings.features;
  const [sheet, setSheet] = useState<Sheet>("peek");
  const [dragging, setDragging] = useState(false);
  const ref = useRef<HTMLElement>(null);
  const drag = useRef<{ startY: number; startT: number; moved: boolean } | null>(null);
  const panelKind = s.panel.kind;

  // Sheet position follows the controller's intent.
  useEffect(() => {
    if (!isMobile) return;
    if (!s.panelOpen) setSheet("peek");
    else if (panelKind !== "list") setSheet("half");
    else if (s.searchFocused) setSheet("full");
  }, [s.panelOpen, panelKind, s.searchFocused, isMobile]);

  // Focus management: move focus into a freshly opened details panel.
  useEffect(() => {
    if (panelKind === "list" || !ref.current) return;
    const h = ref.current.querySelector<HTMLElement>("h1, h2");
    h?.setAttribute("tabindex", "-1");
    h?.focus({ preventScroll: true });
  }, [panelKind, s.panel]);

  const onPointerDown = useCallback((e: React.PointerEvent) => {
    if (!isMobile) return;
    drag.current = { startY: e.clientY, startT: performance.now(), moved: false };
    (e.currentTarget as HTMLElement).setPointerCapture?.(e.pointerId);
    setDragging(true);
  }, [isMobile]);
  const onPointerMove = useCallback((e: React.PointerEvent) => {
    const d = drag.current, el = ref.current;
    if (!d || !el) return;
    const dy = e.clientY - d.startY;
    if (Math.abs(dy) > 4) d.moved = true;
    const base = sheet === "full" ? 0 : sheet === "half" ? el.offsetHeight * 0.5 : el.offsetHeight - 132;
    el.style.transform = `translateY(${Math.max(0, base + dy)}px)`;
  }, [sheet]);
  const onPointerUp = useCallback((e: React.PointerEvent) => {
    const d = drag.current, el = ref.current;
    drag.current = null;
    setDragging(false);
    if (!d || !el) return;
    el.style.transform = "";
    const dy = e.clientY - d.startY;
    const fast = performance.now() - d.startT < 300 && Math.abs(dy) > 30;
    let next: Sheet = sheet;
    if (!d.moved) next = sheet === "peek" ? "half" : sheet === "half" ? "full" : "half";
    else if (dy < -60 || (fast && dy < 0)) next = sheet === "peek" ? "half" : "full";
    else if (dy > 60 || (fast && dy > 0)) next = sheet === "full" ? "half" : "peek";
    setSheet(next);
    controller.setPanelOpen(next !== "peek");
  }, [sheet, controller]);

  if (s.noOverlay || !s.visibility.overlay) return null;

  const tabs: { id: ViewerTab; label: string }[] = [];
  if (f.exhibitorList) tabs.push({ id: "exhibitors", label: b.event.settings.terms.exhibitors });
  if (b.categories.length) tabs.push({ id: "categories", label: t("categories") });
  if (f.sessions && b.sessions.length) tabs.push({ id: "sessions", label: t("sessions") });
  if (f.bookmarks) tabs.push({ id: "plan", label: t("myPlan") });

  let body: React.ReactNode;
  if (panelKind === "exhibitor") { const ex = b.exhibitors.find((e) => e.id === (s.panel as { id: string }).id); body = ex ? <ExhibitorDetails ex={ex} /> : null; }
  else if (panelKind === "booth") { const bo = b.booths.find((x) => x.id === (s.panel as { id: string }).id); body = bo ? <BoothDetails booth={bo} /> : null; }
  else if (panelKind === "session") { const se = b.sessions.find((x) => x.id === (s.panel as { id: string }).id); body = se ? <SessionDetails se={se} /> : null; }
  else if (panelKind === "poi") { const el = controller.elementById((s.panel as { id: string }).id); body = el ? <PoiDetails el={el} /> : null; }
  else if (panelKind === "directions") body = <DirectionsPanel />;
  else {
    const tab = tabs.some((x) => x.id === s.tab) ? s.tab : tabs[0]?.id ?? "exhibitors";
    body = (
      <>
        {tabs.length > 1 && (
          <div className="tv-tabs" role="tablist">
            {tabs.map((x) => <button key={x.id} type="button" role="tab" id={`tv-tab-${x.id}`} aria-selected={tab === x.id} aria-controls={`tv-tabpanel-${x.id}`} className="tv-tab" onClick={() => controller.setTab(x.id)}>{x.label}</button>)}
          </div>
        )}
        <div className="flex flex-col flex-1 min-h-0" role="tabpanel" id={`tv-tabpanel-${tab}`} aria-labelledby={`tv-tab-${tab}`}>
          {tab === "exhibitors" && <ExhibitorsTab />}
          {tab === "categories" && <CategoriesTab />}
          {tab === "sessions" && <SessionsTab />}
          {tab === "plan" && <PlanTab />}
        </div>
      </>
    );
  }

  return (
    <aside ref={ref} className="tv-panel" data-sheet={isMobile ? sheet : undefined} data-dragging={dragging ? "1" : undefined} aria-label={t("list")}>
      <div className="tv-sheet-handle" onPointerDown={onPointerDown} onPointerMove={onPointerMove} onPointerUp={onPointerUp} onPointerCancel={onPointerUp} role="button" tabIndex={0} aria-label={sheet === "peek" ? t("openPanel") : t("closePanel")} onKeyDown={(e) => { if (e.key === "Enter" || e.key === " ") { e.preventDefault(); const next: Sheet = sheet === "peek" ? "half" : "peek"; setSheet(next); controller.setPanelOpen(next !== "peek"); } }}><span /></div>
      {body}
    </aside>
  );
}

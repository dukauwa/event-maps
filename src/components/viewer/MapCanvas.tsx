"use client";
import { useEffect, useRef, useState, useSyncExternalStore } from "react";
import { PlanMap } from "@/lib/map/plan-map";
import { useT, useViewer, useViewerState } from "./context";

const noopSubscribe = () => () => {};

/** Mounts the MapLibre map and binds it to the controller. Rendered once; the controller drives it afterwards. */
export function MapCanvas() {
  const { controller, isMobile } = useViewer();
  const s = useViewerState();
  const t = useT();
  const ref = useRef<HTMLDivElement>(null);
  const webgl = useSyncExternalStore(noopSubscribe, () => PlanMap.supportsWebGL(), () => null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    const el = ref.current;
    if (!el || !PlanMap.supportsWebGL()) return;
    const st = controller.snapshot();
    const b = st.bundle;
    const branding = b.event.settings.branding;
    const basemap = b.event.settings.features.basemap && branding.mapStyle !== "none" ? branding.mapStyle : "none";
    const reduced = typeof window !== "undefined" && window.matchMedia?.("(prefers-reduced-motion: reduce)").matches;
    const map = new PlanMap(el, {
      bundle: b, levelId: st.levelId, theme: st.theme, threeD: st.view === "3d", basemap, initial: controller.getInitialCamera(), reducedMotion: reduced,
      padding: isMobile ? { bottom: 140, top: 60 } : { top: 60 },
    });
    let cancelled = false;
    const off = map.on("ready", () => { if (!cancelled) setLoading(false); });
    controller.attachMap(map);
    map.init().catch((e) => { console.error(e); if (!cancelled) { setLoading(false); controller.notify(t("errorLoading")); } });
    const ro = new ResizeObserver(() => map.resize());
    ro.observe(el);
    return () => { cancelled = true; off(); ro.disconnect(); controller.detachMap(); map.destroy(); };
    // The map is created exactly once; later state flows through the controller.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [controller]);

  useEffect(() => { controller.getMap()?.setPadding(isMobile ? { bottom: 140, left: 16 } : { bottom: 16, left: 16 }); }, [isMobile, controller]);

  return (
    <div className="tv-map-wrap" role="region" aria-label={t("map")}>
      <div ref={ref} className="tv-map" />
      {webgl === false && (
        <div className="absolute inset-0 flex items-center justify-center p-6 text-center"><p className="tv-card max-w-md m-0">{t("webglMissing")}</p></div>
      )}
      {webgl !== false && loading && (
        <div className="absolute inset-0 flex flex-col items-center justify-center gap-3 pointer-events-none" aria-live="polite"><span className="tv-spinner" /><span className="tv-muted">{t("loadingMap")}</span></div>
      )}
      {s.mapError && !loading && <div className="tv-toast" role="alert">{s.mapError}</div>}
    </div>
  );
}

"use client";
/**
 * Root client component of the public viewer. Creates the controller on mount (never during SSR), wires analytics,
 * the embed bridge, the version poller, kiosk idle reset and theming, and lays out header + panel + map.
 */
import { useEffect, useMemo, useRef, useState } from "react";
import type { PlanBundle } from "@/lib/domain/types";
import { isRtl, makeTranslator } from "@/lib/i18n";
import type { ViewerParams } from "@/lib/sdk-protocol";
import { createAnalytics } from "@/lib/viewer/analytics";
import { ViewerController } from "@/lib/viewer/controller";
import { attachEmbedBridge, isEmbedded } from "@/lib/viewer/embed-bridge";
import { ViewerContext, useT, useViewer, useViewerState, type ViewerContextValue } from "./context";
import { Dialogs } from "./Dialogs";
import { MapCanvas } from "./MapCanvas";
import { MapControls } from "./MapControls";
import { Panel } from "./Panel";
import { TopBar } from "./TopBar";

export interface FloorPlanViewerProps {
  bundle: PlanBundle;
  params: ViewerParams;
  slug: string;
  /** Live (unpublished) data is shown; the poller refetches with `?preview=1`. */
  preview?: boolean;
}

const KIOSK_IDLE_MS = 90_000;
const VERSION_POLL_MS = 60_000;

function useMediaQuery(q: string): boolean {
  const [m, setM] = useState(false);
  useEffect(() => {
    const mq = window.matchMedia(q);
    const on = () => setM(mq.matches);
    on();
    mq.addEventListener("change", on);
    return () => mq.removeEventListener("change", on);
  }, [q]);
  return m;
}

export function FloorPlanViewer({ bundle, params, slug, preview }: FloorPlanViewerProps) {
  const [controller, setController] = useState<ViewerController | null>(null);
  const isMobile = useMediaQuery("(max-width: 767px)");

  useEffect(() => {
    const embedded = isEmbedded(params.embed);
    const analytics = createAnalytics({ slug, consent: params.consent });
    const c = new ViewerController({ bundle, params, slug, analytics, browserLanguages: navigator.languages, isEmbedded: embedded });
    const bridge = attachEmbedBridge(c, { allowedOrigins: bundle.event.settings.embed.allowedOrigins, force: params.embed === "1" });
    // Mount-only initialisation of a browser-only controller (needs navigator/window); a cascading render here is intended.
    // eslint-disable-next-line react-hooks/set-state-in-effect
    setController(c);
    return () => { bridge.destroy(); c.destroy(); analytics.destroy(); };
    // Constructed once per page load; the bundle prop only changes through the version poller (controller.setBundle).
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  if (!controller) {
    return (
      <div className="tv-root" style={{ ["--tv-primary" as string]: bundle.event.settings.branding.primaryColor }}>
        <div className="flex-1 flex flex-col items-center justify-center gap-3"><span className="tv-spinner" /><span className="tv-muted">{bundle.event.name}</span></div>
      </div>
    );
  }
  return <Shell controller={controller} isMobile={isMobile} preview={!!preview} />;
}

function Shell({ controller, isMobile, preview }: { controller: ViewerController; isMobile: boolean; preview: boolean }) {
  const state = controller.snapshot();
  const [, force] = useState(0);
  useEffect(() => controller.subscribe(() => force((n) => n + 1)), [controller]);
  const s = controller.snapshot();
  const terms = s.bundle.event.settings.terms;
  const value = useMemo<ViewerContextValue>(() => ({ controller, t: makeTranslator(s.locale, terms), terms, locale: s.locale, isMobile }), [controller, s.locale, terms, isMobile]);
  void state;
  return (
    <ViewerContext.Provider value={value}>
      <Root preview={preview} />
    </ViewerContext.Provider>
  );
}

function Root({ preview }: { preview: boolean }) {
  const { controller, locale } = useViewer();
  const s = useViewerState();
  const t = useT();
  const b = s.bundle;
  const branding = b.event.settings.branding;
  const [idle, setIdle] = useState(false);
  const idleTimer = useRef<ReturnType<typeof setTimeout> | null>(null);

  // Document language / direction.
  useEffect(() => {
    document.documentElement.lang = locale;
    document.documentElement.dir = isRtl(locale) ? "rtl" : "ltr";
    document.title = `${b.event.name}`;
  }, [locale, b.event.name]);

  // Kiosk idle reset.
  useEffect(() => {
    if (!s.kiosk) return;
    const arm = () => {
      if (idleTimer.current) clearTimeout(idleTimer.current);
      idleTimer.current = setTimeout(() => { controller.reset(); setIdle(true); }, KIOSK_IDLE_MS);
    };
    const wake = () => { setIdle(false); arm(); };
    arm();
    for (const ev of ["pointerdown", "keydown", "touchstart", "wheel"]) window.addEventListener(ev, wake, { passive: true });
    return () => { if (idleTimer.current) clearTimeout(idleTimer.current); for (const ev of ["pointerdown", "keydown", "touchstart", "wheel"]) window.removeEventListener(ev, wake); };
  }, [s.kiosk, controller]);

  // Version polling → live bundle refresh.
  useEffect(() => {
    let alive = true;
    const tick = async () => {
      try {
        const res = await fetch(`/e/${encodeURIComponent(controller.slug)}/version.json`, { cache: "no-store" });
        if (!res.ok) return;
        const v = (await res.json()) as { version: number };
        if (!alive || typeof v.version !== "number" || v.version === controller.bundle.version) return;
        const data = await fetch(`/e/${encodeURIComponent(controller.slug)}/data.json${preview ? "?preview=1" : ""}`, { cache: "no-store" });
        if (!data.ok || !alive) return;
        const next = (await data.json()) as PlanBundle;
        if (next?.format === "tessera.bundle" && next.version !== controller.bundle.version) { controller.setBundle(next); controller.notify(t("updateAvailable")); }
      } catch { /* offline: try again next tick */ }
    };
    const timer = setInterval(tick, VERSION_POLL_MS);
    return () => { alive = false; clearInterval(timer); };
  }, [controller, preview, t]);

  const style = {
    "--tv-primary": branding.primaryColor,
    "--tv-accent": branding.accentColor,
    ...(s.theme === "light" ? { "--tv-bg": branding.backgroundColor } : {}),
    ...(branding.fontFamily ? { "--tv-font": branding.fontFamily } : {}),
  } as React.CSSProperties;

  return (
    <div className="tv-root" data-theme={s.theme} data-kiosk={s.kiosk ? "1" : undefined} dir={isRtl(locale) ? "rtl" : "ltr"} style={style}>
      {branding.customCss && <style dangerouslySetInnerHTML={{ __html: branding.customCss }} />}
      <TopBar />
      <div className="tv-body">
        <Panel />
        <div className="tv-map-wrap">
          <MapCanvas />
          <MapControls />
        </div>
      </div>
      <Dialogs />
      {s.notice && <div className="tv-toast" role="status">{s.notice}</div>}
      {s.kiosk && idle && (
        <div className="tv-kiosk-idle" onPointerDown={() => setIdle(false)} role="button" tabIndex={0} aria-label={t("kioskIdle")}>
          {branding.logoUrl ? (
            // eslint-disable-next-line @next/next/no-img-element -- organiser logo
            <img src={branding.logoUrl} alt="" style={{ width: 120, height: 120, borderRadius: 24 }} />
          ) : null}
          <div className="text-3xl font-bold">{b.event.name}</div>
          <div className="text-xl opacity-90">{t("kioskIdle")}</div>
        </div>
      )}
      <PrintSummary />
    </div>
  );
}

/** Print-only summary: what is selected + route steps (the map canvas prints on its own). */
function PrintSummary() {
  const { controller } = useViewer();
  const s = useViewerState();
  const t = useT();
  const ex = s.panel.kind === "exhibitor" ? s.bundle.exhibitors.find((e) => e.id === (s.panel as { id: string }).id) : null;
  return (
    <div className="tv-print">
      <h1 style={{ fontSize: 18, margin: "0 0 4px" }}>{s.bundle.event.name}</h1>
      {ex && <p style={{ margin: 0 }}><strong>{ex.name}</strong> — {ex.boothLabels.join(", ")}</p>}
      {s.route && (
        <ol style={{ margin: "8px 0 0", paddingInlineStart: 18 }}>
          <li>{t("from")}: {controller.endpointLabel(s.route.from) || t("yourLocation")} → {t("to")}: {controller.endpointLabel(s.route.to)} ({t("meters", { n: Math.round(s.route.distanceM) })}, {t("minutes", { n: Math.max(1, Math.round(s.route.durationSeconds / 60)) })})</li>
          {s.route.steps.map((st, i) => <li key={i}>{st.instruction}{st.distanceM ? ` (${Math.round(st.distanceM)} m)` : ""}</li>)}
        </ol>
      )}
      {s.bookmarks.length > 0 && <p style={{ margin: "8px 0 0" }}>{t("myPlan")}: {controller.getBookmarks().map((x) => x.name).join(", ")}</p>}
    </div>
  );
}

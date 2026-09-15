"use client";
import { useEffect, useRef } from "react";
import { useT, useViewer, useViewerState } from "./context";
import { Icon } from "./icons";

export function TopBar() {
  const { controller, isMobile } = useViewer();
  const s = useViewerState();
  const t = useT();
  const b = s.bundle;
  const f = b.event.settings.features;
  const branding = b.event.settings.branding;
  const inputRef = useRef<HTMLInputElement>(null);

  useEffect(() => { if (s.searchFocused) inputRef.current?.focus(); }, [s.searchFocused]);

  if (!s.visibility.header || s.noOverlay) return null;
  const langs = b.event.settings.languages;

  const share = async () => {
    const url = await controller.share(s.panel.kind === "exhibitor" ? "exhibitor" : s.route ? "route" : "view", { silent: true, title: b.event.name });
    if (typeof navigator !== "undefined" && typeof navigator.share === "function" && !s.kiosk) {
      try { await navigator.share({ title: b.event.name, text: t("shareText", { name: b.event.name, event: b.event.name }), url }); return; } catch { /* fall through to dialog */ }
    }
    controller.openDialog({ kind: "share", url, title: b.event.name });
  };

  return (
    <header className="tv-header">
      <div className="flex items-center gap-2 min-w-0" style={{ flex: isMobile ? "0 1 auto" : "0 0 auto", maxWidth: isMobile ? 120 : 280 }}>
        {branding.logoUrl ? (
          // eslint-disable-next-line @next/next/no-img-element -- organiser-provided logo (arbitrary URL)
          <img src={branding.logoUrl} alt="" className="w-8 h-8 rounded-lg object-cover flex-none" />
        ) : null}
        <div className="min-w-0">
          <div className="font-semibold truncate leading-tight">{b.event.name}</div>
          {!isMobile && b.event.subtitle && <div className="tv-muted text-xs truncate">{b.event.subtitle}</div>}
        </div>
      </div>
      {f.search && (
        <div className="flex-1 min-w-0 relative">
          <Icon name="search" className="absolute top-1/2 -translate-y-1/2 tv-muted pointer-events-none" style={{ insetInlineStart: 10 }} size={18} />
          <input
            ref={inputRef}
            type="search"
            className="tv-input"
            style={{ paddingInlineStart: 36 }}
            placeholder={t("searchPlaceholder")}
            aria-label={t("search")}
            value={s.searchQuery}
            onChange={(e) => controller.setSearchQuery(e.target.value)}
            onFocus={() => { controller.setSearchFocused(true); controller.setPanelOpen(true); if (s.panel.kind !== "list") controller.setTab("exhibitors"); }}
            onBlur={() => controller.setSearchFocused(false)}
            onKeyDown={(e) => { if (e.key === "Escape") { controller.setSearchQuery(""); (e.target as HTMLInputElement).blur(); } }}
            enterKeyHint="search"
            autoComplete="off"
          />
        </div>
      )}
      <div className="flex items-center gap-1.5 flex-none">
        {langs.length > 1 && <button type="button" className="tv-icon-btn" onClick={() => controller.openDialog({ kind: "language" })} aria-label={t("language")} title={t("language")}><Icon name="globe" /></button>}
        {!isMobile && <button type="button" className="tv-icon-btn" onClick={() => controller.setTheme("toggle")} aria-label={s.theme === "dark" ? t("light") : t("dark")} title={s.theme === "dark" ? t("light") : t("dark")}><Icon name={s.theme === "dark" ? "sun" : "moon"} /></button>}
        {!isMobile && !s.kiosk && <button type="button" className="tv-icon-btn" onClick={() => window.print()} aria-label={t("print")} title={t("print")}><Icon name="print" /></button>}
        {f.sharing && <button type="button" className="tv-icon-btn" onClick={share} aria-label={t("share")} title={t("share")}><Icon name="share" /></button>}
        {s.kiosk && <button type="button" className="tv-icon-btn" onClick={() => controller.reset()} aria-label={t("resetView")} title={t("resetView")}><Icon name="reset" /></button>}
      </div>
    </header>
  );
}

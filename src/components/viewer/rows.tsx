"use client";
/** Shared list rows and small presentational bits (exhibitor row, sponsor badge, chips). */
import type { BundleExhibitor, BundleSession, SponsorLevel } from "@/lib/domain/types";
import type { SearchResult } from "@/lib/viewer/search";
import { formatTime, useT, useViewer, useViewerState } from "./context";
import { Icon } from "./icons";

export function SponsorBadge({ level }: { level: SponsorLevel | null | undefined }) {
  const t = useT();
  if (!level) return null;
  return <span className={`tv-badge tv-badge-${level}`}>{t(level)}</span>;
}

export function Logo({ ex, size }: { ex: BundleExhibitor; size?: number }) {
  const style = size ? { width: size, height: size } : undefined;
  if (ex.logoUrl) {
    // eslint-disable-next-line @next/next/no-img-element -- exhibitor logos are arbitrary URLs / data URIs
    return <img src={ex.logoUrl} alt="" className="tv-logo" style={style} loading="lazy" />;
  }
  return <div className="tv-logo flex items-center justify-center font-bold tv-muted" style={style} aria-hidden="true">{ex.name.slice(0, 2).toUpperCase()}</div>;
}

export function ExhibitorRow({ ex, onSelect, current }: { ex: BundleExhibitor; onSelect: (ex: BundleExhibitor) => void; current?: boolean }) {
  const { controller } = useViewer();
  const s = useViewerState();
  const t = useT();
  const b = s.bundle;
  const booths = ex.boothIds.map((id) => b.booths.find((x) => x.id === id)).filter(Boolean);
  const levelNames = [...new Set(booths.map((x) => b.levels.find((l) => l.id === x!.levelId)?.shortName).filter(Boolean))];
  const cats = ex.categoryIds.map((id) => b.categories.find((c) => c.id === id)).filter(Boolean).slice(0, 2);
  const bookmarked = controller.isBookmarked("exhibitor", ex.id);
  const visited = controller.isVisited("exhibitor", ex.id);
  return (
    <div className="tv-row h-full" role="listitem" aria-current={current || undefined} style={{ cursor: "pointer" }} onClick={() => onSelect(ex)} onKeyDown={(e) => { if (e.key === "Enter" || e.key === " ") { e.preventDefault(); onSelect(ex); } }} tabIndex={0}>
      <Logo ex={ex} />
      <div className="flex-1 min-w-0">
        <div className="flex items-center gap-2 min-w-0">
          <span className="font-semibold truncate">{ex.name}</span>
          {ex.featured && !ex.sponsorLevel && <Icon name="star" size={14} filled className="text-[var(--tv-accent)] flex-none" />}
          <SponsorBadge level={ex.sponsorLevel} />
          {visited && <Icon name="check" size={14} className="tv-muted flex-none" />}
        </div>
        <div className="flex items-center gap-1 mt-1 flex-wrap overflow-hidden" style={{ maxHeight: 22 }}>
          {ex.boothLabels.length > 0 && <span className="tv-chip tv-chip-primary">{levelNames.length && b.levels.length > 1 ? `${levelNames.join("/")} · ` : ""}{ex.boothLabels.slice(0, 3).join(", ")}{ex.boothLabels.length > 3 ? " …" : ""}</span>}
          {cats.map((c) => <span key={c!.id} className="tv-chip"><span className="tv-chip-dot" style={{ background: c!.color ?? "var(--tv-primary)" }} />{c!.name}</span>)}
        </div>
      </div>
      {b.event.settings.features.bookmarks && (
        <button type="button" className="tv-icon-btn !border-0 !bg-transparent" style={{ color: bookmarked ? "var(--tv-accent)" : "var(--tv-muted)" }} aria-pressed={bookmarked} aria-label={bookmarked ? t("removeBookmark") : t("bookmark")} onClick={(e) => { e.stopPropagation(); controller.toggleBookmark("exhibitor", ex.id); }}>
          <Icon name="bookmark" filled={bookmarked} />
        </button>
      )}
    </div>
  );
}

export function SearchResultRow({ r }: { r: SearchResult }) {
  const { controller, terms } = useViewer();
  const s = useViewerState();
  const t = useT();
  const b = s.bundle;
  if (r.type === "exhibitor") {
    const ex = b.exhibitors.find((e) => e.id === r.id);
    return ex ? <ExhibitorRow ex={ex} onSelect={(x) => controller.openExhibitor(x.id)} /> : null;
  }
  const icon = r.type === "booth" ? "pin" : r.type === "category" ? "layers" : r.type === "session" ? "calendar" : "info";
  const kind = r.type === "booth" ? terms.booth : r.type === "category" ? t("categories") : r.type === "session" ? t("sessions") : t("poi");
  const level = r.levelId ? b.levels.find((l) => l.id === r.levelId)?.shortName : null;
  return (
    <button type="button" className="tv-row h-full" role="listitem" onClick={() => controller.openSearchResult(r)}>
      <span className="tv-step-icon" style={{ width: 40, height: 40 }}><Icon name={icon} /></span>
      <span className="flex-1 min-w-0">
        <span className="font-semibold truncate block">{r.type === "booth" ? `${terms.booth} ${r.title}` : r.title}</span>
        <span className="tv-muted text-xs truncate block">{[kind, r.subtitle, level && b.levels.length > 1 ? level : null].filter(Boolean).join(" · ")}</span>
      </span>
      <Icon name="chevron" className="tv-muted" />
    </button>
  );
}

export function SessionRow({ se, current }: { se: BundleSession; current?: boolean }) {
  const { controller, locale } = useViewer();
  const s = useViewerState();
  const t = useT();
  const tz = s.bundle.event.timezone;
  const now = Date.now();
  const live = Date.parse(se.startsAt) <= now && Date.parse(se.endsAt) >= now;
  const past = Date.parse(se.endsAt) < now;
  const where = controller.sessionLocationName(se);
  const bookmarked = controller.isBookmarked("session", se.id);
  return (
    <div className="tv-row h-full" role="listitem" aria-current={current || undefined} tabIndex={0} onClick={() => controller.openSession(se.id)} onKeyDown={(e) => { if (e.key === "Enter" || e.key === " ") { e.preventDefault(); controller.openSession(se.id); } }} style={{ opacity: past ? 0.6 : 1 }}>
      <div className="flex-none text-center" style={{ width: 52 }}>
        <div className="font-semibold text-sm leading-tight">{formatTime(se.startsAt, locale, tz)}</div>
        <div className="tv-muted text-xs">{formatTime(se.endsAt, locale, tz)}</div>
      </div>
      <div className="flex-1 min-w-0">
        <div className="font-semibold truncate">{se.title}</div>
        <div className="flex items-center gap-1 mt-1 flex-wrap overflow-hidden" style={{ maxHeight: 22 }}>
          {live && <span className="tv-badge" style={{ background: "#dc2626" }}>{t("liveSession")}</span>}
          {where && <span className="tv-chip tv-chip-primary">{where}</span>}
          {se.track && <span className="tv-chip">{se.track}</span>}
        </div>
      </div>
      {s.bundle.event.settings.features.bookmarks && (
        <button type="button" className="tv-icon-btn !border-0 !bg-transparent" style={{ color: bookmarked ? "var(--tv-accent)" : "var(--tv-muted)" }} aria-pressed={bookmarked} aria-label={bookmarked ? t("removeBookmark") : t("bookmark")} onClick={(e) => { e.stopPropagation(); controller.toggleBookmark("session", se.id); }}>
          <Icon name="bookmark" filled={bookmarked} />
        </button>
      )}
    </div>
  );
}

export function PanelHeader({ title, onBack, actions }: { title: string; onBack: () => void; actions?: React.ReactNode }) {
  const t = useT();
  return (
    <div className="flex items-center gap-2 px-3 py-2 border-b flex-none" style={{ borderColor: "var(--tv-border)" }}>
      <button type="button" className="tv-icon-btn !border-0" onClick={onBack} aria-label={t("back")}><Icon name="back" /></button>
      <h2 className="flex-1 m-0 text-base font-semibold truncate">{title}</h2>
      {actions}
    </div>
  );
}

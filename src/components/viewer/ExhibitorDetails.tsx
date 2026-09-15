"use client";
import { useState } from "react";
import type { BundleExhibitor } from "@/lib/domain/types";
import { Banner } from "./Banner";
import { formatPrice, formatTime, useT, useViewer, useViewerState } from "./context";
import { Icon, type IconName } from "./icons";
import { Logo, PanelHeader, SponsorBadge } from "./rows";

const SOCIAL_LABELS: Record<string, string> = { linkedin: "LinkedIn", x: "X", twitter: "X", facebook: "Facebook", instagram: "Instagram", youtube: "YouTube", tiktok: "TikTok", github: "GitHub" };

function youtubeEmbed(url: string): string | null {
  const m = url.match(/(?:youtu\.be\/|v=|embed\/)([\w-]{6,})/);
  return m ? `https://www.youtube.com/embed/${m[1]}` : null;
}

export function ExhibitorDetails({ ex }: { ex: BundleExhibitor }) {
  const { controller, terms, locale } = useViewer();
  const s = useViewerState();
  const t = useT();
  const b = s.bundle;
  const f = b.event.settings.features;
  const [more, setMore] = useState(false);
  const booths = ex.boothIds.map((id) => b.booths.find((x) => x.id === id)).filter((x): x is NonNullable<typeof x> => !!x);
  const cats = ex.categoryIds.map((id) => b.categories.find((c) => c.id === id)).filter((x): x is NonNullable<typeof x> => !!x);
  const extras = ex.extraIds.map((id) => b.extras.find((x) => x.id === id)).filter((x): x is NonNullable<typeof x> => !!x);
  const sessions = b.sessions.filter((se) => se.boothId && ex.boothIds.includes(se.boothId));
  const co = booths.flatMap((bo) => bo.exhibitorIds).filter((id) => id !== ex.id).map((id) => b.exhibitors.find((e) => e.id === id)).filter((x): x is NonNullable<typeof x> => !!x);
  const bookmarked = controller.isBookmarked("exhibitor", ex.id);
  const desc = ex.description ?? "";
  const long = desc.length > 260;
  const video = ex.videoUrl ? youtubeEmbed(ex.videoUrl) : null;
  const link = (url: string, label: string, icon: IconName) => (
    <button key={url} type="button" className="tv-btn tv-btn-outline tv-btn-sm" onClick={() => controller.openExternal(url, label)}><Icon name={icon} size={16} />{label}</button>
  );
  const routeTo = f.wayfinding && booths.length > 0;

  return (
    <div className="flex flex-col flex-1 min-h-0">
      <PanelHeader title={ex.name} onBack={() => controller.back()} actions={f.sharing ? <button type="button" className="tv-icon-btn !border-0" aria-label={t("share")} onClick={() => void controller.share("exhibitor", { title: ex.name })}><Icon name="share" /></button> : undefined} />
      <div className="tv-panel-content tv-scrollbar">
        <div className="px-4 pt-3"><Banner placement="detail_top" /></div>
        {ex.leadingImageUrl && (
          // eslint-disable-next-line @next/next/no-img-element -- exhibitor media
          <img src={ex.leadingImageUrl} alt="" className="w-full object-cover mt-3" style={{ maxHeight: 180 }} />
        )}
        <div className="px-4 py-3 flex flex-col gap-3">
          <div className="flex items-start gap-3">
            <Logo ex={ex} size={64} />
            <div className="min-w-0 flex-1">
              <h1 className="m-0 text-lg font-bold leading-tight">{ex.name}</h1>
              <div className="flex items-center gap-2 mt-1 flex-wrap">
                <SponsorBadge level={ex.sponsorLevel} />
                {ex.featured && !ex.sponsorLevel && <span className="tv-badge">{t("featured")}</span>}
                {[ex.city, ex.country].filter(Boolean).length > 0 && <span className="tv-muted text-xs">{[ex.city, ex.country].filter(Boolean).join(", ")}</span>}
              </div>
            </div>
          </div>
          {booths.length > 0 && (
            <div className="flex flex-wrap gap-2">
              {booths.map((bo) => {
                const lvl = b.levels.find((l) => l.id === bo.levelId);
                return (
                  <button key={bo.id} type="button" className="tv-chip tv-chip-primary" style={{ minHeight: 30, padding: "0 10px" }} onClick={() => controller.focusBooth(bo.id)}>
                    <Icon name="pin" size={14} />{terms.booth} {bo.label}{lvl && b.levels.length > 1 ? ` · ${lvl.shortName}` : ""}
                  </button>
                );
              })}
            </div>
          )}
          <div className="flex gap-2 flex-wrap">
            {routeTo && <button type="button" className="tv-btn tv-btn-primary" onClick={() => controller.startDirections({ type: "exhibitor", id: ex.id })}><Icon name="directions" />{t("directions")}</button>}
            {f.bookmarks && <button type="button" className="tv-btn tv-btn-outline" aria-pressed={bookmarked} onClick={() => controller.toggleBookmark("exhibitor", ex.id)} style={bookmarked ? { color: "var(--tv-accent)" } : undefined}><Icon name="bookmark" filled={bookmarked} />{bookmarked ? t("bookmarked") : t("bookmark")}</button>}
            {ex.customButtonUrl && <button type="button" className="tv-btn tv-btn-accent" onClick={() => controller.customButtonClick(ex)}><Icon name="ticket" />{ex.customButtonTitle || t("moreInfo")}</button>}
          </div>
          {cats.length > 0 && (
            <div className="flex flex-wrap gap-1">
              {cats.map((c) => <button key={c.id} type="button" className="tv-chip" onClick={() => controller.selectCategory(c.id)}><span className="tv-chip-dot" style={{ background: c.color ?? "var(--tv-primary)" }} />{c.name}</button>)}
            </div>
          )}
          {desc && (
            <div>
              <p className={`m-0 whitespace-pre-line ${long && !more ? "tv-clamp" : ""}`}>{desc}</p>
              {long && <button type="button" className="tv-btn tv-btn-ghost tv-btn-sm mt-1 -ml-2" onClick={() => setMore(!more)} aria-expanded={more}>{more ? t("readLess") : t("readMore")}</button>}
            </div>
          )}
          {(ex.website || ex.email || ex.phone || Object.keys(ex.socials).length > 0) && (
            <div className="flex flex-wrap gap-2">
              {ex.website && link(ex.website, t("website"), "link")}
              {ex.email && !s.kiosk && link(`mailto:${ex.email}`, t("email"), "mail")}
              {ex.phone && !s.kiosk && link(`tel:${ex.phone.replace(/\s+/g, "")}`, ex.phone, "phone")}
              {Object.entries(ex.socials).map(([k, url]) => url && link(url, SOCIAL_LABELS[k.toLowerCase()] ?? k, "globe"))}
            </div>
          )}
          {ex.address && <p className="m-0 tv-muted text-sm"><Icon name="pin" size={14} className="inline -mt-0.5 mr-1" />{[ex.address, ex.zip, ex.city, ex.country].filter(Boolean).join(", ")}</p>}
          {ex.tags.length > 0 && <div className="flex flex-wrap gap-1">{ex.tags.map((tag) => <span key={tag} className="tv-chip">#{tag}</span>)}</div>}
          {video && (
            <div className="rounded-xl overflow-hidden" style={{ aspectRatio: "16/9" }}>
              <iframe src={video} title={t("video")} className="w-full h-full border-0" allow="accelerometer; encrypted-media; picture-in-picture" allowFullScreen loading="lazy" />
            </div>
          )}
          {ex.gallery.length > 0 && (
            <div>
              <h3 className="m-0 mb-2 text-sm font-semibold">{t("gallery")}</h3>
              <div className="flex gap-2 overflow-x-auto pb-1">
                {ex.gallery.map((url, i) => (
                  // eslint-disable-next-line @next/next/no-img-element -- exhibitor gallery
                  <img key={i} src={url} alt="" className="rounded-lg object-cover flex-none" style={{ width: 160, height: 110 }} loading="lazy" />
                ))}
              </div>
            </div>
          )}
          {extras.length > 0 && (
            <div>
              <h3 className="m-0 mb-1 text-sm font-semibold">{extras.some((x) => x.kind === "sponsorship") ? t("sponsorships") : t("extras")}</h3>
              <ul className="m-0 p-0 list-none flex flex-col gap-1">
                {extras.map((x) => <li key={x.id} className="text-sm flex items-center gap-2"><Icon name="check" size={14} className="tv-muted" /><span className="flex-1">{x.name}</span>{f.showPrices && x.priceCents != null && <span className="tv-muted">{formatPrice(x.priceCents, x.currency, locale)}</span>}</li>)}
              </ul>
            </div>
          )}
          {sessions.length > 0 && (
            <div>
              <h3 className="m-0 mb-1 text-sm font-semibold">{t("sessionsAtBooth")}</h3>
              <ul className="m-0 p-0 list-none flex flex-col gap-1">
                {sessions.map((se) => (
                  <li key={se.id}>
                    <button type="button" className="tv-row rounded-lg !px-2" onClick={() => controller.openSession(se.id)}>
                      <Icon name="calendar" className="tv-muted flex-none" />
                      <span className="flex-1 min-w-0 text-start"><span className="block font-medium truncate">{se.title}</span><span className="block tv-muted text-xs">{formatTime(se.startsAt, locale, b.event.timezone)} – {formatTime(se.endsAt, locale, b.event.timezone)}</span></span>
                    </button>
                  </li>
                ))}
              </ul>
            </div>
          )}
          {co.length > 0 && (
            <div>
              <h3 className="m-0 mb-1 text-sm font-semibold">{t("coExhibitors")}</h3>
              <div className="flex flex-wrap gap-1">{co.map((c) => <button key={c.id} type="button" className="tv-chip" onClick={() => controller.openExhibitor(c.id)}>{c.name}</button>)}</div>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}

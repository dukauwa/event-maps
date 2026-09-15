"use client";
import { useEffect, useMemo, useRef } from "react";
import type { BannerPlacement, BundleBanner } from "@/lib/domain/types";
import { useT, useViewer, useViewerState } from "./context";

/** Weighted pick that is stable for the session (so lists do not reshuffle on every render). */
function pickBanner(banners: BundleBanner[], placement: BannerPlacement, seed: number): BundleBanner | null {
  const pool = banners.filter((b) => b.placement === placement);
  if (!pool.length) return null;
  const total = pool.reduce((s, b) => s + Math.max(1, b.weight), 0);
  let r = ((seed % 1000) / 1000) * total;
  for (const b of pool) { r -= Math.max(1, b.weight); if (r <= 0) return b; }
  return pool[pool.length - 1];
}

let seed = Math.floor(Math.random() * 1000);

export function Banner({ placement, index = 0, className }: { placement: BannerPlacement; index?: number; className?: string }) {
  const { controller } = useViewer();
  const s = useViewerState();
  const t = useT();
  const banner = useMemo(() => (s.bundle.event.settings.features.sponsorBanners ? pickBanner(s.bundle.banners, placement, seed + index * 37) : null), [s.bundle, placement, index]);
  const ref = useRef<HTMLButtonElement>(null);
  const seen = useRef(false);

  useEffect(() => {
    seen.current = false;
    const el = ref.current;
    if (!el || !banner) return;
    if (typeof IntersectionObserver === "undefined") { controller.trackBanner(banner.id, "impression"); return; }
    const io = new IntersectionObserver((entries) => {
      if (entries.some((e) => e.isIntersecting) && !seen.current) { seen.current = true; controller.trackBanner(banner.id, "impression"); io.disconnect(); }
    }, { threshold: 0.5 });
    io.observe(el);
    return () => io.disconnect();
  }, [banner, controller]);

  if (!banner) return null;
  const title = banner.title ?? t("sponsorBanner");
  return (
    <button
      ref={ref}
      type="button"
      className={`tv-banner ${className ?? ""}`}
      aria-label={title}
      onClick={() => {
        controller.trackBanner(banner.id, "click");
        if (banner.linkUrl) controller.openExternal(banner.linkUrl, title);
        else if (banner.exhibitorId) controller.openExhibitor(banner.exhibitorId);
      }}
    >
      {/* eslint-disable-next-line @next/next/no-img-element -- sponsor creatives are arbitrary remote/data URLs */}
      <img src={banner.imageUrl} alt={title} loading="lazy" />
    </button>
  );
}

/** Re-seed once per page load (exported for tests / kiosk resets). */
export function reseedBanners() { seed = Math.floor(Math.random() * 1000); }

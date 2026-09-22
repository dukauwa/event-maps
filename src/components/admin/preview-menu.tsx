"use client";
/**
 * "Preview as" for organisers: the same draft plan through each audience's eyes. Attendee and booking views open
 * the public viewer with `?preview=1` (live data, org-only); the exhibitor portal opens a real magic link.
 */
import * as React from "react";
import { api, cn, toast } from "@/components/ui";

export interface PreviewMenuProps { eventId: string; slug: string; origin?: string; salesEnabled: boolean; className?: string; size?: "sm" | "md" }

export function PreviewMenu({ eventId, slug, origin = "", salesEnabled, className, size = "md" }: PreviewMenuProps) {
  const [open, setOpen] = React.useState(false);
  const [busy, setBusy] = React.useState(false);
  const ref = React.useRef<HTMLDivElement>(null);
  React.useEffect(() => {
    if (!open) return;
    const onDoc = (e: MouseEvent) => { if (!ref.current?.contains(e.target as Node)) setOpen(false); };
    const onKey = (e: KeyboardEvent) => { if (e.key === "Escape") setOpen(false); };
    document.addEventListener("mousedown", onDoc);
    window.addEventListener("keydown", onKey);
    return () => { document.removeEventListener("mousedown", onDoc); window.removeEventListener("keydown", onKey); };
  }, [open]);
  const base = `${origin}/e/${encodeURIComponent(slug)}`;
  const openWin = (url: string) => { window.open(url, "_blank", "noopener"); setOpen(false); };
  const openPortal = async () => {
    setBusy(true);
    try {
      const exs = await api<{ id: string; name: string }[]>(`/api/v1/events/${eventId}/exhibitors?limit=1`);
      if (!exs.length) { toast("Add an exhibitor first — the portal is what they see after signing in with their magic link.", "info"); return; }
      const link = await api<{ url: string }>(`/api/v1/events/${eventId}/exhibitors/${exs[0].id}/portal-link`);
      openWin(link.url);
    } catch (e) { toast(e instanceof Error ? e.message : "Could not open the portal", "error"); } finally { setBusy(false); }
  };
  const items: { label: string; hint: string; onClick: () => void; disabled?: boolean }[] = [
    { label: "Attendee view", hint: "Public map: exhibitors, search, wayfinding", onClick: () => openWin(`${base}?preview=1`) },
    { label: "Exhibitor booking view", hint: salesEnabled ? "Available stands, prices, Reserve / Buy" : "Enable booth sales in Settings", onClick: () => openWin(`${base}/book?preview=1`), disabled: !salesEnabled },
    { label: "Exhibitor portal", hint: "Signed in as your first exhibitor", onClick: () => void openPortal() },
    { label: "Kiosk", hint: "Touch-screen mode with idle reset", onClick: () => openWin(`${base}?preview=1&kiosk=1`) },
    { label: "Embedded", hint: "As an iframe on a website", onClick: () => openWin(`${base}/embed?preview=1`) },
  ];
  return (
    <div ref={ref} className={cn("relative", className)}>
      <button type="button" onClick={() => setOpen((o) => !o)} aria-haspopup="menu" aria-expanded={open} className={cn("inline-flex items-center gap-1.5 rounded-lg border border-border bg-surface font-medium hover:bg-gray-50", size === "sm" ? "h-8 px-2.5 text-sm" : "h-10 px-4 text-sm", open && "bg-gray-100")}>
        Preview as <span aria-hidden className="text-gray-400">▾</span>
      </button>
      {open && (
        <div role="menu" className="absolute right-0 top-full z-50 mt-1 w-72 overflow-hidden rounded-lg border border-border bg-surface py-1 shadow-xl">
          {items.map((it) => (
            <button key={it.label} type="button" role="menuitem" disabled={it.disabled || busy} onClick={it.onClick} className="block w-full px-3 py-2 text-left hover:bg-gray-100 disabled:opacity-40">
              <span className="block text-sm font-medium text-gray-900">{it.label} ↗</span>
              <span className="block text-xs text-gray-500">{it.hint}</span>
            </button>
          ))}
        </div>
      )}
    </div>
  );
}

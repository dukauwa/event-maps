"use client";
import * as React from "react";
import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import { BRAND } from "@/lib/brand";
import { Badge, Button, cn, statusTone, toast } from "@/components/ui";

export interface ShellEvent { id: string; name: string; slug: string; status: "draft" | "published" | "archived" }
export interface ShellUser { name: string; email: string; role: string }

const EVENT_NAV: { seg: string; label: string }[] = [
  { seg: "", label: "Dashboard" },
  { seg: "designer", label: "Designer" },
  { seg: "booths", label: "Booths" },
  { seg: "exhibitors", label: "Exhibitors" },
  { seg: "categories", label: "Categories" },
  { seg: "sessions", label: "Sessions" },
  { seg: "sales", label: "Sales" },
  { seg: "sponsors", label: "Sponsorship & ads" },
  { seg: "analytics", label: "Analytics" },
  { seg: "settings", label: "Settings" },
];

export function AdminShell({ user, orgName, events, children }: { user: ShellUser; orgName: string; events: ShellEvent[]; children: React.ReactNode }) {
  const pathname = usePathname();
  const router = useRouter();
  const [open, setOpen] = React.useState(false);
  const [signingOut, setSigningOut] = React.useState(false);
  const m = pathname.match(/^\/admin\/events\/([^/]+)(?:\/([^/]+))?/);
  const eventId = m?.[1];
  const event = events.find((e) => e.id === eventId);
  const current = m?.[2] ?? "";
  const [prevPath, setPrevPath] = React.useState(pathname);
  if (pathname !== prevPath) { setPrevPath(pathname); setOpen(false); }

  const signOut = async () => {
    setSigningOut(true);
    try {
      await fetch("/api/auth/logout", { method: "POST", credentials: "include" });
      router.push("/login");
      router.refresh();
    } catch {
      toast("Sign out failed", "error");
      setSigningOut(false);
    }
  };

  const link = (href: string, label: React.ReactNode, active: boolean, extra?: string) => (
    <Link key={href} href={href} className={cn("flex items-center justify-between rounded-lg px-3 py-1.5 text-sm transition-colors", active ? "bg-primary/10 font-medium text-primary" : "text-gray-700 hover:bg-gray-100", extra)}>
      {label}
    </Link>
  );

  const nav = (
    <nav className="flex h-full flex-col gap-5 overflow-y-auto p-4">
      <div>
        <Link href="/admin" className="flex items-center gap-2 px-1">
          <span className="grid size-7 place-items-center rounded-lg bg-primary text-sm font-bold text-white">{BRAND.name[0]}</span>
          <span className="text-base font-semibold tracking-tight">{BRAND.name}</span>
        </Link>
        <p className="mt-1 truncate px-1 text-xs text-gray-500">{orgName}</p>
      </div>
      <div className="space-y-0.5">
        {link("/admin", "Events", pathname === "/admin")}
        {link("/admin/settings", "Organisation settings", pathname.startsWith("/admin/settings"))}
        {link("/docs", "Developer docs", false)}
      </div>
      {event && (
        <div>
          <div className="mb-1 flex items-center justify-between px-3">
            <p className="truncate text-xs font-semibold uppercase tracking-wide text-gray-500" title={event.name}>{event.name}</p>
            <Badge tone={statusTone[event.status] ?? "gray"}>{event.status}</Badge>
          </div>
          <div className="space-y-0.5">
            {EVENT_NAV.map((n) => link(`/admin/events/${event.id}${n.seg ? `/${n.seg}` : ""}`, n.label, current === n.seg))}
            <a href={`/e/${event.slug}`} target="_blank" rel="noreferrer" className="flex items-center justify-between rounded-lg px-3 py-1.5 text-sm text-gray-700 hover:bg-gray-100">Open viewer <span aria-hidden>↗</span></a>
          </div>
        </div>
      )}
      {!event && events.length > 0 && (
        <div>
          <p className="mb-1 px-3 text-xs font-semibold uppercase tracking-wide text-gray-500">Recent events</p>
          <div className="space-y-0.5">
            {events.slice(0, 6).map((e) => link(`/admin/events/${e.id}`, <span className="truncate">{e.name}</span>, false))}
          </div>
        </div>
      )}
      <div className="mt-auto border-t border-border pt-4">
        <p className="truncate px-1 text-sm font-medium">{user.name}</p>
        <p className="truncate px-1 text-xs text-gray-500">{user.email} · {user.role}</p>
        <Button size="sm" variant="outline" className="mt-2 w-full" loading={signingOut} onClick={signOut}>Sign out</Button>
      </div>
    </nav>
  );

  return (
    <div className="flex min-h-full flex-1">
      <aside className="hidden w-60 shrink-0 border-r border-border bg-surface lg:block">{nav}</aside>
      {open && (
        <div className="fixed inset-0 z-40 flex lg:hidden">
          <div className="w-64 bg-surface shadow-xl">{nav}</div>
          <button type="button" className="flex-1 bg-black/40" aria-label="Close menu" onClick={() => setOpen(false)} />
        </div>
      )}
      <div className="flex min-w-0 flex-1 flex-col">
        <header className="flex items-center gap-3 border-b border-border bg-surface px-4 py-2 lg:hidden">
          <button type="button" className="rounded-md border border-border px-2 py-1 text-sm" onClick={() => setOpen(true)} aria-label="Open menu">☰</button>
          <span className="font-semibold">{BRAND.name}</span>
          {event && <span className="truncate text-sm text-gray-500">· {event.name}</span>}
        </header>
        <main className="mx-auto w-full max-w-7xl flex-1 px-4 py-6 sm:px-6 lg:px-8">{children}</main>
      </div>
    </div>
  );
}

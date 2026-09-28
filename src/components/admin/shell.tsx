"use client";
import * as React from "react";
import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import { BRAND } from "@/lib/brand";
import { Badge, cn, statusTone, toast } from "@/components/ui";
import { AdminIcon, LogoMark, type AdminIconName } from "./icons";

export interface ShellEvent { id: string; name: string; slug: string; status: "draft" | "published" | "archived" }
export interface ShellUser { name: string; email: string; role: string }

const EVENT_NAV: { seg: string; label: string; icon: AdminIconName }[] = [
  { seg: "", label: "Overview", icon: "dashboard" },
  { seg: "designer", label: "Designer", icon: "designer" },
  { seg: "booths", label: "Booths", icon: "booths" },
  { seg: "exhibitors", label: "Exhibitors", icon: "exhibitors" },
  { seg: "categories", label: "Categories", icon: "tag" },
  { seg: "sessions", label: "Sessions", icon: "sessions" },
  { seg: "sales", label: "Sales", icon: "sales" },
  { seg: "sponsors", label: "Sponsorship & ads", icon: "megaphone" },
  { seg: "analytics", label: "Analytics", icon: "analytics" },
  { seg: "settings", label: "Settings", icon: "settings" },
];

const STATUS_DOT: Record<ShellEvent["status"], string> = { published: "bg-emerald-500", draft: "bg-gray-300", archived: "bg-gray-400" };

function initials(name: string): string {
  return name.split(/\s+/).filter(Boolean).slice(0, 2).map((p) => p[0]!.toUpperCase()).join("") || "?";
}

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

  const item = (href: string, label: React.ReactNode, active: boolean, icon?: AdminIconName, external?: boolean) => {
    const cls = cn(
      "group flex h-8 items-center gap-2.5 rounded-lg px-2.5 text-[13.5px] transition-colors",
      active ? "bg-surface font-medium text-gray-900 shadow-[0_0_0_1px_var(--border),var(--shadow-card)]" : "text-gray-600 hover:bg-gray-100 hover:text-gray-900",
    );
    const inner = (
      <>
        {icon && <AdminIcon name={icon} className={active ? "text-gray-900" : "text-gray-500 group-hover:text-gray-700"} />}
        <span className="min-w-0 flex-1 truncate">{label}</span>
        {external && <AdminIcon name="external" size={13} className="text-gray-400" />}
      </>
    );
    return external
      ? <a key={href} href={href} target="_blank" rel="noreferrer" className={cls}>{inner}</a>
      : <Link key={href} href={href} className={cls} aria-current={active ? "page" : undefined}>{inner}</Link>;
  };

  const group = (label: React.ReactNode, children: React.ReactNode, extra?: React.ReactNode) => (
    <div>
      <div className="mb-1 flex h-6 items-center justify-between gap-2 px-2.5">
        <p className="truncate text-xs font-medium text-gray-500">{label}</p>
        {extra}
      </div>
      <div className="space-y-0.5">{children}</div>
    </div>
  );

  const nav = (
    <nav className="flex h-full flex-col gap-6 overflow-y-auto px-3 py-4" aria-label="Organiser portal">
      <Link href="/admin" className="flex items-center gap-2.5 rounded-lg px-2 py-1.5 hover:bg-gray-100">
        <LogoMark size={26} />
        <span className="min-w-0 leading-tight">
          <span className="block text-sm font-semibold tracking-tight text-gray-900">{BRAND.name}</span>
          <span className="block truncate text-xs text-gray-500">{orgName}</span>
        </span>
      </Link>

      <Link href="/admin/events/new" className="flex h-9 items-center justify-center gap-1.5 rounded-lg bg-primary text-[13.5px] font-medium text-white shadow-[inset_0_1px_0_rgba(255,255,255,0.12)] hover:bg-gray-800">
        <AdminIcon name="plus" size={15} /> New event
      </Link>

      {group("Workspace", <>
        {item("/admin", "Events", pathname === "/admin", "events")}
        {item("/admin/settings", "Organisation", pathname.startsWith("/admin/settings"), "building")}
        {item("/docs", "Developer docs", false, "code", true)}
      </>)}

      {event ? group(
        <span title={event.name}>{event.name}</span>,
        <>
          {EVENT_NAV.map((n) => item(`/admin/events/${event.id}${n.seg ? `/${n.seg}` : ""}`, n.label, current === n.seg, n.icon))}
          {item(`/e/${event.slug}`, "Open public map", false, "map", true)}
        </>,
        <Badge tone={statusTone[event.status] ?? "gray"} className="shrink-0">{event.status}</Badge>,
      ) : events.length > 0 && group("Recent events", events.slice(0, 6).map((e) => (
        <Link key={e.id} href={`/admin/events/${e.id}`} className="flex h-8 items-center gap-2.5 rounded-lg px-2.5 text-[13.5px] text-gray-600 hover:bg-gray-100 hover:text-gray-900">
          <span className={cn("size-2 shrink-0 rounded-full", STATUS_DOT[e.status])} aria-hidden />
          <span className="min-w-0 flex-1 truncate">{e.name}</span>
          <span className="sr-only">({e.status})</span>
        </Link>
      )))}

      <div className="mt-auto flex items-center gap-2.5 rounded-xl border border-border bg-surface p-2.5 shadow-[var(--shadow-card)]">
        <span className="grid size-8 shrink-0 place-items-center rounded-full bg-gray-900 text-xs font-semibold text-white" aria-hidden>{initials(user.name)}</span>
        <span className="min-w-0 flex-1 leading-tight">
          <span className="block truncate text-[13px] font-medium text-gray-900">{user.name}</span>
          <span className="block truncate text-xs text-gray-500">{user.email}</span>
        </span>
        <button type="button" onClick={signOut} disabled={signingOut} className="grid size-8 shrink-0 place-items-center rounded-lg text-gray-500 hover:bg-gray-100 hover:text-gray-900 disabled:opacity-50" aria-label="Sign out" title="Sign out">
          <AdminIcon name="logout" />
        </button>
      </div>
    </nav>
  );

  return (
    <div className="flex min-h-full flex-1 bg-background">
      <aside className="sticky top-0 hidden h-screen w-[252px] shrink-0 border-r border-border bg-subtle lg:block">{nav}</aside>
      {open && (
        <div className="fixed inset-0 z-40 flex lg:hidden" role="dialog" aria-modal="true" aria-label="Menu">
          <div className="w-[272px] border-r border-border bg-subtle shadow-[var(--shadow-pop)]">{nav}</div>
          <button type="button" className="flex-1 bg-gray-900/30 backdrop-blur-[2px]" aria-label="Close menu" onClick={() => setOpen(false)} />
        </div>
      )}
      <div className="flex min-w-0 flex-1 flex-col">
        <header className="sticky top-0 z-30 flex h-14 items-center gap-3 border-b border-border bg-surface/90 px-4 backdrop-blur lg:hidden">
          <button type="button" className="grid size-9 place-items-center rounded-lg border border-border text-gray-700" onClick={() => setOpen(true)} aria-label="Open menu"><AdminIcon name="menu" /></button>
          <LogoMark size={22} />
          <span className="truncate text-sm font-semibold">{event ? event.name : BRAND.name}</span>
        </header>
        <main className="mx-auto w-full max-w-[1200px] flex-1 px-5 py-8 sm:px-8 lg:px-10 lg:py-10">{children}</main>
      </div>
    </div>
  );
}

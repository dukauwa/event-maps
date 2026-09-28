"use client";
/** Portal-level building blocks layered on top of `@/components/ui`. */
import * as React from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { Button, cn, toast } from "@/components/ui";
import { copyText } from "./lib";

/** `router.refresh()` wrapped in a transition so callers can show a pending state. */
export function useRefresh(): { refresh: () => void; pending: boolean } {
  const router = useRouter();
  const [pending, start] = React.useTransition();
  const refresh = React.useCallback(() => start(() => router.refresh()), [router]);
  return { refresh, pending };
}

/** Run an async mutation with toast feedback; returns whether it succeeded. */
export async function run<T>(fn: () => Promise<T>, opts: { success?: string; onDone?: (v: T) => void } = {}): Promise<T | null> {
  try {
    const v = await fn();
    if (opts.success) toast(opts.success, "success");
    opts.onDone?.(v);
    return v;
  } catch (e) {
    toast(e instanceof Error ? e.message : "Something went wrong", "error");
    return null;
  }
}

export function PageHeader({ title, subtitle, crumbs, actions, className }: { title: React.ReactNode; subtitle?: React.ReactNode; crumbs?: { href?: string; label: string }[]; actions?: React.ReactNode; className?: string }) {
  return (
    <div className={cn("mb-8 flex flex-wrap items-end justify-between gap-4", className)}>
      <div className="min-w-0">
        {crumbs && crumbs.length > 0 && (
          <nav className="mb-2 flex flex-wrap items-center gap-1.5 text-[13px] text-gray-500" aria-label="Breadcrumb">
            {crumbs.map((c, i) => (
              <React.Fragment key={i}>
                {i > 0 && <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" className="text-gray-400" aria-hidden><path d="m9 6 6 6-6 6" /></svg>}
                {c.href ? <Link href={c.href} className="rounded hover:text-gray-900">{c.label}</Link> : <span className="text-gray-700">{c.label}</span>}
              </React.Fragment>
            ))}
          </nav>
        )}
        <h1 className="truncate text-[26px] font-semibold leading-tight tracking-[-0.02em] text-gray-900">{title}</h1>
        {subtitle && <p className="mt-1.5 text-sm text-gray-500">{subtitle}</p>}
      </div>
      {actions && <div className="flex flex-wrap items-center gap-2">{actions}</div>}
    </div>
  );
}

export function Section({ title, description, actions, children, className, id }: { title: React.ReactNode; description?: React.ReactNode; actions?: React.ReactNode; children: React.ReactNode; className?: string; id?: string }) {
  return (
    <section id={id} className={cn("rounded-xl border border-border bg-surface shadow-[var(--shadow-card)]", className)}>
      <header className="flex flex-wrap items-start justify-between gap-3 px-5 pb-1 pt-5">
        <div>
          <h2 className="text-[15px] font-semibold tracking-tight text-gray-900">{title}</h2>
          {description && <p className="mt-0.5 text-[13px] text-gray-500">{description}</p>}
        </div>
        {actions && <div className="flex flex-wrap items-center gap-2">{actions}</div>}
      </header>
      <div className="p-5 pt-4">{children}</div>
    </section>
  );
}

export function Kpi({ label, value, hint, tone }: { label: string; value: React.ReactNode; hint?: React.ReactNode; tone?: "default" | "green" | "orange" | "blue" }) {
  // The number stays in ink (text never wears a data colour); tone shows as a small marker beside the label.
  const dot = { default: "bg-gray-300", green: "bg-emerald-500", orange: "bg-orange-500", blue: "bg-brand" };
  return (
    <div className="rounded-xl border border-border bg-surface p-5 shadow-[var(--shadow-card)]">
      <p className="flex items-center gap-2 text-[13px] font-medium text-gray-500"><span className={cn("size-1.5 rounded-full", dot[tone ?? "default"])} aria-hidden />{label}</p>
      <p className="mt-3 text-[28px] font-semibold leading-none tracking-[-0.02em] text-gray-900 tabular-nums">{value}</p>
      {hint && <p className="mt-2.5 text-xs leading-relaxed text-gray-500">{hint}</p>}
    </div>
  );
}

export function Switch({ checked, onChange, label, description, disabled }: { checked: boolean; onChange: (v: boolean) => void; label?: React.ReactNode; description?: React.ReactNode; disabled?: boolean }) {
  return (
    <label className={cn("flex cursor-pointer items-start gap-3", disabled && "cursor-not-allowed opacity-60")}>
      <button type="button" role="switch" aria-checked={checked} disabled={disabled} onClick={() => onChange(!checked)} className={cn("relative mt-0.5 inline-flex h-5 w-9 shrink-0 items-center rounded-full transition-colors focus:outline-none focus-visible:ring-[3px] focus-visible:ring-[var(--ring)]", checked ? "bg-brand" : "bg-gray-300")}>
        <span className={cn("inline-block size-4 rounded-full bg-white shadow-[var(--shadow-card)] transition-transform", checked ? "translate-x-[18px]" : "translate-x-0.5")} />
      </button>
      {(label || description) && (
        <span className="text-sm">
          {label && <span className="font-medium text-gray-900">{label}</span>}
          {description && <span className="block text-xs text-gray-500">{description}</span>}
        </span>
      )}
    </label>
  );
}

export function Checkbox({ checked, onChange, label, indeterminate, className, ariaLabel }: { checked: boolean; onChange: (v: boolean) => void; label?: React.ReactNode; indeterminate?: boolean; className?: string; ariaLabel?: string }) {
  const ref = React.useRef<HTMLInputElement>(null);
  React.useEffect(() => { if (ref.current) ref.current.indeterminate = !!indeterminate; }, [indeterminate]);
  return (
    <label className={cn("inline-flex items-center gap-2 text-sm", className)}>
      <input ref={ref} type="checkbox" className="size-4 rounded border-gray-300 accent-[var(--brand)]" checked={checked} onChange={(e) => onChange(e.target.checked)} aria-label={ariaLabel} />
      {label}
    </label>
  );
}

export function CopyButton({ text, label = "Copy", size = "sm", variant = "outline", className }: { text: string; label?: string; size?: "sm" | "md"; variant?: "outline" | "ghost" | "secondary" | "primary"; className?: string }) {
  const [done, setDone] = React.useState(false);
  return (
    <Button type="button" size={size} variant={variant} className={className} onClick={async () => { const ok = await copyText(text); setDone(ok); if (!ok) toast("Copy failed", "error"); setTimeout(() => setDone(false), 1500); }}>
      {done ? "Copied" : label}
    </Button>
  );
}

export function ConfirmButton({ onConfirm, children, message = "Are you sure?", variant = "danger", size = "sm", className, disabled }: { onConfirm: () => unknown; children: React.ReactNode; message?: string; variant?: "danger" | "outline" | "ghost" | "secondary"; size?: "sm" | "md"; className?: string; disabled?: boolean }) {
  const [arm, setArm] = React.useState(false);
  const [busy, setBusy] = React.useState(false);
  React.useEffect(() => { if (!arm) return; const t = setTimeout(() => setArm(false), 4000); return () => clearTimeout(t); }, [arm]);
  if (!arm) return <Button type="button" size={size} variant={variant} className={className} disabled={disabled} onClick={() => setArm(true)}>{children}</Button>;
  return (
    <span className="inline-flex items-center gap-1">
      <span className="text-xs text-gray-600">{message}</span>
      <Button type="button" size={size} variant="danger" loading={busy} onClick={async () => { setBusy(true); try { await onConfirm(); } finally { setBusy(false); setArm(false); } }}>Confirm</Button>
      <Button type="button" size={size} variant="ghost" onClick={() => setArm(false)}>Cancel</Button>
    </span>
  );
}

export function Drawer({ open, onClose, title, children, footer, wide }: { open: boolean; onClose: () => void; title?: React.ReactNode; children: React.ReactNode; footer?: React.ReactNode; wide?: boolean }) {
  React.useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent) => e.key === "Escape" && onClose();
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [open, onClose]);
  if (!open) return null;
  return (
    <div className="fixed inset-0 z-50 flex justify-end bg-gray-900/30 backdrop-blur-[2px]" onMouseDown={(e) => e.target === e.currentTarget && onClose()} role="dialog" aria-modal="true">
      <div className={cn("m-2 flex h-[calc(100%-1rem)] w-full flex-col overflow-hidden rounded-2xl border border-border bg-surface shadow-[var(--shadow-pop)]", wide ? "max-w-3xl" : "max-w-xl")}>
        <header className="flex items-center justify-between border-b border-border px-6 py-4">
          <h2 className="text-base font-semibold tracking-tight">{title}</h2>
          <button type="button" className="grid size-8 place-items-center rounded-lg text-gray-500 hover:bg-gray-100 hover:text-gray-900" onClick={onClose} aria-label="Close"><svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" aria-hidden><path d="M18 6 6 18M6 6l12 12" /></svg></button>
        </header>
        <div className="flex-1 overflow-y-auto px-6 py-5">{children}</div>
        {footer && <footer className="flex items-center justify-end gap-2 border-t border-border bg-subtle px-6 py-3">{footer}</footer>}
      </div>
    </div>
  );
}

export function SearchInput({ value, onChange, placeholder = "Search…", className }: { value: string; onChange: (v: string) => void; placeholder?: string; className?: string }) {
  return (
    <div className={cn("relative", className)}>
      <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-gray-400" aria-hidden><circle cx="11" cy="11" r="7" /><path d="m20 20-3.5-3.5" /></svg>
      <input type="search" value={value} onChange={(e) => onChange(e.target.value)} placeholder={placeholder} aria-label={placeholder.replace(/…$/, "")} className="h-9 w-full rounded-lg border border-border bg-surface pl-9 pr-3 text-sm shadow-[var(--shadow-card)] placeholder:text-gray-500 hover:border-border-strong focus:border-brand focus:outline-none focus-visible:outline-none focus:ring-[3px] focus:ring-[var(--ring)]" />
    </div>
  );
}

export function Pill({ children, color }: { children: React.ReactNode; color?: string | null }) {
  return (
    <span className="inline-flex items-center gap-1.5 rounded-full border border-border bg-surface px-2 py-0.5 text-xs text-gray-700">
      {color && <span className="size-2 rounded-full" style={{ background: color }} />}
      {children}
    </span>
  );
}

export function Stack({ children, className }: { children: React.ReactNode; className?: string }) {
  return <div className={cn("space-y-6", className)}>{children}</div>;
}

/**
 * Single-series column chart (no chart lib). Columns are capped at 24px with a 4px rounded top, grow from one
 * baseline, and sit on hairline gridlines; the value appears on hover. One series, so the section title is the legend.
 */
export function BarChart({ data, height = 168, color = "var(--brand)", valueLabel = "", className }: { data: { label: string; value: number; sub?: string }[]; height?: number; color?: string; valueLabel?: string; className?: string }) {
  const [hover, setHover] = React.useState<number | null>(null);
  if (!data.length) return <p className="py-8 text-center text-sm text-gray-500">No data for this range.</p>;
  const niceMax = (() => { const m = Math.max(1, ...data.map((d) => d.value)); const p = Math.pow(10, Math.floor(Math.log10(m))); return Math.ceil(m / p) * p; })();
  const ticks = [niceMax, niceMax / 2, 0];
  return (
    <div className={cn("relative", className)}>
      <div className="flex gap-3">
        <div className="flex flex-col justify-between text-right text-[11px] tabular-nums text-gray-500" style={{ height }} aria-hidden>
          {ticks.map((t, i) => <span key={i} className="-translate-y-1/2 first:translate-y-0 last:translate-y-0">{Math.round(t).toLocaleString()}</span>)}
        </div>
        <div className="relative flex-1" style={{ height }} role="img" aria-label={`${valueLabel || "Values"} by day`}>
          {[0, 50, 100].map((y) => <div key={y} className="absolute inset-x-0 h-px bg-gray-100" style={{ top: `${y}%` }} aria-hidden />)}
          <div className="absolute inset-0 flex items-end gap-[2px]">
            {data.map((d, i) => (
              <div key={i} className="flex h-full flex-1 cursor-default items-end justify-center" onMouseEnter={() => setHover(i)} onMouseLeave={() => setHover(null)}>
                <div className="w-full max-w-6 rounded-t-[4px] transition-opacity" style={{ height: `${(d.value / niceMax) * 100}%`, minHeight: d.value > 0 ? 2 : 0, background: color, opacity: hover === null || hover === i ? 1 : 0.4 }} />
              </div>
            ))}
          </div>
          {hover !== null && (
            <div className="pointer-events-none absolute top-0 z-10 whitespace-nowrap rounded-lg border border-border bg-surface px-2.5 py-1.5 text-xs text-gray-700 shadow-[var(--shadow-pop)]" style={{ left: `${((hover + 0.5) / data.length) * 100}%`, transform: "translate(-50%, calc(-100% - 6px))" }}>
              <span className="font-semibold tabular-nums text-gray-900">{data[hover].value.toLocaleString()}</span> {valueLabel} · {data[hover].label}{data[hover].sub ? ` · ${data[hover].sub}` : ""}
            </div>
          )}
        </div>
      </div>
      <div className="mt-2 flex justify-between pl-10 text-[11px] text-gray-500" aria-hidden>
        <span>{data[0].label}</span>
        {data.length > 2 && <span>{data[Math.floor(data.length / 2)].label}</span>}
        <span>{data[data.length - 1].label}</span>
      </div>
    </div>
  );
}

export function StatusDot({ status }: { status: string }) {
  const colors: Record<string, string> = { available: "#22c55e", held: "#fbbf24", reserved: "#fb923c", sold: "#3b82f6", unavailable: "#9ca3af", published: "#22c55e", draft: "#9ca3af", archived: "#6b7280" };
  return <span className="inline-block size-2 rounded-full" style={{ background: colors[status] ?? "#9ca3af" }} aria-hidden />;
}

export function Notice({ tone = "info", children, className }: { tone?: "info" | "warn" | "error" | "success"; children: React.ReactNode; className?: string }) {
  const tones = { info: "border-[#d6defd] bg-brand-soft text-[#1f2f7a]", warn: "border-amber-200 bg-amber-50 text-amber-900", error: "border-red-200 bg-red-50 text-red-900", success: "border-emerald-200 bg-emerald-50 text-emerald-900" };
  return <div className={cn("rounded-xl border px-4 py-3 text-sm leading-relaxed", tones[tone], className)}>{children}</div>;
}

export function FormRow({ children, cols = 2, className }: { children: React.ReactNode; cols?: 1 | 2 | 3 | 4; className?: string }) {
  const map = { 1: "sm:grid-cols-1", 2: "sm:grid-cols-2", 3: "sm:grid-cols-3", 4: "sm:grid-cols-4" };
  return <div className={cn("grid grid-cols-1 gap-4", map[cols], className)}>{children}</div>;
}

export function KeyValueEditor({ value, onChange, keyPlaceholder = "key", valuePlaceholder = "value" }: { value: Record<string, string>; onChange: (v: Record<string, string>) => void; keyPlaceholder?: string; valuePlaceholder?: string }) {
  const [rows, setRows] = React.useState<[string, string][]>(() => Object.entries(value));
  const commit = (next: [string, string][]) => { setRows(next); onChange(Object.fromEntries(next.filter(([k]) => k.trim()))); };
  return (
    <div className="space-y-2">
      {rows.map(([k, v], i) => (
        <div key={i} className="flex gap-2">
          <input className="h-9 w-2/5 rounded-lg border border-border bg-surface px-3 text-sm shadow-[var(--shadow-card)] focus:border-brand focus:outline-none focus-visible:outline-none focus:ring-[3px] focus:ring-[var(--ring)]" placeholder={keyPlaceholder} value={k} onChange={(e) => commit(rows.map((r, j) => (j === i ? [e.target.value, r[1]] : r)))} />
          <input className="h-9 flex-1 rounded-lg border border-border bg-surface px-3 text-sm shadow-[var(--shadow-card)] focus:border-brand focus:outline-none focus-visible:outline-none focus:ring-[3px] focus:ring-[var(--ring)]" placeholder={valuePlaceholder} value={v} onChange={(e) => commit(rows.map((r, j) => (j === i ? [r[0], e.target.value] : r)))} />
          <Button type="button" size="sm" variant="ghost" onClick={() => commit(rows.filter((_, j) => j !== i))} aria-label="Remove">✕</Button>
        </div>
      ))}
      <Button type="button" size="sm" variant="outline" onClick={() => commit([...rows, ["", ""]])}>Add row</Button>
    </div>
  );
}

export function ImageField({ value, onChange, label = "Image" }: { value: string; onChange: (url: string) => void; label?: string }) {
  const [busy, setBusy] = React.useState(false);
  const upload = async (file: File) => {
    setBusy(true);
    const fd = new FormData();
    fd.append("file", file);
    try {
      const res = await fetch("/api/v1/media", { method: "POST", body: fd, credentials: "include" });
      const body = (await res.json()) as { data?: { url: string }; error?: { message: string } };
      if (!res.ok || !body.data) throw new Error(body.error?.message ?? "Upload failed");
      onChange(body.data.url);
      toast("Uploaded", "success");
    } catch (e) {
      toast(e instanceof Error ? e.message : "Upload failed", "error");
    } finally {
      setBusy(false);
    }
  };
  return (
    <div className="space-y-2">
      <span className="mb-1.5 block text-[13px] font-medium text-gray-700">{label}</span>
      <div className="flex items-start gap-3">
        <div className="flex size-16 shrink-0 items-center justify-center overflow-hidden rounded-lg border border-border bg-gray-50">
          {/* eslint-disable-next-line @next/next/no-img-element */}
          {value ? <img src={value} alt="" className="max-h-full max-w-full object-contain" /> : <span className="text-xs text-gray-500">None</span>}
        </div>
        <div className="flex-1 space-y-2">
          <input className="h-9 w-full rounded-lg border border-border bg-surface px-3 text-sm shadow-[var(--shadow-card)] focus:border-brand focus:outline-none focus-visible:outline-none focus:ring-[3px] focus:ring-[var(--ring)]" placeholder="https://… or upload" value={value} onChange={(e) => onChange(e.target.value)} />
          <div className="flex items-center gap-2">
            <label className={cn("inline-flex h-8 cursor-pointer items-center rounded-lg border border-border bg-surface px-3 text-xs font-medium hover:bg-gray-50", busy && "opacity-50")}>
              {busy ? "Uploading…" : "Upload file"}
              <input type="file" accept="image/*" className="hidden" disabled={busy} onChange={(e) => { const f = e.target.files?.[0]; if (f) void upload(f); e.target.value = ""; }} />
            </label>
            {value && <Button type="button" size="sm" variant="ghost" onClick={() => onChange("")}>Clear</Button>}
          </div>
        </div>
      </div>
    </div>
  );
}

export function ListEditor({ value, onChange, placeholder = "https://…", addLabel = "Add" }: { value: string[]; onChange: (v: string[]) => void; placeholder?: string; addLabel?: string }) {
  return (
    <div className="space-y-2">
      {value.map((v, i) => (
        <div key={i} className="flex gap-2">
          <input className="h-9 flex-1 rounded-lg border border-border bg-surface px-3 text-sm shadow-[var(--shadow-card)] focus:border-brand focus:outline-none focus-visible:outline-none focus:ring-[3px] focus:ring-[var(--ring)]" placeholder={placeholder} value={v} onChange={(e) => onChange(value.map((x, j) => (j === i ? e.target.value : x)))} />
          <Button type="button" size="sm" variant="ghost" onClick={() => onChange(value.filter((_, j) => j !== i))} aria-label="Remove">✕</Button>
        </div>
      ))}
      <Button type="button" size="sm" variant="outline" onClick={() => onChange([...value, ""])}>{addLabel}</Button>
    </div>
  );
}

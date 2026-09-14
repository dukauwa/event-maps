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
    <div className={cn("mb-6 flex flex-wrap items-end justify-between gap-3", className)}>
      <div className="min-w-0">
        {crumbs && crumbs.length > 0 && (
          <nav className="mb-1 flex flex-wrap items-center gap-1 text-xs text-gray-500" aria-label="Breadcrumb">
            {crumbs.map((c, i) => (
              <React.Fragment key={i}>
                {i > 0 && <span aria-hidden>/</span>}
                {c.href ? <Link href={c.href} className="hover:text-gray-900">{c.label}</Link> : <span>{c.label}</span>}
              </React.Fragment>
            ))}
          </nav>
        )}
        <h1 className="truncate text-2xl font-semibold tracking-tight">{title}</h1>
        {subtitle && <p className="mt-1 text-sm text-gray-500">{subtitle}</p>}
      </div>
      {actions && <div className="flex flex-wrap items-center gap-2">{actions}</div>}
    </div>
  );
}

export function Section({ title, description, actions, children, className, id }: { title: React.ReactNode; description?: React.ReactNode; actions?: React.ReactNode; children: React.ReactNode; className?: string; id?: string }) {
  return (
    <section id={id} className={cn("rounded-xl border border-border bg-surface shadow-sm", className)}>
      <header className="flex flex-wrap items-start justify-between gap-3 border-b border-border px-5 py-4">
        <div>
          <h2 className="text-base font-semibold">{title}</h2>
          {description && <p className="mt-0.5 text-sm text-gray-500">{description}</p>}
        </div>
        {actions && <div className="flex flex-wrap items-center gap-2">{actions}</div>}
      </header>
      <div className="p-5">{children}</div>
    </section>
  );
}

export function Kpi({ label, value, hint, tone }: { label: string; value: React.ReactNode; hint?: React.ReactNode; tone?: "default" | "green" | "orange" | "blue" }) {
  const tones = { default: "text-gray-900", green: "text-green-700", orange: "text-orange-600", blue: "text-blue-700" };
  return (
    <div className="rounded-xl border border-border bg-surface p-4 shadow-sm">
      <p className="text-xs font-medium uppercase tracking-wide text-gray-500">{label}</p>
      <p className={cn("mt-1 text-2xl font-semibold tabular-nums", tones[tone ?? "default"])}>{value}</p>
      {hint && <p className="mt-1 text-xs text-gray-500">{hint}</p>}
    </div>
  );
}

export function Switch({ checked, onChange, label, description, disabled }: { checked: boolean; onChange: (v: boolean) => void; label?: React.ReactNode; description?: React.ReactNode; disabled?: boolean }) {
  return (
    <label className={cn("flex cursor-pointer items-start gap-3", disabled && "cursor-not-allowed opacity-60")}>
      <button type="button" role="switch" aria-checked={checked} disabled={disabled} onClick={() => onChange(!checked)} className={cn("relative mt-0.5 inline-flex h-5 w-9 shrink-0 items-center rounded-full transition-colors focus:outline-none focus-visible:ring-2 focus-visible:ring-primary/50", checked ? "bg-primary" : "bg-gray-300")}>
        <span className={cn("inline-block size-4 rounded-full bg-white shadow transition-transform", checked ? "translate-x-4" : "translate-x-0.5")} />
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
      <input ref={ref} type="checkbox" className="size-4 rounded border-gray-300 accent-primary" checked={checked} onChange={(e) => onChange(e.target.checked)} aria-label={ariaLabel} />
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

export function ConfirmButton({ onConfirm, children, message = "Are you sure?", variant = "danger", size = "sm", className, disabled }: { onConfirm: () => void | Promise<void>; children: React.ReactNode; message?: string; variant?: "danger" | "outline" | "ghost" | "secondary"; size?: "sm" | "md"; className?: string; disabled?: boolean }) {
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
    <div className="fixed inset-0 z-50 flex justify-end bg-black/40" onMouseDown={(e) => e.target === e.currentTarget && onClose()} role="dialog" aria-modal="true">
      <div className={cn("flex h-full w-full flex-col bg-surface shadow-2xl", wide ? "max-w-3xl" : "max-w-xl")}>
        <header className="flex items-center justify-between border-b border-border px-5 py-4">
          <h2 className="text-base font-semibold">{title}</h2>
          <button type="button" className="rounded-md p-1 text-gray-500 hover:bg-gray-100 hover:text-gray-900" onClick={onClose} aria-label="Close">✕</button>
        </header>
        <div className="flex-1 overflow-y-auto px-5 py-4">{children}</div>
        {footer && <footer className="flex items-center justify-end gap-2 border-t border-border px-5 py-3">{footer}</footer>}
      </div>
    </div>
  );
}

export function SearchInput({ value, onChange, placeholder = "Search…", className }: { value: string; onChange: (v: string) => void; placeholder?: string; className?: string }) {
  return (
    <div className={cn("relative", className)}>
      <span className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-gray-400" aria-hidden>⌕</span>
      <input type="search" value={value} onChange={(e) => onChange(e.target.value)} placeholder={placeholder} className="h-9 w-full rounded-lg border border-border bg-surface pl-8 pr-3 text-sm focus:outline-none focus:ring-2 focus:ring-primary/40" />
    </div>
  );
}

export function Pill({ children, color }: { children: React.ReactNode; color?: string | null }) {
  return (
    <span className="inline-flex items-center gap-1.5 rounded-full border border-border bg-gray-50 px-2 py-0.5 text-xs text-gray-700">
      {color && <span className="size-2 rounded-full" style={{ background: color }} />}
      {children}
    </span>
  );
}

export function Stack({ children, className }: { children: React.ReactNode; className?: string }) {
  return <div className={cn("space-y-6", className)}>{children}</div>;
}

/** Simple responsive bar chart (no chart lib). */
export function BarChart({ data, height = 160, color = "var(--primary)", valueLabel = "", className }: { data: { label: string; value: number; sub?: string }[]; height?: number; color?: string; valueLabel?: string; className?: string }) {
  const [hover, setHover] = React.useState<number | null>(null);
  if (!data.length) return <p className="py-8 text-center text-sm text-gray-500">No data for this range.</p>;
  const max = Math.max(1, ...data.map((d) => d.value));
  const w = 100, gap = 0.6;
  const bw = Math.max(0.5, w / data.length - gap);
  const ticks = [0, 0.5, 1].map((t) => Math.round(max * t));
  return (
    <div className={cn("relative", className)}>
      <div className="flex gap-2">
        <div className="flex flex-col justify-between py-0.5 text-right text-[10px] tabular-nums text-gray-400" style={{ height }}>
          {[...ticks].reverse().map((t, i) => <span key={i}>{t}</span>)}
        </div>
        <div className="relative flex-1">
          <svg viewBox={`0 0 ${w} 100`} preserveAspectRatio="none" style={{ height, width: "100%" }} className="overflow-visible" role="img" aria-label="Bar chart">
            {[0, 50, 100].map((y) => <line key={y} x1={0} x2={w} y1={y} y2={y} stroke="var(--border)" strokeWidth={0.3} vectorEffect="non-scaling-stroke" />)}
            {data.map((d, i) => {
              const h = (d.value / max) * 100;
              return <rect key={i} x={i * (w / data.length) + gap / 2} y={100 - h} width={bw} height={h} fill={color} opacity={hover === null || hover === i ? 1 : 0.45} rx={0.3} onMouseEnter={() => setHover(i)} onMouseLeave={() => setHover(null)} />;
            })}
          </svg>
          {hover !== null && (
            <div className="pointer-events-none absolute -top-2 left-0 -translate-y-full rounded-md bg-gray-900 px-2 py-1 text-xs text-white shadow" style={{ left: `${((hover + 0.5) / data.length) * 100}%`, transform: "translate(-50%, -100%)" }}>
              <span className="font-medium">{data[hover].value.toLocaleString()} {valueLabel}</span> · {data[hover].label}{data[hover].sub ? ` · ${data[hover].sub}` : ""}
            </div>
          )}
        </div>
      </div>
      <div className="ml-7 mt-1 flex justify-between text-[10px] text-gray-400">
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
  const tones = { info: "border-blue-200 bg-blue-50 text-blue-900", warn: "border-yellow-200 bg-yellow-50 text-yellow-900", error: "border-red-200 bg-red-50 text-red-900", success: "border-green-200 bg-green-50 text-green-900" };
  return <div className={cn("rounded-lg border px-4 py-3 text-sm", tones[tone], className)}>{children}</div>;
}

export function FormRow({ children, cols = 2, className }: { children: React.ReactNode; cols?: 1 | 2 | 3 | 4; className?: string }) {
  const map = { 1: "sm:grid-cols-1", 2: "sm:grid-cols-2", 3: "sm:grid-cols-3", 4: "sm:grid-cols-4" };
  return <div className={cn("grid grid-cols-1 gap-3", map[cols], className)}>{children}</div>;
}

export function KeyValueEditor({ value, onChange, keyPlaceholder = "key", valuePlaceholder = "value" }: { value: Record<string, string>; onChange: (v: Record<string, string>) => void; keyPlaceholder?: string; valuePlaceholder?: string }) {
  const [rows, setRows] = React.useState<[string, string][]>(() => Object.entries(value));
  const commit = (next: [string, string][]) => { setRows(next); onChange(Object.fromEntries(next.filter(([k]) => k.trim()))); };
  return (
    <div className="space-y-2">
      {rows.map(([k, v], i) => (
        <div key={i} className="flex gap-2">
          <input className="h-9 w-2/5 rounded-lg border border-border px-2 text-sm" placeholder={keyPlaceholder} value={k} onChange={(e) => commit(rows.map((r, j) => (j === i ? [e.target.value, r[1]] : r)))} />
          <input className="h-9 flex-1 rounded-lg border border-border px-2 text-sm" placeholder={valuePlaceholder} value={v} onChange={(e) => commit(rows.map((r, j) => (j === i ? [r[0], e.target.value] : r)))} />
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
      <span className="mb-1 block text-xs font-medium uppercase tracking-wide text-gray-500">{label}</span>
      <div className="flex items-start gap-3">
        <div className="flex size-16 shrink-0 items-center justify-center overflow-hidden rounded-lg border border-border bg-gray-50">
          {/* eslint-disable-next-line @next/next/no-img-element */}
          {value ? <img src={value} alt="" className="max-h-full max-w-full object-contain" /> : <span className="text-xs text-gray-400">none</span>}
        </div>
        <div className="flex-1 space-y-2">
          <input className="h-9 w-full rounded-lg border border-border px-2 text-sm" placeholder="https://… or upload" value={value} onChange={(e) => onChange(e.target.value)} />
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
          <input className="h-9 flex-1 rounded-lg border border-border px-2 text-sm" placeholder={placeholder} value={v} onChange={(e) => onChange(value.map((x, j) => (j === i ? e.target.value : x)))} />
          <Button type="button" size="sm" variant="ghost" onClick={() => onChange(value.filter((_, j) => j !== i))} aria-label="Remove">✕</Button>
        </div>
      ))}
      <Button type="button" size="sm" variant="outline" onClick={() => onChange([...value, ""])}>{addLabel}</Button>
    </div>
  );
}

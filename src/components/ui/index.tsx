"use client";
/** Minimal shared UI primitives (Tailwind 4). Keep this file dependency-free; all portals use it. */
import * as React from "react";

import { cn } from "@/lib/cn";
import { statusTone, type Tone } from "./status";
export { cn, statusTone };

type ButtonProps = React.ButtonHTMLAttributes<HTMLButtonElement> & { variant?: "primary" | "secondary" | "ghost" | "danger" | "outline"; size?: "sm" | "md" | "lg"; loading?: boolean };
export const Button = React.forwardRef<HTMLButtonElement, ButtonProps>(function Button({ className, variant = "primary", size = "md", loading, children, disabled, ...rest }, ref) {
  const base = "inline-flex select-none items-center justify-center gap-1.5 whitespace-nowrap rounded-lg font-medium transition-[background-color,border-color,color,box-shadow] duration-150 focus:outline-none focus-visible:ring-[3px] focus-visible:ring-[var(--ring)] disabled:pointer-events-none disabled:opacity-50";
  const variants = {
    primary: "bg-primary text-primary-foreground shadow-[inset_0_1px_0_rgba(255,255,255,0.12)] hover:bg-gray-800",
    secondary: "bg-gray-100 text-gray-900 hover:bg-gray-200",
    ghost: "text-gray-700 hover:bg-gray-100 hover:text-gray-900",
    danger: "bg-red-600 text-white hover:bg-red-700",
    outline: "border border-border bg-surface text-gray-900 shadow-[var(--shadow-card)] hover:border-border-strong hover:bg-gray-50",
  };
  const sizes = { sm: "h-8 px-3 text-[13px]", md: "h-9 px-3.5 text-sm", lg: "h-11 px-5 text-[15px]" };
  return (
    <button ref={ref} className={cn(base, variants[variant], sizes[size], className)} disabled={disabled || loading} {...rest}>
      {loading && <span className="size-3.5 animate-spin rounded-full border-2 border-current border-t-transparent" aria-hidden />}
      {children}
    </button>
  );
});

const control = "rounded-lg border border-border bg-surface text-sm text-gray-900 shadow-[var(--shadow-card)] transition-[border-color,box-shadow] placeholder:text-gray-500 hover:border-border-strong focus:border-brand focus:outline-none focus-visible:outline-none focus:ring-[3px] focus:ring-[var(--ring)] disabled:cursor-not-allowed disabled:bg-gray-50 disabled:text-gray-500";

/** Controls fill their container unless the caller sets a width (CSS order, not class order, decides clashes). */
const fill = (className?: string) => (className && /(^|\s)(w-|flex-1)/.test(className) ? "" : "w-full");

export const Input = React.forwardRef<HTMLInputElement, React.InputHTMLAttributes<HTMLInputElement>>(function Input({ className, ...rest }, ref) {
  return <input ref={ref} className={cn("h-9 px-3", fill(className), control, className)} {...rest} />;
});

export const Textarea = React.forwardRef<HTMLTextAreaElement, React.TextareaHTMLAttributes<HTMLTextAreaElement>>(function Textarea({ className, ...rest }, ref) {
  return <textarea ref={ref} className={cn("min-h-24 px-3 py-2", fill(className), control, className)} {...rest} />;
});

export const Select = React.forwardRef<HTMLSelectElement, React.SelectHTMLAttributes<HTMLSelectElement>>(function Select({ className, children, ...rest }, ref) {
  return <select ref={ref} className={cn("h-9 appearance-none bg-[url(\"data:image/svg+xml;utf8,<svg xmlns='http://www.w3.org/2000/svg' width='16' height='16' viewBox='0 0 24 24' fill='none' stroke='%23636b7c' stroke-width='2' stroke-linecap='round' stroke-linejoin='round'><path d='m6 9 6 6 6-6'/></svg>\")] bg-[length:16px] bg-[right_10px_center] bg-no-repeat pl-3 pr-9", fill(className), control, className)} {...rest}>{children}</select>;
});

export function Label({ className, children, ...rest }: React.LabelHTMLAttributes<HTMLLabelElement>) {
  return <label className={cn("mb-1.5 block text-[13px] font-medium text-gray-700", className)} {...rest}>{children}</label>;
}

export function Field({ label, hint, children, className }: { label: string; hint?: string; children: React.ReactNode; className?: string }) {
  return (
    <div className={cn("space-y-0", className)}>
      <Label>{label}</Label>
      {children}
      {hint && <p className="mt-1.5 text-xs leading-relaxed text-gray-500">{hint}</p>}
    </div>
  );
}

export function Card({ className, children, ...rest }: React.HTMLAttributes<HTMLDivElement>) {
  return <div className={cn("rounded-xl border border-border bg-surface p-5 shadow-[var(--shadow-card)]", className)} {...rest}>{children}</div>;
}

export function Badge({ className, children, tone = "gray" }: { className?: string; children: React.ReactNode; tone?: Tone }) {
  // Tinted pill with a status dot; every text/background pair is ≥ 4.5:1.
  const tones: Record<Tone, string> = {
    gray: "bg-gray-100 text-gray-700 [--dot:#8b93a3]",
    green: "bg-emerald-50 text-emerald-800 [--dot:#10b981]",
    yellow: "bg-amber-50 text-amber-800 [--dot:#f59e0b]",
    orange: "bg-orange-50 text-orange-800 [--dot:#f97316]",
    blue: "bg-brand-soft text-[#1f3bb3] [--dot:#2f54eb]",
    red: "bg-red-50 text-red-800 [--dot:#ef4444]",
    purple: "bg-violet-50 text-violet-800 [--dot:#8b5cf6]",
  };
  return (
    <span className={cn("inline-flex items-center gap-1.5 rounded-full px-2 py-0.5 text-xs font-medium capitalize", tones[tone], className)}>
      <span className="size-1.5 rounded-full bg-[var(--dot)]" aria-hidden />
      {children}
    </span>
  );
}


export function Table({ className, children }: { className?: string; children: React.ReactNode }) {
  return <div className={cn("overflow-x-auto rounded-xl border border-border bg-surface shadow-[var(--shadow-card)]", className)}><table className="w-full border-collapse text-sm [&_tbody_tr:hover]:bg-gray-50/70 [&_tbody_tr:last-child_td]:border-b-0">{children}</table></div>;
}
export function Th({ children, className }: { children?: React.ReactNode; className?: string }) {
  return <th className={cn("h-10 border-b border-border bg-subtle px-4 text-left text-xs font-medium text-gray-500 first:rounded-tl-xl last:rounded-tr-xl", className)}>{children}</th>;
}
export function Td({ children, className }: { children?: React.ReactNode; className?: string }) {
  return <td className={cn("h-12 border-b border-border px-4 align-middle text-gray-800", className)}>{children}</td>;
}

export function Dialog({ open, onClose, title, children, wide }: { open: boolean; onClose: () => void; title?: string; children: React.ReactNode; wide?: boolean }) {
  React.useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent) => e.key === "Escape" && onClose();
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [open, onClose]);
  if (!open) return null;
  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-gray-900/30 p-4 backdrop-blur-[2px]" onMouseDown={(e) => e.target === e.currentTarget && onClose()} role="dialog" aria-modal="true" aria-label={title}>
      <div className={cn("max-h-[90vh] w-full overflow-y-auto rounded-2xl border border-border bg-surface p-6 shadow-[var(--shadow-pop)]", wide ? "max-w-3xl" : "max-w-lg")}>
        {title && (
          <div className="mb-5 flex items-start justify-between gap-4">
            <h2 className="text-base font-semibold tracking-tight text-gray-900">{title}</h2>
            <button type="button" onClick={onClose} aria-label="Close" className="-mr-1 -mt-1 grid size-8 place-items-center rounded-lg text-gray-500 hover:bg-gray-100 hover:text-gray-900">
              <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" aria-hidden><path d="M18 6 6 18M6 6l12 12" /></svg>
            </button>
          </div>
        )}
        {children}
      </div>
    </div>
  );
}

export function Spinner({ className }: { className?: string }) {
  return <span className={cn("inline-block size-5 animate-spin rounded-full border-2 border-gray-200 border-t-gray-900", className)} aria-label="Loading" />;
}

export function EmptyState({ title, hint, action }: { title: string; hint?: string; action?: React.ReactNode }) {
  return (
    <div className="rounded-xl border border-dashed border-border-strong bg-subtle px-6 py-12 text-center">
      <div className="mx-auto mb-3 grid size-10 place-items-center rounded-xl border border-border bg-surface text-gray-500 shadow-[var(--shadow-card)]" aria-hidden>
        <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.75" strokeLinecap="round" strokeLinejoin="round"><rect x="3" y="3" width="7" height="7" rx="1.5" /><rect x="14" y="3" width="7" height="7" rx="1.5" /><rect x="3" y="14" width="7" height="7" rx="1.5" /><path d="M17.5 14v7M14 17.5h7" /></svg>
      </div>
      <p className="text-sm font-medium text-gray-900">{title}</p>
      {hint && <p className="mx-auto mt-1 max-w-sm text-sm text-gray-500">{hint}</p>}
      {action && <div className="mt-5 flex justify-center">{action}</div>}
    </div>
  );
}

/** Tiny toast bus. */
type Toast = { id: number; message: string; tone: "info" | "success" | "error" };
const listeners = new Set<(t: Toast) => void>();
let toastId = 0;
export function toast(message: string, tone: Toast["tone"] = "info") {
  const t = { id: ++toastId, message, tone };
  listeners.forEach((l) => l(t));
}
export function Toaster() {
  const [items, setItems] = React.useState<Toast[]>([]);
  React.useEffect(() => {
    const l = (t: Toast) => {
      setItems((s) => [...s, t]);
      setTimeout(() => setItems((s) => s.filter((x) => x.id !== t.id)), 4000);
    };
    listeners.add(l);
    return () => { listeners.delete(l); };
  }, []);
  return (
    <div className="pointer-events-none fixed bottom-4 right-4 z-[60] flex flex-col gap-2">
      {items.map((t) => (
        <div key={t.id} role="status" className="pointer-events-auto flex max-w-sm items-center gap-2.5 rounded-xl border border-border bg-surface px-4 py-3 text-sm text-gray-900 shadow-[var(--shadow-pop)]">
          <span className={cn("size-2 shrink-0 rounded-full", t.tone === "error" ? "bg-red-500" : t.tone === "success" ? "bg-emerald-500" : "bg-brand")} aria-hidden />
          {t.message}
        </div>
      ))}
    </div>
  );
}

/** fetch wrapper for the JSON API: throws on `{ error }`, returns `data`. */
export async function api<T = unknown>(path: string, init?: RequestInit & { json?: unknown }): Promise<T> {
  const { json, ...rest } = init ?? {};
  const res = await fetch(path, { credentials: "include", ...rest, headers: { ...(json !== undefined ? { "Content-Type": "application/json" } : {}), ...(rest.headers ?? {}) }, body: json !== undefined ? JSON.stringify(json) : rest.body });
  const body = (await res.json().catch(() => ({}))) as { data?: T; error?: { code: string; message: string; details?: unknown } };
  if (!res.ok || body.error) throw new Error(body.error?.message ?? `HTTP ${res.status}`);
  return body.data as T;
}

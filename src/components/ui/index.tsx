"use client";
/** Minimal shared UI primitives (Tailwind 4). Keep this file dependency-free; all portals use it. */
import * as React from "react";

export function cn(...parts: (string | false | null | undefined)[]): string {
  return parts.filter(Boolean).join(" ");
}

type ButtonProps = React.ButtonHTMLAttributes<HTMLButtonElement> & { variant?: "primary" | "secondary" | "ghost" | "danger" | "outline"; size?: "sm" | "md" | "lg"; loading?: boolean };
export const Button = React.forwardRef<HTMLButtonElement, ButtonProps>(function Button({ className, variant = "primary", size = "md", loading, children, disabled, ...rest }, ref) {
  const base = "inline-flex items-center justify-center gap-2 rounded-lg font-medium transition-colors focus:outline-none focus-visible:ring-2 focus-visible:ring-primary/50 disabled:opacity-50 disabled:pointer-events-none";
  const variants = {
    primary: "bg-primary text-primary-foreground hover:opacity-90",
    secondary: "bg-gray-100 text-gray-900 hover:bg-gray-200",
    ghost: "text-gray-700 hover:bg-gray-100",
    danger: "bg-red-600 text-white hover:bg-red-700",
    outline: "border border-border bg-surface text-gray-900 hover:bg-gray-50",
  };
  const sizes = { sm: "h-8 px-3 text-sm", md: "h-10 px-4 text-sm", lg: "h-12 px-6 text-base" };
  return (
    <button ref={ref} className={cn(base, variants[variant], sizes[size], className)} disabled={disabled || loading} {...rest}>
      {loading && <span className="size-4 animate-spin rounded-full border-2 border-current border-t-transparent" aria-hidden />}
      {children}
    </button>
  );
});

export const Input = React.forwardRef<HTMLInputElement, React.InputHTMLAttributes<HTMLInputElement>>(function Input({ className, ...rest }, ref) {
  return <input ref={ref} className={cn("h-10 w-full rounded-lg border border-border bg-surface px-3 text-sm text-gray-900 placeholder:text-gray-400 focus:outline-none focus:ring-2 focus:ring-primary/40", className)} {...rest} />;
});

export const Textarea = React.forwardRef<HTMLTextAreaElement, React.TextareaHTMLAttributes<HTMLTextAreaElement>>(function Textarea({ className, ...rest }, ref) {
  return <textarea ref={ref} className={cn("min-h-24 w-full rounded-lg border border-border bg-surface px-3 py-2 text-sm text-gray-900 placeholder:text-gray-400 focus:outline-none focus:ring-2 focus:ring-primary/40", className)} {...rest} />;
});

export const Select = React.forwardRef<HTMLSelectElement, React.SelectHTMLAttributes<HTMLSelectElement>>(function Select({ className, children, ...rest }, ref) {
  return <select ref={ref} className={cn("h-10 w-full rounded-lg border border-border bg-surface px-3 text-sm text-gray-900 focus:outline-none focus:ring-2 focus:ring-primary/40", className)} {...rest}>{children}</select>;
});

export function Label({ className, children, ...rest }: React.LabelHTMLAttributes<HTMLLabelElement>) {
  return <label className={cn("mb-1 block text-xs font-medium uppercase tracking-wide text-gray-500", className)} {...rest}>{children}</label>;
}

export function Field({ label, hint, children, className }: { label: string; hint?: string; children: React.ReactNode; className?: string }) {
  return (
    <div className={cn("space-y-1", className)}>
      <Label>{label}</Label>
      {children}
      {hint && <p className="text-xs text-gray-500">{hint}</p>}
    </div>
  );
}

export function Card({ className, children, ...rest }: React.HTMLAttributes<HTMLDivElement>) {
  return <div className={cn("rounded-xl border border-border bg-surface p-5 shadow-sm", className)} {...rest}>{children}</div>;
}

export function Badge({ className, children, tone = "gray" }: { className?: string; children: React.ReactNode; tone?: "gray" | "green" | "yellow" | "orange" | "blue" | "red" | "purple" }) {
  const tones = { gray: "bg-gray-100 text-gray-700", green: "bg-green-100 text-green-800", yellow: "bg-yellow-100 text-yellow-800", orange: "bg-orange-100 text-orange-800", blue: "bg-blue-100 text-blue-800", red: "bg-red-100 text-red-800", purple: "bg-purple-100 text-purple-800" };
  return <span className={cn("inline-flex items-center rounded-full px-2 py-0.5 text-xs font-medium", tones[tone], className)}>{children}</span>;
}

export const statusTone: Record<string, "gray" | "green" | "yellow" | "orange" | "blue" | "red" | "purple"> = { available: "green", held: "yellow", reserved: "orange", sold: "blue", unavailable: "gray", paid: "green", pending_payment: "orange", hold: "yellow", invoiced: "blue", cancelled: "gray", expired: "gray", refunded: "red", draft: "gray", published: "green", archived: "gray" };

export function Table({ className, children }: { className?: string; children: React.ReactNode }) {
  return <div className={cn("overflow-x-auto rounded-xl border border-border bg-surface", className)}><table className="w-full text-sm">{children}</table></div>;
}
export function Th({ children, className }: { children?: React.ReactNode; className?: string }) {
  return <th className={cn("border-b border-border px-3 py-2 text-left text-xs font-semibold uppercase tracking-wide text-gray-500", className)}>{children}</th>;
}
export function Td({ children, className }: { children?: React.ReactNode; className?: string }) {
  return <td className={cn("border-b border-border px-3 py-2 align-middle", className)}>{children}</td>;
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
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-4" onMouseDown={(e) => e.target === e.currentTarget && onClose()} role="dialog" aria-modal="true">
      <div className={cn("max-h-[90vh] w-full overflow-y-auto rounded-2xl bg-surface p-6 shadow-xl", wide ? "max-w-3xl" : "max-w-lg")}>
        {title && <h2 className="mb-4 text-lg font-semibold">{title}</h2>}
        {children}
      </div>
    </div>
  );
}

export function Spinner({ className }: { className?: string }) {
  return <span className={cn("inline-block size-5 animate-spin rounded-full border-2 border-gray-300 border-t-primary", className)} aria-label="Loading" />;
}

export function EmptyState({ title, hint, action }: { title: string; hint?: string; action?: React.ReactNode }) {
  return (
    <div className="rounded-xl border border-dashed border-border p-10 text-center">
      <p className="font-medium">{title}</p>
      {hint && <p className="mt-1 text-sm text-gray-500">{hint}</p>}
      {action && <div className="mt-4">{action}</div>}
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
        <div key={t.id} className={cn("pointer-events-auto rounded-lg px-4 py-2 text-sm text-white shadow-lg", t.tone === "error" ? "bg-red-600" : t.tone === "success" ? "bg-green-600" : "bg-gray-900")}>{t.message}</div>
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

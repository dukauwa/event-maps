"use client";
/** Small widgets shared by the designer chrome and panels (dense variants of the app primitives). */
import * as React from "react";
import { Button, Dialog, cn } from "@/components/ui";
import { Icon, type IconName } from "./icons";

export function IconButton({ icon, label, shortcut, active, disabled, onClick, className, size = 18, tip = "right" }: { icon: IconName | string; label: string; shortcut?: string; active?: boolean; disabled?: boolean; onClick?: () => void; className?: string; size?: number; tip?: "right" | "bottom" }) {
  return (
    <button
      type="button"
      aria-label={label}
      aria-pressed={active}
      disabled={disabled}
      onClick={onClick}
      className={cn("group relative grid size-9 place-items-center rounded-lg text-gray-700 transition-colors hover:bg-gray-100 disabled:opacity-40 disabled:hover:bg-transparent", active && "bg-primary/10 text-primary hover:bg-primary/15", className)}
    >
      <Icon name={icon} size={size} />
      <span className={cn("pointer-events-none absolute z-50 hidden whitespace-nowrap rounded-md bg-gray-900 px-2 py-1 text-xs text-white shadow-lg group-hover:block", tip === "right" ? "left-full top-1/2 ml-2 -translate-y-1/2" : "left-1/2 top-full mt-2 -translate-x-1/2")}>
        {label}
        {shortcut && <kbd className="ml-2 rounded border border-white/30 px-1 font-mono text-[10px]">{shortcut}</kbd>}
      </span>
    </button>
  );
}

/** Text/number input that keeps a local draft and commits on blur / Enter (so labels are not uniquified mid-typing). */
export function CommitInput({ value, onCommit, type = "text", className, placeholder, step, min, max, disabled, list }: { value: string; onCommit: (v: string) => void; type?: "text" | "number"; className?: string; placeholder?: string; step?: number | string; min?: number; max?: number; disabled?: boolean; list?: string }) {
  const [draft, setDraft] = React.useState(value);
  const [prev, setPrev] = React.useState(value);
  if (prev !== value) { setPrev(value); setDraft(value); }
  const commit = () => { if (draft !== value) onCommit(draft); };
  return (
    <input
      type={type}
      value={draft}
      step={step}
      min={min}
      max={max}
      list={list}
      disabled={disabled}
      placeholder={placeholder}
      onChange={(e) => setDraft(e.target.value)}
      onBlur={commit}
      onKeyDown={(e) => { if (e.key === "Enter") { commit(); (e.target as HTMLInputElement).blur(); } if (e.key === "Escape") { setDraft(value); (e.target as HTMLInputElement).blur(); } }}
      className={cn("h-8 w-full rounded-md border border-border bg-surface px-2 text-sm text-gray-900 placeholder:text-gray-400 focus:outline-none focus:ring-2 focus:ring-primary/40 disabled:bg-gray-50 disabled:text-gray-500", className)}
    />
  );
}

export function NumberField({ label, value, onChange, step = 0.1, min, max, unit, disabled, nullable, className }: { label?: string; value: number | null | undefined; onChange: (v: number | null) => void; step?: number; min?: number; max?: number; unit?: string; disabled?: boolean; nullable?: boolean; className?: string }) {
  const commit = (s: string) => {
    if (s.trim() === "") { if (nullable) onChange(null); return; }
    const n = Number(s);
    if (Number.isFinite(n)) onChange(n);
  };
  return (
    <label className={cn("block", className)}>
      {label && <span className="mb-1 block text-[11px] font-medium uppercase tracking-wide text-gray-500">{label}</span>}
      <div className="relative">
        <CommitInput type="number" value={value == null ? "" : String(value)} onCommit={commit} step={step} min={min} max={max} disabled={disabled} className={unit ? "pr-8" : undefined} placeholder={nullable ? "—" : undefined} />
        {unit && <span className="pointer-events-none absolute right-2 top-1/2 -translate-y-1/2 text-xs text-gray-400">{unit}</span>}
      </div>
    </label>
  );
}

export function TextField({ label, value, onChange, placeholder, disabled, className }: { label?: string; value: string; onChange: (v: string) => void; placeholder?: string; disabled?: boolean; className?: string }) {
  return (
    <label className={cn("block", className)}>
      {label && <span className="mb-1 block text-[11px] font-medium uppercase tracking-wide text-gray-500">{label}</span>}
      <CommitInput value={value} onCommit={onChange} placeholder={placeholder} disabled={disabled} />
    </label>
  );
}

export function SelectField<T extends string>({ label, value, onChange, options, disabled, className }: { label?: string; value: T; onChange: (v: T) => void; options: { value: T; label: string }[] | readonly T[]; disabled?: boolean; className?: string }) {
  const opts = (options as readonly (T | { value: T; label: string })[]).map((o) => (typeof o === "string" ? { value: o, label: o.replace(/_/g, " ") } : o));
  return (
    <label className={cn("block", className)}>
      {label && <span className="mb-1 block text-[11px] font-medium uppercase tracking-wide text-gray-500">{label}</span>}
      <select value={value} disabled={disabled} onChange={(e) => onChange(e.target.value as T)} className="h-8 w-full rounded-md border border-border bg-surface px-2 text-sm text-gray-900 focus:outline-none focus:ring-2 focus:ring-primary/40 disabled:bg-gray-50">
        {opts.map((o) => <option key={o.value} value={o.value}>{o.label}</option>)}
      </select>
    </label>
  );
}

export function Toggle({ label, checked, onChange, disabled, hint }: { label: string; checked: boolean; onChange: (v: boolean) => void; disabled?: boolean; hint?: string }) {
  return (
    <label className={cn("flex cursor-pointer items-center justify-between gap-3 py-1 text-sm", disabled && "opacity-50")} title={hint}>
      <span className="text-gray-700">{label}</span>
      <button type="button" role="switch" aria-checked={checked} disabled={disabled} onClick={() => onChange(!checked)} className={cn("relative h-5 w-9 shrink-0 rounded-full transition-colors", checked ? "bg-primary" : "bg-gray-300")}>
        <span className={cn("absolute top-0.5 size-4 rounded-full bg-white shadow transition-transform", checked ? "translate-x-4" : "translate-x-0.5")} />
      </button>
    </label>
  );
}

export function ColorField({ label, value, onChange, nullable = true }: { label: string; value: string | undefined | null; onChange: (v: string | null) => void; nullable?: boolean }) {
  const shown = value && /^#[0-9a-f]{6}$/i.test(value) ? value : "#ffffff";
  return (
    <div className="flex items-center justify-between gap-2 py-0.5 text-sm">
      <span className="text-gray-700">{label}</span>
      <div className="flex items-center gap-1">
        <input type="color" value={shown} onChange={(e) => onChange(e.target.value)} className={cn("size-7 cursor-pointer rounded border border-border bg-transparent p-0", !value && "opacity-40")} aria-label={label} />
        <CommitInput value={value ?? ""} onCommit={(v) => onChange(v.trim() ? v.trim() : null)} placeholder="auto" className="w-20 font-mono text-xs" />
        {nullable && value && <button type="button" className="text-gray-400 hover:text-gray-700" onClick={() => onChange(null)} aria-label={`Reset ${label}`}><Icon name="x" size={14} /></button>}
      </div>
    </div>
  );
}

export function Section({ title, children, right, className }: { title: string; children: React.ReactNode; right?: React.ReactNode; className?: string }) {
  return (
    <section className={cn("border-b border-border px-3 py-3", className)}>
      <div className="mb-2 flex items-center justify-between">
        <h3 className="text-[11px] font-semibold uppercase tracking-wider text-gray-500">{title}</h3>
        {right}
      </div>
      <div className="space-y-2">{children}</div>
    </section>
  );
}

export function Row({ children, className }: { children: React.ReactNode; className?: string }) {
  return <div className={cn("grid grid-cols-2 gap-2", className)}>{children}</div>;
}

/** Dropdown menu anchored to its trigger. Closes on outside click / Escape. */
export function Menu({ trigger, items, align = "left" }: { trigger: (open: boolean) => React.ReactNode; items: ({ label: string; icon?: IconName | string; onClick?: () => void; href?: string; disabled?: boolean; hint?: string } | "sep")[]; align?: "left" | "right" }) {
  const [open, setOpen] = React.useState(false);
  const ref = React.useRef<HTMLDivElement>(null);
  React.useEffect(() => {
    if (!open) return;
    const onDoc = (e: MouseEvent) => { if (!ref.current?.contains(e.target as Node)) setOpen(false); };
    const onKey = (e: KeyboardEvent) => { if (e.key === "Escape") setOpen(false); };
    document.addEventListener("mousedown", onDoc);
    window.addEventListener("keydown", onKey);
    return () => { document.removeEventListener("mousedown", onDoc); window.removeEventListener("keydown", onKey); };
  }, [open]);
  return (
    <div ref={ref} className="relative">
      <div onClick={() => setOpen((o) => !o)}>{trigger(open)}</div>
      {open && (
        <div className={cn("absolute top-full z-50 mt-1 min-w-52 overflow-hidden rounded-lg border border-border bg-surface py-1 shadow-xl", align === "right" ? "right-0" : "left-0")} role="menu">
          {items.map((it, i) => it === "sep" ? <div key={i} className="my-1 border-t border-border" /> : (
            it.href ? (
              <a key={i} href={it.href} target="_blank" rel="noreferrer" className="flex items-center gap-2 px-3 py-1.5 text-sm text-gray-800 hover:bg-gray-100" onClick={() => setOpen(false)} role="menuitem">
                {it.icon && <Icon name={it.icon} size={15} className="text-gray-500" />}<span className="flex-1">{it.label}</span>{it.hint && <span className="text-xs text-gray-400">{it.hint}</span>}
              </a>
            ) : (
              <button key={i} type="button" disabled={it.disabled} className="flex w-full items-center gap-2 px-3 py-1.5 text-left text-sm text-gray-800 hover:bg-gray-100 disabled:opacity-40" onClick={() => { setOpen(false); it.onClick?.(); }} role="menuitem">
                {it.icon && <Icon name={it.icon} size={15} className="text-gray-500" />}<span className="flex-1">{it.label}</span>{it.hint && <span className="text-xs text-gray-400">{it.hint}</span>}
              </button>
            )
          ))}
        </div>
      )}
    </div>
  );
}

export function ConfirmDialog({ open, title, message, confirmLabel = "Confirm", danger, onConfirm, onClose }: { open: boolean; title: string; message: React.ReactNode; confirmLabel?: string; danger?: boolean; onConfirm: () => void; onClose: () => void }) {
  return (
    <Dialog open={open} onClose={onClose} title={title}>
      <div className="text-sm text-gray-700">{message}</div>
      <div className="mt-5 flex justify-end gap-2">
        <Button variant="outline" onClick={onClose}>Cancel</Button>
        <Button variant={danger ? "danger" : "primary"} onClick={() => { onConfirm(); onClose(); }}>{confirmLabel}</Button>
      </div>
    </Dialog>
  );
}

/** Tiny external store so the status bar can follow the cursor without re-rendering the whole designer. */
export interface Store<T> { get: () => T; set: (v: T) => void; subscribe: (cb: () => void) => () => void }
export function createStore<T>(initial: T): Store<T> {
  let value = initial;
  const subs = new Set<() => void>();
  return {
    get: () => value,
    set: (v) => { if (v === value) return; value = v; subs.forEach((s) => s()); },
    subscribe: (cb) => { subs.add(cb); return () => { subs.delete(cb); }; },
  };
}
export function useStore<T>(store: Store<T>): T {
  return React.useSyncExternalStore(store.subscribe, store.get, store.get);
}

export const fmtM = (n: number) => (Math.round(n * 100) / 100).toFixed(2);

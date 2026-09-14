"use client";
import * as React from "react";
import { api, Badge, Button, Dialog, EmptyState, Field, Input, Select, statusTone, Table, Td, Textarea, Th, toast } from "@/components/ui";
import { BOOTH_STATUSES, BOOTH_TYPES, type BoothStatus, type BoothType } from "@/lib/domain/types";
import { formatMoney } from "@/lib/pricing";
import { centsToInput, eventApi, inputToCents, nz } from "./lib";
import { Checkbox, ConfirmButton, FormRow, KeyValueEditor, PageHeader, run, SearchInput, StatusDot, Switch, useRefresh } from "./primitives";
import { CsvImportDialog } from "./csv-import";

export interface BoothRow { id: string; label: string; levelId: string; boothType: BoothType; status: BoothStatus; priceCents: number | null; currency: string | null; resolvedPriceCents: number | null; resolvedCurrency: string | null; areaM2: number; widthM: number | null; heightM: number | null; notes: string | null; metadata: Record<string, string>; labelHidden: boolean; exhibitorIds: string[]; holdUntil: string | null; externalId: string | null }
export interface LevelRef { id: string; name: string; shortName: string }
export interface ExhibitorRef { id: string; name: string; boothLabels: string[] }
export interface BoothsEvent { id: string; name: string; currency: string; timezone: string | null; terms: { booth: string; booths: string; exhibitor: string; exhibitors: string; level: string } }

export function BoothsTable({ event, booths, levels, exhibitors }: { event: BoothsEvent; booths: BoothRow[]; levels: LevelRef[]; exhibitors: ExhibitorRef[] }) {
  const { refresh, pending } = useRefresh();
  const [level, setLevel] = React.useState("");
  const [status, setStatus] = React.useState("");
  const [type, setType] = React.useState("");
  const [q, setQ] = React.useState("");
  const [sel, setSel] = React.useState<Set<string>>(new Set());
  const [edit, setEdit] = React.useState<BoothRow | null>(null);
  const [assign, setAssign] = React.useState<BoothRow | null>(null);
  const [importing, setImporting] = React.useState(false);
  const [busyId, setBusyId] = React.useState<string | null>(null);
  const [bulkStatus, setBulkStatus] = React.useState<BoothStatus | "">("");
  const [bulkPrice, setBulkPrice] = React.useState("");
  const [bulkBusy, setBulkBusy] = React.useState(false);
  const exName = React.useMemo(() => new Map(exhibitors.map((e) => [e.id, e.name])), [exhibitors]);
  const levelName = React.useMemo(() => new Map(levels.map((l) => [l.id, l.shortName])), [levels]);
  const base = eventApi(event.id);

  const rows = React.useMemo(() => {
    const needle = q.trim().toLowerCase();
    return booths.filter((b) => (!level || b.levelId === level) && (!status || b.status === status) && (!type || b.boothType === type) && (!needle || b.label.toLowerCase().includes(needle) || b.externalId?.toLowerCase().includes(needle) || b.exhibitorIds.some((id) => exName.get(id)?.toLowerCase().includes(needle))));
  }, [booths, level, status, type, q, exName]);
  const allSelected = rows.length > 0 && rows.every((r) => sel.has(r.id));
  const toggleAll = (v: boolean) => setSel(v ? new Set(rows.map((r) => r.id)) : new Set());
  const counts = React.useMemo(() => { const c: Record<string, number> = {}; for (const b of booths) c[b.status] = (c[b.status] ?? 0) + 1; return c; }, [booths]);

  const setBoothStatus = async (b: BoothRow, next: BoothStatus) => {
    setBusyId(b.id);
    await run(() => api(`${base}/booths/${b.id}/status`, { method: "POST", json: { status: next } }), { success: `${b.label} → ${next}`, onDone: refresh });
    setBusyId(null);
  };
  const unassign = async (b: BoothRow, exhibitorId: string) => {
    await run(() => api(`${base}/booths/${b.id}/assign`, { method: "DELETE", json: { exhibitorId } }), { success: "Unassigned", onDone: refresh });
  };
  const bulk = async (fn: (id: string) => Promise<unknown>, label: string) => {
    setBulkBusy(true);
    const ids = [...sel];
    const results = await Promise.allSettled(ids.map(fn));
    const failed = results.filter((r) => r.status === "rejected").length;
    toast(failed ? `${label}: ${ids.length - failed} ok, ${failed} failed` : `${label}: ${ids.length} ${event.terms.booths.toLowerCase()}`, failed ? "error" : "success");
    setBulkBusy(false);
    setSel(new Set());
    refresh();
  };

  return (
    <>
      <PageHeader
        crumbs={[{ href: "/admin", label: "Events" }, { href: `/admin/events/${event.id}`, label: event.name }, { label: event.terms.booths }]}
        title={event.terms.booths}
        subtitle={<span className="flex flex-wrap gap-x-3">{booths.length} total{BOOTH_STATUSES.map((s) => <span key={s} className="inline-flex items-center gap-1"><StatusDot status={s} />{counts[s] ?? 0} {s}</span>)}</span>}
        actions={<>
          <a href={`${base}/export/booths.csv`} className="inline-flex h-10 items-center rounded-lg border border-border bg-surface px-4 text-sm font-medium hover:bg-gray-50">Export CSV</a>
          <Button variant="outline" onClick={() => setImporting(true)}>Import CSV</Button>
          <a href={`/admin/events/${event.id}/designer`} className="inline-flex h-10 items-center rounded-lg bg-primary px-4 text-sm font-medium text-white hover:opacity-90">Draw {event.terms.booths.toLowerCase()} in designer</a>
        </>}
      />

      <div className="mb-3 flex flex-wrap items-center gap-2">
        <SearchInput value={q} onChange={setQ} placeholder={`Search label, id or ${event.terms.exhibitor.toLowerCase()}…`} className="w-64" />
        <Select value={level} onChange={(e) => setLevel(e.target.value)} className="h-9 w-auto"><option value="">All {event.terms.level.toLowerCase()}s</option>{levels.map((l) => <option key={l.id} value={l.id}>{l.name}</option>)}</Select>
        <Select value={status} onChange={(e) => setStatus(e.target.value)} className="h-9 w-auto"><option value="">All statuses</option>{BOOTH_STATUSES.map((s) => <option key={s} value={s}>{s}</option>)}</Select>
        <Select value={type} onChange={(e) => setType(e.target.value)} className="h-9 w-auto"><option value="">All types</option>{BOOTH_TYPES.map((s) => <option key={s} value={s}>{s}</option>)}</Select>
        {(q || level || status || type) && <Button size="sm" variant="ghost" onClick={() => { setQ(""); setLevel(""); setStatus(""); setType(""); }}>Clear</Button>}
        <span className="ml-auto text-sm text-gray-500">{rows.length} shown{pending ? " · refreshing…" : ""}</span>
      </div>

      {sel.size > 0 && (
        <div className="mb-3 flex flex-wrap items-center gap-2 rounded-lg border border-primary/30 bg-primary/5 px-3 py-2 text-sm">
          <span className="font-medium">{sel.size} selected</span>
          <Select value={bulkStatus} onChange={(e) => setBulkStatus(e.target.value as BoothStatus | "")} className="h-8 w-auto"><option value="">Set status…</option>{BOOTH_STATUSES.map((s) => <option key={s} value={s}>{s}</option>)}</Select>
          <Button size="sm" disabled={!bulkStatus} loading={bulkBusy} onClick={() => bulk((id) => api(`${base}/booths/${id}/status`, { method: "POST", json: { status: bulkStatus } }), "Status updated")}>Apply</Button>
          <span className="mx-1 text-gray-300">|</span>
          <Input value={bulkPrice} onChange={(e) => setBulkPrice(e.target.value)} placeholder={`Price (${event.currency})`} className="h-8 w-36" inputMode="decimal" />
          <Button size="sm" variant="outline" disabled={!bulkPrice.trim()} loading={bulkBusy} onClick={() => bulk((id) => api(`${base}/booths/${id}`, { method: "PATCH", json: { priceCents: inputToCents(bulkPrice), currency: event.currency } }), "Price set")}>Set price</Button>
          <Button size="sm" variant="outline" loading={bulkBusy} onClick={() => bulk((id) => api(`${base}/booths/${id}`, { method: "PATCH", json: { priceCents: null } }), "Price override cleared")}>Clear override</Button>
          <span className="mx-1 text-gray-300">|</span>
          <ConfirmButton message={`Delete ${sel.size} ${event.terms.booths.toLowerCase()}?`} onConfirm={() => bulk((id) => api(`${base}/booths/${id}`, { method: "DELETE" }), "Deleted")}>Delete</ConfirmButton>
          <Button size="sm" variant="ghost" className="ml-auto" onClick={() => setSel(new Set())}>Clear selection</Button>
        </div>
      )}

      {booths.length === 0 ? (
        <EmptyState title={`No ${event.terms.booths.toLowerCase()} yet`} hint="Draw them in the designer or import a CSV with label, level, x, y, width and height." action={<Button variant="outline" onClick={() => setImporting(true)}>Import CSV</Button>} />
      ) : rows.length === 0 ? (
        <EmptyState title="Nothing matches these filters" />
      ) : (
        <Table>
          <thead>
            <tr>
              <Th className="w-8"><Checkbox checked={allSelected} indeterminate={!allSelected && rows.some((r) => sel.has(r.id))} onChange={toggleAll} ariaLabel="Select all" /></Th>
              <Th>Label</Th><Th>{event.terms.level}</Th><Th>Type</Th><Th>Status</Th><Th className="text-right">Price</Th><Th className="text-right">Area</Th><Th>{event.terms.exhibitors}</Th><Th className="w-20" />
            </tr>
          </thead>
          <tbody>
            {rows.map((b) => (
              <tr key={b.id} className={sel.has(b.id) ? "bg-primary/5" : "hover:bg-gray-50"}>
                <Td><Checkbox checked={sel.has(b.id)} onChange={(v) => setSel((s) => { const n = new Set(s); if (v) n.add(b.id); else n.delete(b.id); return n; })} ariaLabel={`Select ${b.label}`} /></Td>
                <Td><button type="button" className="font-medium hover:underline" onClick={() => setEdit(b)}>{b.label}</button>{b.externalId && <span className="ml-1 text-xs text-gray-400">{b.externalId}</span>}</Td>
                <Td className="text-gray-600">{levelName.get(b.levelId) ?? "—"}</Td>
                <Td className="text-gray-600">{b.boothType}</Td>
                <Td>
                  <span className="inline-flex items-center gap-1">
                    <StatusDot status={b.status} />
                    <select value={b.status} disabled={busyId === b.id} onChange={(e) => setBoothStatus(b, e.target.value as BoothStatus)} className="h-7 rounded-md border border-transparent bg-transparent pr-6 text-sm hover:border-border focus:border-border focus:outline-none" aria-label={`Status of ${b.label}`}>
                      {BOOTH_STATUSES.map((s) => <option key={s} value={s}>{s}</option>)}
                    </select>
                  </span>
                </Td>
                <Td className="text-right tabular-nums">{b.resolvedPriceCents != null ? <span title={b.priceCents != null ? "Manual override" : "From pricing rules"} className={b.priceCents != null ? "font-medium" : "text-gray-600"}>{formatMoney(b.resolvedPriceCents, b.resolvedCurrency ?? event.currency)}{b.priceCents != null && <span className="ml-1 text-[10px] text-primary">override</span>}</span> : <span className="text-gray-400">—</span>}</Td>
                <Td className="text-right tabular-nums text-gray-600">{b.areaM2} m²</Td>
                <Td>
                  <div className="flex flex-wrap items-center gap-1">
                    {b.exhibitorIds.map((id) => (
                      <span key={id} className="inline-flex items-center gap-1 rounded-full bg-gray-100 px-2 py-0.5 text-xs">
                        <span className="max-w-40 truncate">{exName.get(id) ?? id}</span>
                        <button type="button" className="text-gray-400 hover:text-red-600" title="Unassign" aria-label={`Unassign ${exName.get(id) ?? id}`} onClick={() => unassign(b, id)}>×</button>
                      </span>
                    ))}
                    <button type="button" className="rounded-full border border-dashed border-border px-2 py-0.5 text-xs text-gray-500 hover:border-primary hover:text-primary" onClick={() => setAssign(b)}>+ assign</button>
                  </div>
                </Td>
                <Td className="text-right"><Button size="sm" variant="ghost" onClick={() => setEdit(b)}>Edit</Button></Td>
              </tr>
            ))}
          </tbody>
        </Table>
      )}

      <EditBoothDialog event={event} booth={edit} levels={levels} onClose={() => setEdit(null)} onSaved={() => { setEdit(null); refresh(); }} />
      <AssignDialog event={event} booth={assign} exhibitors={exhibitors} onClose={() => setAssign(null)} onDone={() => { setAssign(null); refresh(); }} />
      <CsvImportDialog open={importing} onClose={() => { setImporting(false); refresh(); }} endpoint={`${base}/booths/import`} title={`Import ${event.terms.booths.toLowerCase()} from CSV`} columns="label, level, x, y, width, height, rotation, type, status, price, external_id, notes" sample={"label,level,x,y,width,height,type,status,price\nA101,L1,10,10,3,3,standard,available,1200"} />
    </>
  );
}

function EditBoothDialog({ event, booth, levels, onClose, onSaved }: { event: BoothsEvent; booth: BoothRow | null; levels: LevelRef[]; onClose: () => void; onSaved: () => void }) {
  const [f, setF] = React.useState({ label: "", boothType: "standard" as BoothType, status: "available" as BoothStatus, price: "", currency: event.currency, notes: "", externalId: "", labelHidden: false, metadata: {} as Record<string, string> });
  const [busy, setBusy] = React.useState(false);
  React.useEffect(() => { if (booth) setF({ label: booth.label, boothType: booth.boothType, status: booth.status, price: centsToInput(booth.priceCents), currency: booth.currency ?? event.currency, notes: booth.notes ?? "", externalId: booth.externalId ?? "", labelHidden: booth.labelHidden, metadata: booth.metadata ?? {} }); }, [booth, event.currency]);
  if (!booth) return null;
  const save = async (e: React.FormEvent) => {
    e.preventDefault();
    setBusy(true);
    const priceCents = inputToCents(f.price);
    const r = await run(() => api(`${eventApi(event.id)}/booths/${booth.id}`, { method: "PATCH", json: { label: f.label.trim(), boothType: f.boothType, status: f.status, priceCents, currency: priceCents != null ? f.currency : null, notes: nz(f.notes), externalId: nz(f.externalId), labelHidden: f.labelHidden, metadata: f.metadata } }), { success: "Saved" });
    setBusy(false);
    if (r) onSaved();
  };
  const del = async () => {
    await run(() => api(`${eventApi(event.id)}/booths/${booth.id}`, { method: "DELETE" }), { success: "Deleted", onDone: onSaved });
  };
  return (
    <Dialog open onClose={onClose} title={`${event.terms.booth} ${booth.label}`} wide>
      <form onSubmit={save} className="space-y-4">
        <FormRow cols={3}>
          <Field label="Label"><Input required value={f.label} onChange={(e) => setF({ ...f, label: e.target.value })} maxLength={40} /></Field>
          <Field label="Type"><Select value={f.boothType} onChange={(e) => setF({ ...f, boothType: e.target.value as BoothType })}>{BOOTH_TYPES.map((t) => <option key={t}>{t}</option>)}</Select></Field>
          <Field label="Status"><Select value={f.status} onChange={(e) => setF({ ...f, status: e.target.value as BoothStatus })}>{BOOTH_STATUSES.map((t) => <option key={t}>{t}</option>)}</Select></Field>
        </FormRow>
        <FormRow cols={3}>
          <Field label="Price override" hint={booth.resolvedPriceCents != null && booth.priceCents == null ? `Rules give ${formatMoney(booth.resolvedPriceCents, booth.resolvedCurrency ?? event.currency)}` : "Leave empty to use pricing rules"}><Input value={f.price} onChange={(e) => setF({ ...f, price: e.target.value })} inputMode="decimal" placeholder="—" /></Field>
          <Field label="Currency"><Input value={f.currency} onChange={(e) => setF({ ...f, currency: e.target.value.toUpperCase() })} maxLength={3} /></Field>
          <Field label="External id"><Input value={f.externalId} onChange={(e) => setF({ ...f, externalId: e.target.value })} placeholder="CRM / ExpoFP id" /></Field>
        </FormRow>
        <div className="grid grid-cols-3 gap-3 rounded-lg bg-gray-50 p-3 text-sm text-gray-600">
          <span>{event.terms.level}: <span className="font-medium text-gray-900">{levels.find((l) => l.id === booth.levelId)?.name ?? "—"}</span></span>
          <span>Area: <span className="font-medium text-gray-900">{booth.areaM2} m²</span></span>
          <span>Size: <span className="font-medium text-gray-900">{booth.widthM ?? "?"} × {booth.heightM ?? "?"} m</span></span>
        </div>
        <Field label="Notes (internal)"><Textarea value={f.notes} onChange={(e) => setF({ ...f, notes: e.target.value })} className="min-h-20" /></Field>
        <Switch checked={f.labelHidden} onChange={(v) => setF({ ...f, labelHidden: v })} label="Hide label on the map" />
        <div>
          <span className="mb-1 block text-xs font-medium uppercase tracking-wide text-gray-500">Metadata</span>
          <KeyValueEditor key={booth.id} value={f.metadata} onChange={(metadata) => setF({ ...f, metadata })} />
        </div>
        <div className="flex items-center justify-between gap-2 pt-2">
          <ConfirmButton onConfirm={del} message="Delete this booth?">Delete</ConfirmButton>
          <div className="flex gap-2">
            <Button type="button" variant="ghost" onClick={onClose}>Cancel</Button>
            <Button type="submit" loading={busy}>Save</Button>
          </div>
        </div>
      </form>
    </Dialog>
  );
}

function AssignDialog({ event, booth, exhibitors, onClose, onDone }: { event: BoothsEvent; booth: BoothRow | null; exhibitors: ExhibitorRef[]; onClose: () => void; onDone: () => void }) {
  const [q, setQ] = React.useState("");
  const [markSold, setMarkSold] = React.useState(true);
  const [busy, setBusy] = React.useState<string | null>(null);
  React.useEffect(() => { if (booth) { setQ(""); setMarkSold(booth.status !== "sold"); } }, [booth]);
  if (!booth) return null;
  const needle = q.trim().toLowerCase();
  const list = exhibitors.filter((e) => !booth.exhibitorIds.includes(e.id) && (!needle || e.name.toLowerCase().includes(needle))).slice(0, 40);
  const pick = async (ex: ExhibitorRef) => {
    setBusy(ex.id);
    const r = await run(() => api(`${eventApi(event.id)}/booths/${booth.id}/assign`, { method: "POST", json: { exhibitorId: ex.id, markSold } }), { success: `${ex.name} → ${booth.label}` });
    setBusy(null);
    if (r) onDone();
  };
  return (
    <Dialog open onClose={onClose} title={`Assign ${event.terms.exhibitor.toLowerCase()} to ${booth.label}`}>
      <div className="space-y-3">
        <SearchInput value={q} onChange={setQ} placeholder={`Search ${event.terms.exhibitors.toLowerCase()}…`} />
        <Switch checked={markSold} onChange={setMarkSold} label="Mark booth as sold" />
        <ul className="max-h-80 divide-y divide-border overflow-y-auto rounded-lg border border-border">
          {list.length === 0 && <li className="px-3 py-4 text-center text-sm text-gray-500">{exhibitors.length === 0 ? `No ${event.terms.exhibitors.toLowerCase()} yet — create one first.` : "No matches."}</li>}
          {list.map((e) => (
            <li key={e.id}>
              <button type="button" disabled={busy !== null} onClick={() => pick(e)} className="flex w-full items-center justify-between gap-2 px-3 py-2 text-left text-sm hover:bg-gray-50 disabled:opacity-50">
                <span className="truncate font-medium">{e.name}</span>
                <span className="shrink-0 text-xs text-gray-500">{e.boothLabels.length ? e.boothLabels.join(", ") : <Badge tone="gray">unassigned</Badge>}</span>
              </button>
            </li>
          ))}
        </ul>
        <div className="flex justify-end"><Button variant="ghost" onClick={onClose}>Close</Button></div>
      </div>
    </Dialog>
  );
}


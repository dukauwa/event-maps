"use client";
import * as React from "react";
import Link from "next/link";
import { api, Badge, Button, Dialog, EmptyState, Field, Input, Select, statusTone, Table, Td, Textarea, Th, toast } from "@/components/ui";
import { BOOTH_TYPES, ORDER_STATUSES, type BoothType, type EventSales, type OrderStatus } from "@/lib/domain/types";
import { formatMoney } from "@/lib/pricing";
import { centsToInput, CURRENCIES, eventApi, fmtDateTime, inputToCents, nz } from "./lib";
import { ConfirmButton, FormRow, Kpi, Notice, PageHeader, run, Section, Switch, useRefresh } from "./primitives";

export interface RuleRow { id: string; name: string; boothType: BoothType | null; minAreaM2: number | null; maxAreaM2: number | null; priceCents: number | null; pricePerM2Cents: number | null; currency: string; sortIndex: number }
export interface ExtraRow { id: string; kind: "sponsorship" | "booth_extra"; name: string; description: string | null; priceCents: number | null; currency: string; limitPerEvent: number | null; limitPerExhibitor: number | null; reserveOrBuyAllowed: boolean; sortIndex: number; quantityUsed: number }
export interface OrderRow { id: string; boothId: string; boothLabel: string; exhibitorId: string | null; exhibitorName: string | null; status: OrderStatus; amountCents: number; taxCents: number; currency: string; provider: string; company: string | null; contactName: string | null; contactEmail: string | null; expiresAt: string | null; paidAt: string | null; createdAt: string; notes: string | null }
export interface SalesEvent { id: string; name: string; slug: string; timezone: string | null; sales: EventSales; terms: { booth: string; booths: string; exhibitor: string } }
export interface SalesSummary { booths: number; byStatus: Record<string, number>; inventoryValueCents: number; soldValueCents: number; paidCents: number; pendingCents: number; currency: string; orders: number }

export function SalesManager({ event, rules, extras, orders, summary, stripeConfigured }: { event: SalesEvent; rules: RuleRow[]; extras: ExtraRow[]; orders: OrderRow[]; summary: SalesSummary; stripeConfigured: boolean }) {
  const base = `/admin/events/${event.id}`;
  return (
    <>
      <PageHeader crumbs={[{ href: "/admin", label: "Events" }, { href: base, label: event.name }, { label: "Sales" }]} title={`${event.terms.booth} sales`} subtitle="Pricing, checkout settings, sponsorship packages and orders." />
      <div className="mb-6 grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
        <Kpi label="Sold" value={`${summary.byStatus.sold ?? 0} / ${summary.booths}`} hint={`${summary.byStatus.reserved ?? 0} reserved · ${summary.byStatus.held ?? 0} held`} tone="blue" />
        <Kpi label="Sold value" value={formatMoney(summary.soldValueCents, summary.currency)} hint={`of ${formatMoney(summary.inventoryValueCents, summary.currency)} inventory`} />
        <Kpi label="Paid" value={formatMoney(summary.paidCents, summary.currency)} tone="green" hint={`${orders.filter((o) => o.status === "paid").length} paid orders`} />
        <Kpi label="Pending" value={formatMoney(summary.pendingCents, summary.currency)} tone="orange" hint={`${orders.filter((o) => o.status === "pending_payment" || o.status === "hold" || o.status === "invoiced").length} open orders`} />
      </div>
      <div className="space-y-6">
        <OrdersSection event={event} orders={orders} />
        <div className="grid gap-6 xl:grid-cols-2">
          <PricingRules event={event} rules={rules} />
          <SalesSettings event={event} stripeConfigured={stripeConfigured} />
        </div>
        <ExtrasSection event={event} extras={extras} />
      </div>
    </>
  );
}

/* ---------------- settings ---------------- */

function SalesSettings({ event, stripeConfigured }: { event: SalesEvent; stripeConfigured: boolean }) {
  const { refresh } = useRefresh();
  const [s, setS] = React.useState({ ...event.sales, pricePerM2: centsToInput(event.sales.defaultPricePerM2Cents), taxPercent: String(event.sales.taxPercent ?? 0), holdMinutes: String(event.sales.holdMinutes ?? 30), termsUrl: event.sales.termsUrl ?? "", reserveInstructions: event.sales.reserveInstructions ?? "", notifyEmail: event.sales.notifyEmail ?? "" });
  const [busy, setBusy] = React.useState(false);
  const set = <K extends keyof typeof s>(k: K, v: (typeof s)[K]) => setS((x) => ({ ...x, [k]: v }));
  const save = async (e: React.FormEvent) => {
    e.preventDefault();
    setBusy(true);
    await run(() => api(eventApi(event.id), { method: "PATCH", json: { settings: { sales: {
      enabled: s.enabled, mode: s.mode, provider: s.provider, currency: s.currency, holdMinutes: Math.max(1, Number(s.holdMinutes) || 30), defaultPricePerM2Cents: inputToCents(s.pricePerM2) ?? 0,
      taxPercent: Math.max(0, Number(s.taxPercent) || 0), termsUrl: nz(s.termsUrl), reserveInstructions: nz(s.reserveInstructions), notifyEmail: nz(s.notifyEmail),
    } } } }), { success: "Sales settings saved", onDone: refresh });
    setBusy(false);
  };
  return (
    <Section title="Sales settings" description="How attendees and exhibitors can reserve or buy booths in the viewer.">
      <form onSubmit={save} className="space-y-4">
        <Switch checked={s.enabled} onChange={(v) => set("enabled", v)} label="Booth sales enabled" description="Also requires the “Allow reservation” feature toggle in Settings." />
        <FormRow cols={3}>
          <Field label="Mode"><Select value={s.mode} onChange={(e) => set("mode", e.target.value as EventSales["mode"])}><option value="reserve">Reserve (organiser confirms)</option><option value="buy">Buy (checkout)</option><option value="inquiry">Inquiry (lead only)</option></Select></Field>
          <Field label="Provider"><Select value={s.provider} onChange={(e) => set("provider", e.target.value as EventSales["provider"])}><option value="mock">Mock (testing)</option><option value="stripe">Stripe Checkout</option><option value="invoice">Invoice</option></Select></Field>
          <Field label="Currency"><Select value={s.currency} onChange={(e) => set("currency", e.target.value)}>{[...new Set([s.currency, ...CURRENCIES])].map((c) => <option key={c}>{c}</option>)}</Select></Field>
        </FormRow>
        <FormRow cols={3}>
          <Field label="Hold minutes" hint="How long a booth stays held during checkout"><Input type="number" min={1} value={s.holdMinutes} onChange={(e) => set("holdMinutes", e.target.value)} /></Field>
          <Field label={`Default price per m² (${s.currency})`} hint="Fallback when no pricing rule matches"><Input inputMode="decimal" value={s.pricePerM2} onChange={(e) => set("pricePerM2", e.target.value)} /></Field>
          <Field label="Tax %"><Input type="number" min={0} step="0.01" value={s.taxPercent} onChange={(e) => set("taxPercent", e.target.value)} /></Field>
        </FormRow>
        <FormRow>
          <Field label="Terms URL"><Input value={s.termsUrl} onChange={(e) => set("termsUrl", e.target.value)} placeholder="https://…/exhibitor-terms" /></Field>
          <Field label="Notify email" hint="Receives a copy of every new order"><Input type="email" value={s.notifyEmail} onChange={(e) => set("notifyEmail", e.target.value)} /></Field>
        </FormRow>
        <Field label="Reservation instructions" hint="Shown to the buyer after reserving (e.g. payment details for invoices)"><Textarea value={s.reserveInstructions} onChange={(e) => set("reserveInstructions", e.target.value)} className="min-h-20" /></Field>
        {s.provider === "stripe" && (
          <Notice tone={stripeConfigured ? "success" : "warn"}>
            <p className="font-medium">Stripe {stripeConfigured ? "is configured" : "is not configured on this server"}</p>
            <p className="mt-1 text-xs">Set <code className="font-mono">STRIPE_SECRET_KEY</code> and <code className="font-mono">STRIPE_WEBHOOK_SECRET</code> in the environment, then point a Stripe webhook (event <code className="font-mono">checkout.session.completed</code>) at <code className="font-mono">/api/stripe/webhook</code>. Orders are marked paid automatically when the webhook arrives.</p>
          </Notice>
        )}
        <div className="flex justify-end"><Button type="submit" loading={busy}>Save settings</Button></div>
      </form>
    </Section>
  );
}

/* ---------------- pricing rules ---------------- */

function PricingRules({ event, rules }: { event: SalesEvent; rules: RuleRow[] }) {
  const { refresh } = useRefresh();
  const [dialog, setDialog] = React.useState<{ row: RuleRow | null } | null>(null);
  const base = eventApi(event.id);
  const move = async (i: number, dir: -1 | 1) => {
    const j = i + dir; if (j < 0 || j >= rules.length) return;
    await run(async () => { await api(`${base}/pricing-rules/${rules[i].id}`, { method: "PATCH", json: { sortIndex: j } }); await api(`${base}/pricing-rules/${rules[j].id}`, { method: "PATCH", json: { sortIndex: i } }); }, { onDone: refresh });
  };
  return (
    <Section title="Pricing rules" description="First matching rule wins (top to bottom). A booth's manual price override always takes precedence." actions={<Button size="sm" onClick={() => setDialog({ row: null })}>Add rule</Button>}>
      {rules.length === 0 ? <EmptyState title="No pricing rules" hint={`Booths use the default price per m² (${formatMoney(event.sales.defaultPricePerM2Cents, event.sales.currency)}).`} /> : (
        <Table>
          <thead><tr><Th className="w-16">#</Th><Th>Rule</Th><Th>Type</Th><Th>Area</Th><Th className="text-right">Price</Th><Th className="w-24" /></tr></thead>
          <tbody>
            {rules.map((r, i) => (
              <tr key={r.id} className="hover:bg-gray-50">
                <Td><span className="inline-flex items-center gap-0.5"><button type="button" className="px-1 text-gray-500 disabled:opacity-30" disabled={i === 0} onClick={() => move(i, -1)} aria-label="Move up">↑</button><button type="button" className="px-1 text-gray-500 disabled:opacity-30" disabled={i === rules.length - 1} onClick={() => move(i, 1)} aria-label="Move down">↓</button></span></Td>
                <Td className="font-medium">{r.name}</Td>
                <Td className="text-gray-600">{r.boothType ?? "any"}</Td>
                <Td className="text-gray-600">{r.minAreaM2 != null || r.maxAreaM2 != null ? `${r.minAreaM2 ?? 0}–${r.maxAreaM2 ?? "∞"} m²` : "any"}</Td>
                <Td className="text-right tabular-nums">{r.priceCents != null ? formatMoney(r.priceCents, r.currency) : r.pricePerM2Cents != null ? `${formatMoney(r.pricePerM2Cents, r.currency)} / m²` : "—"}</Td>
                <Td className="text-right"><span className="inline-flex gap-1"><Button size="sm" variant="ghost" onClick={() => setDialog({ row: r })}>Edit</Button><ConfirmButton variant="ghost" onConfirm={() => run(() => api(`${base}/pricing-rules/${r.id}`, { method: "DELETE" }), { success: "Rule deleted", onDone: refresh })}>Delete</ConfirmButton></span></Td>
              </tr>
            ))}
          </tbody>
        </Table>
      )}
      {dialog && <RuleDialog event={event} row={dialog.row} onClose={() => setDialog(null)} onSaved={() => { setDialog(null); refresh(); }} />}
    </Section>
  );
}

function RuleDialog({ event, row, onClose, onSaved }: { event: SalesEvent; row: RuleRow | null; onClose: () => void; onSaved: () => void }) {
  const [f, setF] = React.useState({ name: row?.name ?? "", boothType: row?.boothType ?? "", minArea: row?.minAreaM2?.toString() ?? "", maxArea: row?.maxAreaM2?.toString() ?? "", kind: row?.pricePerM2Cents != null ? "perM2" : "fixed", price: centsToInput(row?.pricePerM2Cents ?? row?.priceCents), currency: row?.currency ?? event.sales.currency });
  const [busy, setBusy] = React.useState(false);
  const save = async (e: React.FormEvent) => {
    e.preventDefault();
    const cents = inputToCents(f.price) ?? 0;
    const body = { name: f.name.trim(), boothType: f.boothType || null, minAreaM2: f.minArea ? Number(f.minArea) : null, maxAreaM2: f.maxArea ? Number(f.maxArea) : null, priceCents: f.kind === "fixed" ? cents : null, pricePerM2Cents: f.kind === "perM2" ? cents : null, currency: f.currency };
    setBusy(true);
    const r = await run(() => row ? api(`${eventApi(event.id)}/pricing-rules/${row.id}`, { method: "PATCH", json: body }) : api(`${eventApi(event.id)}/pricing-rules`, { method: "POST", json: body }), { success: "Rule saved" });
    setBusy(false);
    if (r) onSaved();
  };
  return (
    <Dialog open onClose={onClose} title={row ? "Edit pricing rule" : "New pricing rule"}>
      <form onSubmit={save} className="space-y-4">
        <Field label="Name"><Input required value={f.name} onChange={(e) => setF({ ...f, name: e.target.value })} placeholder="Corner booth" autoFocus /></Field>
        <FormRow cols={3}>
          <Field label="Booth type"><Select value={f.boothType} onChange={(e) => setF({ ...f, boothType: e.target.value })}><option value="">Any</option>{BOOTH_TYPES.map((t) => <option key={t}>{t}</option>)}</Select></Field>
          <Field label="Min area m²"><Input type="number" min={0} step="0.1" value={f.minArea} onChange={(e) => setF({ ...f, minArea: e.target.value })} /></Field>
          <Field label="Max area m²"><Input type="number" min={0} step="0.1" value={f.maxArea} onChange={(e) => setF({ ...f, maxArea: e.target.value })} /></Field>
        </FormRow>
        <FormRow cols={3}>
          <Field label="Pricing"><Select value={f.kind} onChange={(e) => setF({ ...f, kind: e.target.value })}><option value="fixed">Fixed price</option><option value="perM2">Price per m²</option></Select></Field>
          <Field label="Amount"><Input required inputMode="decimal" value={f.price} onChange={(e) => setF({ ...f, price: e.target.value })} /></Field>
          <Field label="Currency"><Select value={f.currency} onChange={(e) => setF({ ...f, currency: e.target.value })}>{[...new Set([f.currency, ...CURRENCIES])].map((c) => <option key={c}>{c}</option>)}</Select></Field>
        </FormRow>
        <div className="flex justify-end gap-2"><Button type="button" variant="ghost" onClick={onClose}>Cancel</Button><Button type="submit" loading={busy}>{row ? "Save" : "Create"}</Button></div>
      </form>
    </Dialog>
  );
}

/* ---------------- extras ---------------- */

function ExtrasSection({ event, extras }: { event: SalesEvent; extras: ExtraRow[] }) {
  const { refresh } = useRefresh();
  const [dialog, setDialog] = React.useState<{ row: ExtraRow | null; kind: ExtraRow["kind"] } | null>(null);
  const base = eventApi(event.id);
  return (
    <Section title="Sponsorship packages & booth extras" description="Sellable add-ons with per-event and per-exhibitor limits; assigned from the exhibitor drawer or bought during checkout." actions={<><Button size="sm" variant="outline" onClick={() => setDialog({ row: null, kind: "booth_extra" })}>Add booth extra</Button><Button size="sm" onClick={() => setDialog({ row: null, kind: "sponsorship" })}>Add sponsorship</Button></>}>
      {extras.length === 0 ? <EmptyState title="No extras yet" hint="e.g. Lanyard sponsor, extra power, lead scanner licence." /> : (
        <Table>
          <thead><tr><Th>Kind</Th><Th>Name</Th><Th className="text-right">Price</Th><Th className="text-right">Used / limit</Th><Th>Per exhibitor</Th><Th>Self-service</Th><Th className="w-24" /></tr></thead>
          <tbody>
            {extras.map((x) => (
              <tr key={x.id} className="hover:bg-gray-50">
                <Td><Badge tone={x.kind === "sponsorship" ? "purple" : "gray"}>{x.kind === "sponsorship" ? "sponsorship" : "booth extra"}</Badge></Td>
                <Td><span className="font-medium">{x.name}</span>{x.description && <span className="block max-w-md truncate text-xs text-gray-500">{x.description}</span>}</Td>
                <Td className="text-right tabular-nums">{x.priceCents != null ? formatMoney(x.priceCents, x.currency) : "—"}</Td>
                <Td className="text-right tabular-nums">{x.quantityUsed} / {x.limitPerEvent ?? "∞"}{x.limitPerEvent != null && x.quantityUsed >= x.limitPerEvent && <Badge tone="red" className="ml-1">sold out</Badge>}</Td>
                <Td className="text-gray-600">{x.limitPerExhibitor ?? "∞"}</Td>
                <Td>{x.reserveOrBuyAllowed ? <Badge tone="green">allowed</Badge> : <Badge tone="gray">organiser only</Badge>}</Td>
                <Td className="text-right"><span className="inline-flex gap-1"><Button size="sm" variant="ghost" onClick={() => setDialog({ row: x, kind: x.kind })}>Edit</Button><ConfirmButton variant="ghost" onConfirm={() => run(() => api(`${base}/extras/${x.id}`, { method: "DELETE" }), { success: "Deleted", onDone: refresh })}>Delete</ConfirmButton></span></Td>
              </tr>
            ))}
          </tbody>
        </Table>
      )}
      {dialog && <ExtraDialog event={event} row={dialog.row} kind={dialog.kind} onClose={() => setDialog(null)} onSaved={() => { setDialog(null); refresh(); }} />}
    </Section>
  );
}

function ExtraDialog({ event, row, kind, onClose, onSaved }: { event: SalesEvent; row: ExtraRow | null; kind: ExtraRow["kind"]; onClose: () => void; onSaved: () => void }) {
  const [f, setF] = React.useState({ kind: row?.kind ?? kind, name: row?.name ?? "", description: row?.description ?? "", price: centsToInput(row?.priceCents), currency: row?.currency ?? event.sales.currency, limitPerEvent: row?.limitPerEvent?.toString() ?? "", limitPerExhibitor: row?.limitPerExhibitor?.toString() ?? "", allowed: row?.reserveOrBuyAllowed ?? true });
  const [busy, setBusy] = React.useState(false);
  const save = async (e: React.FormEvent) => {
    e.preventDefault();
    const body = { kind: f.kind, name: f.name.trim(), description: nz(f.description), priceCents: inputToCents(f.price), currency: f.currency, limitPerEvent: f.limitPerEvent ? Number(f.limitPerEvent) : null, limitPerExhibitor: f.limitPerExhibitor ? Number(f.limitPerExhibitor) : null, reserveOrBuyAllowed: f.allowed };
    setBusy(true);
    const r = await run(() => row ? api(`${eventApi(event.id)}/extras/${row.id}`, { method: "PATCH", json: body }) : api(`${eventApi(event.id)}/extras`, { method: "POST", json: body }), { success: "Saved" });
    setBusy(false);
    if (r) onSaved();
  };
  return (
    <Dialog open onClose={onClose} title={row ? `Edit ${row.name}` : f.kind === "sponsorship" ? "New sponsorship package" : "New booth extra"}>
      <form onSubmit={save} className="space-y-4">
        <FormRow>
          <Field label="Kind"><Select value={f.kind} onChange={(e) => setF({ ...f, kind: e.target.value as ExtraRow["kind"] })}><option value="sponsorship">Sponsorship</option><option value="booth_extra">Booth extra</option></Select></Field>
          <Field label="Name"><Input required value={f.name} onChange={(e) => setF({ ...f, name: e.target.value })} autoFocus /></Field>
        </FormRow>
        <Field label="Description"><Textarea value={f.description} onChange={(e) => setF({ ...f, description: e.target.value })} className="min-h-20" /></Field>
        <FormRow cols={4}>
          <Field label="Price"><Input inputMode="decimal" value={f.price} onChange={(e) => setF({ ...f, price: e.target.value })} placeholder="—" /></Field>
          <Field label="Currency"><Select value={f.currency} onChange={(e) => setF({ ...f, currency: e.target.value })}>{[...new Set([f.currency, ...CURRENCIES])].map((c) => <option key={c}>{c}</option>)}</Select></Field>
          <Field label="Limit / event"><Input type="number" min={1} value={f.limitPerEvent} onChange={(e) => setF({ ...f, limitPerEvent: e.target.value })} placeholder="∞" /></Field>
          <Field label="Limit / exhibitor"><Input type="number" min={1} value={f.limitPerExhibitor} onChange={(e) => setF({ ...f, limitPerExhibitor: e.target.value })} placeholder="∞" /></Field>
        </FormRow>
        <Switch checked={f.allowed} onChange={(v) => setF({ ...f, allowed: v })} label="Exhibitors can reserve or buy this themselves" description="Otherwise only organisers assign it." />
        <div className="flex justify-end gap-2"><Button type="button" variant="ghost" onClick={onClose}>Cancel</Button><Button type="submit" loading={busy}>{row ? "Save" : "Create"}</Button></div>
      </form>
    </Dialog>
  );
}

/* ---------------- orders ---------------- */

function OrdersSection({ event, orders }: { event: SalesEvent; orders: OrderRow[] }) {
  const { refresh, pending } = useRefresh();
  const [status, setStatus] = React.useState("");
  const [q, setQ] = React.useState("");
  const [busy, setBusy] = React.useState<string | null>(null);
  const base = eventApi(event.id);
  const rows = orders.filter((o) => (!status || o.status === status) && (!q.trim() || [o.boothLabel, o.company, o.contactName, o.contactEmail, o.exhibitorName, o.id].some((v) => v?.toLowerCase().includes(q.trim().toLowerCase()))));
  const act = async (o: OrderRow, action: "pay" | "invoice" | "cancel" | "refund", label: string) => {
    setBusy(o.id);
    await run(() => api(`${base}/orders/${o.id}/${action}`, { method: "POST", json: {} }), { success: label, onDone: refresh });
    setBusy(null);
  };
  const expire = async () => {
    const r = await run(() => api<{ expired: number }>(`${base}/orders/expire`, { method: "POST" }));
    if (r) { toast(`${r.expired} hold${r.expired === 1 ? "" : "s"} expired`, "success"); refresh(); }
  };
  return (
    <Section title="Orders" description={`${orders.length} orders${pending ? " · refreshing…" : ""}`} actions={<>
      <Input value={q} onChange={(e) => setQ(e.target.value)} placeholder="Search…" className="h-8 w-44" />
      <Select value={status} onChange={(e) => setStatus(e.target.value)} className="h-8 w-auto"><option value="">All statuses</option>{ORDER_STATUSES.map((s) => <option key={s} value={s}>{s.replace("_", " ")}</option>)}</Select>
      <Button size="sm" variant="outline" onClick={expire}>Expire holds</Button>
    </>}>
      {orders.length === 0 ? <EmptyState title="No orders yet" hint="Orders appear when attendees reserve or buy booths in the viewer, or when exhibitors rebook from the portal." /> : rows.length === 0 ? <EmptyState title="No orders match" /> : (
        <Table>
          <thead><tr><Th>Created</Th><Th>{event.terms.booth}</Th><Th>Buyer</Th><Th className="text-right">Amount</Th><Th>Status</Th><Th>Provider</Th><Th className="w-64" /></tr></thead>
          <tbody>
            {rows.map((o) => {
              const open = o.status === "hold" || o.status === "pending_payment" || o.status === "invoiced";
              return (
                <tr key={o.id} className="hover:bg-gray-50">
                  <Td className="whitespace-nowrap text-gray-600">{fmtDateTime(o.createdAt, event.timezone)}{o.expiresAt && o.status === "hold" && <span className="block text-xs text-yellow-700">expires {fmtDateTime(o.expiresAt, event.timezone)}</span>}</Td>
                  <Td><Link href={`/admin/events/${event.id}/booths?q=${encodeURIComponent(o.boothLabel)}`} className="font-medium text-primary hover:underline">{o.boothLabel}</Link></Td>
                  <Td>
                    {o.exhibitorId ? <Link href={`/admin/events/${event.id}/exhibitors?q=${encodeURIComponent(o.exhibitorName ?? o.company ?? "")}`} className="font-medium hover:underline">{o.exhibitorName ?? o.company}</Link> : <span className="font-medium">{o.company ?? "—"}</span>}
                    <span className="block truncate text-xs text-gray-500">{[o.contactName, o.contactEmail].filter(Boolean).join(" · ")}</span>
                  </Td>
                  <Td className="text-right tabular-nums">{formatMoney(o.amountCents + o.taxCents, o.currency)}{o.taxCents > 0 && <span className="block text-xs text-gray-500">incl. {formatMoney(o.taxCents, o.currency)} tax</span>}</Td>
                  <Td><Badge tone={statusTone[o.status] ?? "gray"}>{o.status.replace("_", " ")}</Badge></Td>
                  <Td className="text-gray-600">{o.provider}</Td>
                  <Td className="text-right">
                    <span className="inline-flex flex-wrap justify-end gap-1">
                      {open && <Button size="sm" loading={busy === o.id} onClick={() => act(o, "pay", "Marked paid — booth sold")}>Mark paid</Button>}
                      {(o.status === "hold" || o.status === "pending_payment") && <Button size="sm" variant="outline" loading={busy === o.id} onClick={() => act(o, "invoice", "Marked invoiced — booth reserved")}>Invoiced</Button>}
                      {open && <ConfirmButton variant="ghost" message="Cancel and release the booth?" onConfirm={() => act(o, "cancel", "Order cancelled")}>Cancel</ConfirmButton>}
                      {o.status === "paid" && <ConfirmButton variant="ghost" message="Refund and release the booth?" onConfirm={() => act(o, "refund", "Order refunded")}>Refund</ConfirmButton>}
                    </span>
                  </Td>
                </tr>
              );
            })}
          </tbody>
        </Table>
      )}
    </Section>
  );
}

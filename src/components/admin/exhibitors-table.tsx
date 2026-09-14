"use client";
import * as React from "react";
import { api, Badge, Button, EmptyState, Field, Input, Select, Table, Td, Textarea, Th, toast } from "@/components/ui";
import { SPONSOR_LEVELS, type SponsorLevel } from "@/lib/domain/types";
import { formatMoney } from "@/lib/pricing";
import { copyText, eventApi, nz } from "./lib";
import { Checkbox, ConfirmButton, Drawer, FormRow, ImageField, KeyValueEditor, ListEditor, PageHeader, Pill, run, SearchInput, Switch, useRefresh } from "./primitives";
import { CsvImportDialog } from "./csv-import";

export interface ExhibitorRow {
  id: string; name: string; slug: string; externalId: string | null; gripId: string | null; logoUrl: string | null; gallery: string[]; description: string | null; website: string | null; email: string | null; phone: string | null;
  country: string | null; address: string | null; city: string | null; zip: string | null; featured: boolean; sponsorLevel: SponsorLevel | null; customButtonTitle: string | null; customButtonUrl: string | null; videoUrl: string | null;
  leadingImageUrl: string | null; logoInBooth: boolean; metadata: Record<string, string>; socials: Record<string, string>; tags: string[]; contactName: string | null; categoryIds: string[]; boothIds: string[]; boothLabels: string[];
}
export interface CategoryRef { id: string; name: string; color: string | null }
export interface BoothRef { id: string; label: string; levelId: string; status: string }
export interface LevelRef { id: string; name: string; shortName: string }
export interface ExtraRef { id: string; name: string; kind: string; priceCents: number | null; currency: string; limitPerExhibitor: number | null }
export interface ExhibitorsEvent { id: string; name: string; terms: { booth: string; booths: string; exhibitor: string; exhibitors: string; level: string } }

const SOCIAL_KEYS = ["linkedin", "x", "facebook", "instagram", "youtube", "tiktok"];

export function ExhibitorsTable({ event, exhibitors, categories, booths, levels, extras }: { event: ExhibitorsEvent; exhibitors: ExhibitorRow[]; categories: CategoryRef[]; booths: BoothRef[]; levels: LevelRef[]; extras: ExtraRef[] }) {
  const { refresh, pending } = useRefresh();
  const [q, setQ] = React.useState("");
  const [cat, setCat] = React.useState("");
  const [level, setLevel] = React.useState("");
  const [flag, setFlag] = React.useState<"" | "unassigned" | "featured" | "sponsor">("");
  const [sel, setSel] = React.useState<Set<string>>(new Set());
  const [drawer, setDrawer] = React.useState<{ mode: "create" } | { mode: "edit"; row: ExhibitorRow } | null>(null);
  const [importing, setImporting] = React.useState(false);
  const [bulkBusy, setBulkBusy] = React.useState(false);
  const base = eventApi(event.id);
  const catName = React.useMemo(() => new Map(categories.map((c) => [c.id, c])), [categories]);
  const boothLevel = React.useMemo(() => new Map(booths.map((b) => [b.id, b.levelId])), [booths]);

  const rows = React.useMemo(() => {
    const needle = q.trim().toLowerCase();
    return exhibitors.filter((e) =>
      (!needle || e.name.toLowerCase().includes(needle) || e.boothLabels.some((l) => l.toLowerCase().includes(needle)) || e.externalId?.toLowerCase().includes(needle) || e.email?.toLowerCase().includes(needle))
      && (!cat || e.categoryIds.includes(cat))
      && (!level || e.boothIds.some((b) => boothLevel.get(b) === level))
      && (flag !== "unassigned" || e.boothIds.length === 0) && (flag !== "featured" || e.featured) && (flag !== "sponsor" || !!e.sponsorLevel));
  }, [exhibitors, q, cat, level, flag, boothLevel]);
  const allSelected = rows.length > 0 && rows.every((r) => sel.has(r.id));

  const bulkFeatured = async (featured: boolean) => {
    setBulkBusy(true);
    const ids = [...sel];
    const res = await Promise.allSettled(ids.map((id) => api(`${base}/exhibitors/${id}`, { method: "PATCH", json: { featured } })));
    const failed = res.filter((r) => r.status === "rejected").length;
    toast(failed ? `${ids.length - failed} updated, ${failed} failed` : `${ids.length} ${featured ? "marked featured" : "unfeatured"}`, failed ? "error" : "success");
    setBulkBusy(false); setSel(new Set()); refresh();
  };
  const copyPortal = async (e: ExhibitorRow, rotate = false) => {
    const r = await run(() => api<{ url: string }>(`${base}/exhibitors/${e.id}/portal-link`, { method: rotate ? "POST" : "GET" }));
    if (r) { const ok = await copyText(r.url); toast(ok ? (rotate ? "New portal link copied — the old link no longer works" : "Portal link copied") : r.url, ok ? "success" : "info"); }
  };
  const del = async (e: ExhibitorRow) => {
    await run(() => api(`${base}/exhibitors/${e.id}`, { method: "DELETE" }), { success: `Deleted ${e.name}`, onDone: refresh });
  };

  return (
    <>
      <PageHeader
        crumbs={[{ href: "/admin", label: "Events" }, { href: `/admin/events/${event.id}`, label: event.name }, { label: event.terms.exhibitors }]}
        title={event.terms.exhibitors}
        subtitle={`${exhibitors.length} total · ${exhibitors.filter((e) => e.boothIds.length === 0).length} without a ${event.terms.booth.toLowerCase()} · ${exhibitors.filter((e) => e.featured).length} featured`}
        actions={<>
          <a href={`${base}/export/exhibitors.csv`} className="inline-flex h-10 items-center rounded-lg border border-border bg-surface px-4 text-sm font-medium hover:bg-gray-50">Export CSV</a>
          <Button variant="outline" onClick={() => setImporting(true)}>Import CSV</Button>
          <Button onClick={() => setDrawer({ mode: "create" })}>New {event.terms.exhibitor.toLowerCase()}</Button>
        </>}
      />
      <div className="mb-3 flex flex-wrap items-center gap-2">
        <SearchInput value={q} onChange={setQ} placeholder="Search name, booth, email…" className="w-64" />
        <Select value={cat} onChange={(e) => setCat(e.target.value)} className="h-9 w-auto"><option value="">All categories</option>{categories.map((c) => <option key={c.id} value={c.id}>{c.name}</option>)}</Select>
        <Select value={level} onChange={(e) => setLevel(e.target.value)} className="h-9 w-auto"><option value="">All {event.terms.level.toLowerCase()}s</option>{levels.map((l) => <option key={l.id} value={l.id}>{l.name}</option>)}</Select>
        <Select value={flag} onChange={(e) => setFlag(e.target.value as typeof flag)} className="h-9 w-auto"><option value="">Everyone</option><option value="unassigned">Unassigned</option><option value="featured">Featured</option><option value="sponsor">Sponsors</option></Select>
        {(q || cat || level || flag) && <Button size="sm" variant="ghost" onClick={() => { setQ(""); setCat(""); setLevel(""); setFlag(""); }}>Clear</Button>}
        <span className="ml-auto text-sm text-gray-500">{rows.length} shown{pending ? " · refreshing…" : ""}</span>
      </div>
      {sel.size > 0 && (
        <div className="mb-3 flex flex-wrap items-center gap-2 rounded-lg border border-primary/30 bg-primary/5 px-3 py-2 text-sm">
          <span className="font-medium">{sel.size} selected</span>
          <Button size="sm" loading={bulkBusy} onClick={() => bulkFeatured(true)}>Mark featured</Button>
          <Button size="sm" variant="outline" loading={bulkBusy} onClick={() => bulkFeatured(false)}>Remove featured</Button>
          <Button size="sm" variant="ghost" className="ml-auto" onClick={() => setSel(new Set())}>Clear selection</Button>
        </div>
      )}
      {exhibitors.length === 0 ? (
        <EmptyState title={`No ${event.terms.exhibitors.toLowerCase()} yet`} hint="Create one, import the ExpoFP CSV template, or sync from Grip in Settings." action={<Button onClick={() => setDrawer({ mode: "create" })}>New {event.terms.exhibitor.toLowerCase()}</Button>} />
      ) : rows.length === 0 ? <EmptyState title="Nothing matches these filters" /> : (
        <Table>
          <thead><tr>
            <Th className="w-8"><Checkbox checked={allSelected} indeterminate={!allSelected && rows.some((r) => sel.has(r.id))} onChange={(v) => setSel(v ? new Set(rows.map((r) => r.id)) : new Set())} ariaLabel="Select all" /></Th>
            <Th>Name</Th><Th>{event.terms.booths}</Th><Th>Categories</Th><Th>Flags</Th><Th>Country</Th><Th className="w-44" />
          </tr></thead>
          <tbody>
            {rows.map((e) => (
              <tr key={e.id} className={sel.has(e.id) ? "bg-primary/5" : "hover:bg-gray-50"}>
                <Td><Checkbox checked={sel.has(e.id)} onChange={(v) => setSel((s) => { const n = new Set(s); if (v) n.add(e.id); else n.delete(e.id); return n; })} ariaLabel={`Select ${e.name}`} /></Td>
                <Td>
                  <button type="button" className="flex items-center gap-3 text-left" onClick={() => setDrawer({ mode: "edit", row: e })}>
                    <span className="grid size-8 shrink-0 place-items-center overflow-hidden rounded-md border border-border bg-white">
                      {/* eslint-disable-next-line @next/next/no-img-element */}
                      {e.logoUrl ? <img src={e.logoUrl} alt="" className="max-h-full max-w-full object-contain" /> : <span className="text-xs font-semibold text-gray-400">{e.name[0]}</span>}
                    </span>
                    <span className="min-w-0"><span className="block truncate font-medium hover:underline">{e.name}</span>{e.email && <span className="block truncate text-xs text-gray-500">{e.email}</span>}</span>
                  </button>
                </Td>
                <Td>{e.boothLabels.length ? <span className="font-medium tabular-nums">{e.boothLabels.join(", ")}</span> : <span className="text-xs text-gray-400">unassigned</span>}</Td>
                <Td><div className="flex flex-wrap gap-1">{e.categoryIds.slice(0, 3).map((c) => catName.get(c) ? <Pill key={c} color={catName.get(c)!.color}>{catName.get(c)!.name}</Pill> : null)}{e.categoryIds.length > 3 && <span className="text-xs text-gray-500">+{e.categoryIds.length - 3}</span>}</div></Td>
                <Td><div className="flex flex-wrap gap-1">{e.featured && <Badge tone="purple">featured</Badge>}{e.sponsorLevel && <Badge tone="yellow">{e.sponsorLevel}</Badge>}{e.gripId && <Badge tone="blue">Grip</Badge>}</div></Td>
                <Td className="text-gray-600">{e.country ?? "—"}</Td>
                <Td className="text-right">
                  <div className="flex justify-end gap-1">
                    <Button size="sm" variant="ghost" onClick={() => copyPortal(e)} title="Copy exhibitor portal link">Portal link</Button>
                    <Button size="sm" variant="ghost" onClick={() => setDrawer({ mode: "edit", row: e })}>Edit</Button>
                  </div>
                </Td>
              </tr>
            ))}
          </tbody>
        </Table>
      )}
      {drawer && (
        <ExhibitorDrawer event={event} row={drawer.mode === "edit" ? drawer.row : null} categories={categories} booths={booths} levels={levels} extras={extras}
          onClose={() => setDrawer(null)} onSaved={() => { setDrawer(null); refresh(); }} onCopyPortal={copyPortal} onDelete={async (e) => { await del(e); setDrawer(null); }} />
      )}
      <CsvImportDialog open={importing} onClose={() => { setImporting(false); refresh(); }} endpoint={`${base}/exhibitors/import`} title={`Import ${event.terms.exhibitors.toLowerCase()} from CSV (ExpoFP template)`} columns="name, exhibitor_id, booth(s), category, description, address, city, zip, country, phone, email, website, contact_name, logo_url, tags, featured, linkedin, x, facebook, instagram, youtube, video" sample={"name,booth,category,website,email\nAcme Robotics,A101,Robotics & Automation,https://acme.example,hello@acme.example"} />
    </>
  );
}

type Form = {
  name: string; externalId: string; gripId: string; logoUrl: string; gallery: string[]; description: string; website: string; email: string; phone: string; contactName: string; country: string; address: string; city: string; zip: string;
  featured: boolean; sponsorLevel: SponsorLevel | ""; customButtonTitle: string; customButtonUrl: string; videoUrl: string; leadingImageUrl: string; logoInBooth: boolean; metadata: Record<string, string>; socials: Record<string, string>; tags: string; categoryIds: string[]; boothIds: string[];
};
const empty: Form = { name: "", externalId: "", gripId: "", logoUrl: "", gallery: [], description: "", website: "", email: "", phone: "", contactName: "", country: "", address: "", city: "", zip: "", featured: false, sponsorLevel: "", customButtonTitle: "", customButtonUrl: "", videoUrl: "", leadingImageUrl: "", logoInBooth: true, metadata: {}, socials: {}, tags: "", categoryIds: [], boothIds: [] };
function fromRow(r: ExhibitorRow): Form {
  return { name: r.name, externalId: r.externalId ?? "", gripId: r.gripId ?? "", logoUrl: r.logoUrl ?? "", gallery: r.gallery ?? [], description: r.description ?? "", website: r.website ?? "", email: r.email ?? "", phone: r.phone ?? "", contactName: r.contactName ?? "", country: r.country ?? "", address: r.address ?? "", city: r.city ?? "", zip: r.zip ?? "", featured: r.featured, sponsorLevel: r.sponsorLevel ?? "", customButtonTitle: r.customButtonTitle ?? "", customButtonUrl: r.customButtonUrl ?? "", videoUrl: r.videoUrl ?? "", leadingImageUrl: r.leadingImageUrl ?? "", logoInBooth: r.logoInBooth, metadata: r.metadata ?? {}, socials: r.socials ?? {}, tags: (r.tags ?? []).join(", "), categoryIds: r.categoryIds, boothIds: r.boothIds };
}

interface AssignedExtra { id: string; extraId: string; quantity: number; name: string; kind: string; priceCents: number | null; currency: string }

function ExhibitorDrawer({ event, row, categories, booths, levels, extras, onClose, onSaved, onCopyPortal, onDelete }: { event: ExhibitorsEvent; row: ExhibitorRow | null; categories: CategoryRef[]; booths: BoothRef[]; levels: LevelRef[]; extras: ExtraRef[]; onClose: () => void; onSaved: () => void; onCopyPortal: (e: ExhibitorRow, rotate?: boolean) => void; onDelete: (e: ExhibitorRow) => Promise<void> }) {
  const [f, setF] = React.useState<Form>(row ? fromRow(row) : empty);
  const [tab, setTab] = React.useState<"profile" | "media" | "placement" | "extras">("profile");
  const [busy, setBusy] = React.useState(false);
  const [boothQ, setBoothQ] = React.useState("");
  const [assigned, setAssigned] = React.useState<AssignedExtra[] | null>(null);
  const [extraId, setExtraId] = React.useState("");
  const [qty, setQty] = React.useState("1");
  const base = eventApi(event.id);
  const set = <K extends keyof Form>(k: K, v: Form[K]) => setF((s) => ({ ...s, [k]: v }));
  const levelName = React.useMemo(() => new Map(levels.map((l) => [l.id, l.shortName])), [levels]);

  React.useEffect(() => {
    if (!row || tab !== "extras" || assigned) return;
    void api<AssignedExtra[]>(`${base}/exhibitors/${row.id}/extras`).then(setAssigned).catch(() => setAssigned([]));
  }, [row, tab, assigned, base]);

  const payload = () => ({
    name: f.name.trim(), externalId: nz(f.externalId), gripId: nz(f.gripId), logoUrl: nz(f.logoUrl), gallery: f.gallery.filter((g) => g.trim()), description: nz(f.description), website: nz(f.website), email: nz(f.email), phone: nz(f.phone), contactName: nz(f.contactName),
    country: nz(f.country), address: nz(f.address), city: nz(f.city), zip: nz(f.zip), featured: f.featured, sponsorLevel: f.sponsorLevel || null, customButtonTitle: nz(f.customButtonTitle), customButtonUrl: nz(f.customButtonUrl), videoUrl: nz(f.videoUrl), leadingImageUrl: nz(f.leadingImageUrl),
    logoInBooth: f.logoInBooth, metadata: f.metadata, socials: Object.fromEntries(Object.entries(f.socials).filter(([, v]) => v.trim())), tags: f.tags.split(",").map((t) => t.trim()).filter(Boolean), categoryIds: f.categoryIds, boothIds: f.boothIds,
  });
  const save = async () => {
    setBusy(true);
    const r = await run(() => row ? api(`${base}/exhibitors/${row.id}`, { method: "PATCH", json: payload() }) : api(`${base}/exhibitors`, { method: "POST", json: payload() }), { success: row ? "Saved" : "Created" });
    setBusy(false);
    if (r) onSaved();
  };
  const addExtra = async () => {
    if (!row || !extraId) return;
    const r = await run(() => api<AssignedExtra[]>(`${base}/exhibitors/${row.id}/extras`, { method: "POST", json: { extraId, quantity: Math.max(1, Number(qty) || 1) } }), { success: "Extra assigned" });
    if (r) { setAssigned(r); setExtraId(""); setQty("1"); }
  };
  const removeExtra = async (xid: string) => {
    if (!row) return;
    const r = await run(() => api<AssignedExtra[]>(`${base}/exhibitors/${row.id}/extras`, { method: "DELETE", json: { extraId: xid } }), { success: "Extra removed" });
    if (r) setAssigned(r);
  };

  const boothNeedle = boothQ.trim().toLowerCase();
  const boothChoices = booths.filter((b) => !f.boothIds.includes(b.id) && (!boothNeedle || b.label.toLowerCase().includes(boothNeedle))).slice(0, 12);
  const tabs: { id: typeof tab; label: string }[] = [{ id: "profile", label: "Profile" }, { id: "media", label: "Media & links" }, { id: "placement", label: `${event.terms.booths} & categories` }, { id: "extras", label: "Extras" }];

  return (
    <Drawer open onClose={onClose} wide title={row ? row.name : `New ${event.terms.exhibitor.toLowerCase()}`}
      footer={<>
        {row && <div className="mr-auto flex gap-1"><ConfirmButton variant="outline" onConfirm={() => onDelete(row)} message="Delete this exhibitor?">Delete</ConfirmButton><Button size="sm" variant="ghost" onClick={() => onCopyPortal(row)}>Copy portal link</Button><Button size="sm" variant="ghost" onClick={() => onCopyPortal(row, true)}>Rotate link</Button></div>}
        <Button variant="ghost" onClick={onClose}>Cancel</Button>
        <Button onClick={save} loading={busy} disabled={!f.name.trim()}>{row ? "Save changes" : "Create"}</Button>
      </>}>
      <div className="mb-4 flex gap-1 border-b border-border">
        {tabs.map((t) => <button key={t.id} type="button" onClick={() => setTab(t.id)} className={`-mb-px border-b-2 px-3 py-2 text-sm ${tab === t.id ? "border-primary font-medium text-primary" : "border-transparent text-gray-500 hover:text-gray-900"}`}>{t.label}</button>)}
      </div>

      {tab === "profile" && (
        <div className="space-y-4">
          <FormRow>
            <Field label="Name"><Input required value={f.name} onChange={(e) => set("name", e.target.value)} autoFocus /></Field>
            <Field label="Sponsor level"><Select value={f.sponsorLevel} onChange={(e) => set("sponsorLevel", e.target.value as SponsorLevel | "")}><option value="">None</option>{SPONSOR_LEVELS.map((s) => <option key={s} value={s}>{s}</option>)}</Select></Field>
          </FormRow>
          <Field label="Description"><Textarea value={f.description} onChange={(e) => set("description", e.target.value)} className="min-h-28" /></Field>
          <FormRow cols={3}>
            <Field label="Website"><Input value={f.website} onChange={(e) => set("website", e.target.value)} placeholder="https://" /></Field>
            <Field label="Email"><Input type="email" value={f.email} onChange={(e) => set("email", e.target.value)} /></Field>
            <Field label="Phone"><Input value={f.phone} onChange={(e) => set("phone", e.target.value)} /></Field>
          </FormRow>
          <FormRow cols={4}>
            <Field label="Contact name" className="sm:col-span-2"><Input value={f.contactName} onChange={(e) => set("contactName", e.target.value)} /></Field>
            <Field label="External id"><Input value={f.externalId} onChange={(e) => set("externalId", e.target.value)} placeholder="CRM id" /></Field>
            <Field label="Grip id"><Input value={f.gripId} onChange={(e) => set("gripId", e.target.value)} /></Field>
          </FormRow>
          <FormRow cols={4}>
            <Field label="Address" className="sm:col-span-2"><Input value={f.address} onChange={(e) => set("address", e.target.value)} /></Field>
            <Field label="City"><Input value={f.city} onChange={(e) => set("city", e.target.value)} /></Field>
            <Field label="ZIP"><Input value={f.zip} onChange={(e) => set("zip", e.target.value)} /></Field>
          </FormRow>
          <FormRow>
            <Field label="Country"><Input value={f.country} onChange={(e) => set("country", e.target.value)} /></Field>
            <Field label="Tags" hint="Comma-separated; searchable in the viewer"><Input value={f.tags} onChange={(e) => set("tags", e.target.value)} placeholder="ai, startup, hiring" /></Field>
          </FormRow>
          <div className="grid gap-3 sm:grid-cols-2">
            <Switch checked={f.featured} onChange={(v) => set("featured", v)} label="Featured" description="Shown first in lists and in the sponsors strip." />
            <Switch checked={f.logoInBooth} onChange={(v) => set("logoInBooth", v)} label="Logo in booth" description="Render the logo inside the booth polygon." />
          </div>
          <div>
            <span className="mb-1 block text-xs font-medium uppercase tracking-wide text-gray-500">Metadata</span>
            <KeyValueEditor value={f.metadata} onChange={(v) => set("metadata", v)} />
          </div>
        </div>
      )}

      {tab === "media" && (
        <div className="space-y-4">
          <ImageField label="Logo" value={f.logoUrl} onChange={(v) => set("logoUrl", v)} />
          <ImageField label="Leading image (profile header)" value={f.leadingImageUrl} onChange={(v) => set("leadingImageUrl", v)} />
          <Field label="Video URL" hint="YouTube / Vimeo / MP4"><Input value={f.videoUrl} onChange={(e) => set("videoUrl", e.target.value)} placeholder="https://" /></Field>
          <div>
            <span className="mb-1 block text-xs font-medium uppercase tracking-wide text-gray-500">Gallery image URLs</span>
            <ListEditor value={f.gallery} onChange={(v) => set("gallery", v)} addLabel="Add image" />
          </div>
          <FormRow>
            <Field label="Custom button title"><Input value={f.customButtonTitle} onChange={(e) => set("customButtonTitle", e.target.value)} placeholder="Book a meeting" maxLength={80} /></Field>
            <Field label="Custom button URL"><Input value={f.customButtonUrl} onChange={(e) => set("customButtonUrl", e.target.value)} placeholder="https://" /></Field>
          </FormRow>
          <div>
            <span className="mb-1 block text-xs font-medium uppercase tracking-wide text-gray-500">Social links</span>
            <div className="grid gap-2 sm:grid-cols-2">
              {SOCIAL_KEYS.map((k) => <Input key={k} value={f.socials[k] ?? ""} onChange={(e) => set("socials", { ...f.socials, [k]: e.target.value })} placeholder={`${k} URL`} aria-label={k} />)}
            </div>
          </div>
        </div>
      )}

      {tab === "placement" && (
        <div className="space-y-5">
          <div>
            <span className="mb-1 block text-xs font-medium uppercase tracking-wide text-gray-500">{event.terms.booths}</span>
            <div className="mb-2 flex flex-wrap gap-1">
              {f.boothIds.length === 0 && <span className="text-sm text-gray-500">No {event.terms.booth.toLowerCase()} assigned.</span>}
              {f.boothIds.map((id) => { const b = booths.find((x) => x.id === id); return <span key={id} className="inline-flex items-center gap-1 rounded-full bg-gray-100 px-2 py-0.5 text-sm">{b?.label ?? id}{b && <span className="text-xs text-gray-500">{levelName.get(b.levelId)}</span>}<button type="button" className="text-gray-400 hover:text-red-600" onClick={() => set("boothIds", f.boothIds.filter((x) => x !== id))} aria-label="Remove">×</button></span>; })}
            </div>
            <SearchInput value={boothQ} onChange={setBoothQ} placeholder={`Add a ${event.terms.booth.toLowerCase()} by label…`} />
            {boothQ && (
              <ul className="mt-1 max-h-48 divide-y divide-border overflow-y-auto rounded-lg border border-border">
                {boothChoices.length === 0 && <li className="px-3 py-2 text-sm text-gray-500">No matches</li>}
                {boothChoices.map((b) => <li key={b.id}><button type="button" className="flex w-full items-center justify-between px-3 py-1.5 text-left text-sm hover:bg-gray-50" onClick={() => { set("boothIds", [...f.boothIds, b.id]); setBoothQ(""); }}><span className="font-medium">{b.label}</span><span className="text-xs text-gray-500">{levelName.get(b.levelId)} · {b.status}</span></button></li>)}
              </ul>
            )}
            <p className="mt-1 text-xs text-gray-500">Assigning here does not change the booth status; use the {event.terms.booths} page to mark it sold.</p>
          </div>
          <div>
            <span className="mb-1 block text-xs font-medium uppercase tracking-wide text-gray-500">Categories</span>
            {categories.length === 0 ? <p className="text-sm text-gray-500">No categories yet.</p> : (
              <div className="grid gap-1 sm:grid-cols-2">
                {categories.map((c) => <Checkbox key={c.id} checked={f.categoryIds.includes(c.id)} onChange={(v) => set("categoryIds", v ? [...f.categoryIds, c.id] : f.categoryIds.filter((x) => x !== c.id))} label={<span className="inline-flex items-center gap-1.5">{c.color && <span className="size-2 rounded-full" style={{ background: c.color }} />}{c.name}</span>} />)}
              </div>
            )}
          </div>
        </div>
      )}

      {tab === "extras" && (
        !row ? <p className="text-sm text-gray-500">Save the {event.terms.exhibitor.toLowerCase()} first to assign extras and sponsorships.</p> : (
          <div className="space-y-4">
            {assigned === null ? <p className="text-sm text-gray-500">Loading…</p> : assigned.length === 0 ? <p className="text-sm text-gray-500">No extras or sponsorships assigned.</p> : (
              <ul className="divide-y divide-border rounded-lg border border-border">
                {assigned.map((x) => <li key={x.id} className="flex items-center justify-between gap-2 px-3 py-2 text-sm"><span><span className="font-medium">{x.name}</span> <Badge tone={x.kind === "sponsorship" ? "purple" : "gray"}>{x.kind === "sponsorship" ? "sponsorship" : "booth extra"}</Badge> <span className="text-gray-500">× {x.quantity}{x.priceCents != null ? ` · ${formatMoney(x.priceCents * x.quantity, x.currency)}` : ""}</span></span><Button size="sm" variant="ghost" onClick={() => removeExtra(x.extraId)}>Remove</Button></li>)}
              </ul>
            )}
            <div className="flex flex-wrap items-end gap-2">
              <Field label="Add extra" className="min-w-56 flex-1"><Select value={extraId} onChange={(e) => setExtraId(e.target.value)}><option value="">Choose…</option>{extras.map((x) => <option key={x.id} value={x.id}>{x.name}{x.priceCents != null ? ` — ${formatMoney(x.priceCents, x.currency)}` : ""}</option>)}</Select></Field>
              <Field label="Qty" className="w-20"><Input type="number" min={1} value={qty} onChange={(e) => setQty(e.target.value)} /></Field>
              <Button onClick={addExtra} disabled={!extraId}>Assign</Button>
            </div>
            {extras.length === 0 && <p className="text-xs text-gray-500">Define extras and sponsorship packages under Sales.</p>}
          </div>
        )
      )}
    </Drawer>
  );
}

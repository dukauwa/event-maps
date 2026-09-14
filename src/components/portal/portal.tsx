"use client";
import { useEffect, useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import QRCode from "qrcode";
import { Badge, Button, Card, EmptyState, Field, Input, Select, Textarea, api, cn, statusTone, toast, Toaster } from "@/components/ui";
import { formatMoney } from "@/lib/pricing";
import { fmtDateTime, profileCompleteness } from "@/lib/portal/format";
import type { EventSettings } from "@/lib/domain/types";
import type { ExhibitorFull } from "@/lib/services/exhibitors";
import type { Order } from "@/lib/db/schema";

type Price = { priceCents: number; currency: string } | null;
interface Props {
  token: string; needsCookie: boolean; tab: string;
  event: { id: string; slug: string; name: string; timezone: string | null; settings: EventSettings; publicUrl: string };
  exhibitor: ExhibitorFull;
  categories: { id: string; name: string; color: string | null }[];
  myBooths: { id: string; label: string; levelName: string; areaM2: number; status: string; price: Price }[];
  availableBooths: { id: string; label: string; levelId: string; levelName: string; areaM2: number; widthM: number | null; heightM: number | null; boothType: string; price: Price }[];
  extras: { id: string; name: string; kind: string; description: string | null; priceCents: number | null; currency: string; limitPerEvent: number | null; limitPerExhibitor: number | null; quantityUsed: number }[];
  myExtras: { id: string; extraId: string; quantity: number; name: string; priceCents: number | null; currency: string }[];
  orders: Order[];
  analytics: { totals: Record<string, number>; byDay: { day: string; views: number }[] };
}

const TABS = [["profile", "Profile"], ["booth", "Booth"], ["extras", "Add-ons"], ["orders", "Orders"], ["analytics", "Analytics"], ["share", "Share"]] as const;

export function Portal(p: Props) {
  const router = useRouter();
  const [tab, setTab] = useState(p.tab);
  const [ready, setReady] = useState(!p.needsCookie);
  useEffect(() => {
    if (!p.needsCookie) return;
    api("/x/api/session", { method: "POST", json: { token: p.token } }).then(() => setReady(true)).catch(() => toast("Could not start your session", "error"));
  }, [p.needsCookie, p.token]);
  const t = p.event.settings.terms;
  const primary = p.event.settings.branding.primaryColor;
  return (
    <div className="min-h-dvh bg-background" style={{ ["--primary" as string]: primary }}>
      <Toaster />
      <header className="border-b border-border bg-surface">
        <div className="mx-auto flex max-w-5xl flex-wrap items-center gap-4 px-4 py-4">
          {p.event.settings.branding.logoUrl && <img src={p.event.settings.branding.logoUrl} alt="" className="size-10 rounded-lg" />}
          <div className="min-w-0 flex-1">
            <p className="text-xs uppercase tracking-wide text-gray-500">{p.event.name} · Exhibitor portal</p>
            <h1 className="truncate text-lg font-semibold">{p.exhibitor.name}</h1>
          </div>
          <div className="flex flex-wrap gap-2">
            {p.myBooths.map((b) => <a key={b.id} href={`${p.event.publicUrl}?booth=${encodeURIComponent(b.label)}`} target="_blank" rel="noreferrer" className="rounded-full bg-primary/10 px-3 py-1 text-sm font-medium text-primary">{t.booth} {b.label} ↗</a>)}
            {p.myBooths.length === 0 && <Badge tone="yellow">No {t.booth.toLowerCase()} yet</Badge>}
          </div>
        </div>
        <nav className="mx-auto flex max-w-5xl gap-1 overflow-x-auto px-4" aria-label="Portal sections">
          {TABS.map(([k, label]) => (
            <button key={k} onClick={() => { setTab(k); history.replaceState(null, "", `?tab=${k}`); }} className={cn("whitespace-nowrap border-b-2 px-3 py-2 text-sm", tab === k ? "border-primary font-medium text-primary" : "border-transparent text-gray-600 hover:text-gray-900")}>{label}</button>
          ))}
        </nav>
      </header>
      <main className="mx-auto max-w-5xl px-4 py-6">
        {!ready ? <p className="text-sm text-gray-500">Signing you in…</p> : (
          <>
            {tab === "profile" && <ProfileTab p={p} onSaved={() => router.refresh()} />}
            {tab === "booth" && <BoothTab p={p} />}
            {tab === "extras" && <ExtrasTab p={p} onChange={() => router.refresh()} />}
            {tab === "orders" && <OrdersTab p={p} />}
            {tab === "analytics" && <AnalyticsTab p={p} />}
            {tab === "share" && <ShareTab p={p} />}
          </>
        )}
      </main>
    </div>
  );
}

function ProfileTab({ p, onSaved }: { p: Props; onSaved: () => void }) {
  const e = p.exhibitor;
  const [f, setF] = useState({ name: e.name, description: e.description ?? "", website: e.website ?? "", email: e.email ?? "", phone: e.phone ?? "", address: e.address ?? "", city: e.city ?? "", zip: e.zip ?? "", country: e.country ?? "", contactName: e.contactName ?? "", videoUrl: e.videoUrl ?? "", customButtonTitle: e.customButtonTitle ?? "", customButtonUrl: e.customButtonUrl ?? "", logoUrl: e.logoUrl ?? "", leadingImageUrl: e.leadingImageUrl ?? "", gallery: e.gallery, categoryIds: e.categoryIds, tags: e.tags.join(", "), socials: { linkedin: e.socials.linkedin ?? "", x: e.socials.x ?? "", instagram: e.socials.instagram ?? "", facebook: e.socials.facebook ?? "", youtube: e.socials.youtube ?? "" } });
  const [busy, setBusy] = useState(false);
  const set = (k: keyof typeof f) => (ev: React.ChangeEvent<HTMLInputElement | HTMLTextAreaElement | HTMLSelectElement>) => setF((s) => ({ ...s, [k]: ev.target.value }));
  const completeness = useMemo(() => profileCompleteness({ ...f, categoryIds: f.categoryIds, gallery: f.gallery, socials: Object.fromEntries(Object.entries(f.socials).filter(([, v]) => v)), boothIds: e.boothIds }), [f, e.boothIds]);

  async function upload(file: File): Promise<string> {
    const fd = new FormData();
    fd.append("file", file);
    const r = await api<{ url: string }>("/x/api/upload", { method: "POST", body: fd });
    return r.url;
  }
  async function save() {
    setBusy(true);
    try {
      const { tags, socials, ...rest } = f;
      await api("/x/api/profile", { method: "PATCH", json: { ...rest, tags: tags.split(",").map((s) => s.trim()).filter(Boolean), socials: Object.fromEntries(Object.entries(socials).filter(([, v]) => v)), website: rest.website || null, email: rest.email || null, phone: rest.phone || null, videoUrl: rest.videoUrl || null, customButtonUrl: rest.customButtonUrl || null, customButtonTitle: rest.customButtonTitle || null, logoUrl: rest.logoUrl || null, leadingImageUrl: rest.leadingImageUrl || null } });
      toast("Profile saved", "success");
      onSaved();
    } catch (err) { toast(err instanceof Error ? err.message : "Save failed", "error"); } finally { setBusy(false); }
  }
  return (
    <div className="grid gap-6 lg:grid-cols-[minmax(0,1fr)_320px]">
      <div className="space-y-5">
        <Card>
          <div className="flex items-center justify-between"><h2 className="font-semibold">Profile completeness</h2><span className="text-sm font-medium">{completeness.score}%</span></div>
          <div className="mt-2 h-2 rounded-full bg-gray-100"><div className="h-2 rounded-full bg-primary transition-all" style={{ width: `${completeness.score}%` }} /></div>
          {completeness.hints.length > 0 && <ul className="mt-3 flex flex-wrap gap-2 text-xs text-gray-600">{completeness.hints.slice(0, 4).map((h) => <li key={h} className="rounded-full bg-gray-100 px-2 py-1">{h}</li>)}</ul>}
        </Card>
        <Card className="space-y-4">
          <h2 className="font-semibold">Company</h2>
          <div className="flex items-center gap-4">
            <div className="size-20 shrink-0 overflow-hidden rounded-xl border border-border bg-gray-50">{f.logoUrl ? <img src={f.logoUrl} alt="Logo" className="size-full object-cover" /> : null}</div>
            <div className="space-y-2">
              <label className="inline-flex cursor-pointer items-center rounded-lg border border-border px-3 py-1.5 text-sm hover:bg-gray-50">Upload logo<input type="file" accept="image/*" className="hidden" onChange={async (ev) => { const file = ev.target.files?.[0]; if (file) { try { setF((s) => ({ ...s, logoUrl: "" })); const url = await upload(file); setF((s) => ({ ...s, logoUrl: url })); } catch { toast("Upload failed", "error"); } } }} /></label>
              <p className="text-xs text-gray-500">Square PNG/SVG, at least 240×240.</p>
            </div>
          </div>
          <Field label="Company name"><Input value={f.name} onChange={set("name")} /></Field>
          <Field label="Description" hint="Shown on your listing. Plain text."><Textarea rows={5} value={f.description} onChange={set("description")} /></Field>
          <div className="grid gap-4 sm:grid-cols-2">
            <Field label="Website"><Input value={f.website} onChange={set("website")} placeholder="https://" /></Field>
            <Field label="Public email"><Input value={f.email} onChange={set("email")} /></Field>
            <Field label="Phone"><Input value={f.phone} onChange={set("phone")} /></Field>
            <Field label="Contact name"><Input value={f.contactName} onChange={set("contactName")} /></Field>
            <Field label="Address"><Input value={f.address} onChange={set("address")} /></Field>
            <Field label="City"><Input value={f.city} onChange={set("city")} /></Field>
            <Field label="Postcode"><Input value={f.zip} onChange={set("zip")} /></Field>
            <Field label="Country"><Input value={f.country} onChange={set("country")} /></Field>
          </div>
          <Field label="Categories">
            <div className="flex flex-wrap gap-2">{p.categories.map((c) => { const on = f.categoryIds.includes(c.id); return <button type="button" key={c.id} onClick={() => setF((s) => ({ ...s, categoryIds: on ? s.categoryIds.filter((x) => x !== c.id) : [...s.categoryIds, c.id] }))} className={cn("rounded-full border px-3 py-1 text-sm", on ? "border-primary bg-primary/10 text-primary" : "border-border text-gray-700")}>{c.name}</button>; })}</div>
          </Field>
          <Field label="Tags" hint="Comma separated"><Input value={f.tags} onChange={set("tags")} /></Field>
        </Card>
        <Card className="space-y-4">
          <h2 className="font-semibold">Media & links</h2>
          <Field label="Gallery">
            <div className="flex flex-wrap gap-2">
              {f.gallery.map((g, i) => <div key={g + i} className="relative size-20 overflow-hidden rounded-lg border border-border"><img src={g} alt="" className="size-full object-cover" /><button type="button" aria-label="Remove image" onClick={() => setF((s) => ({ ...s, gallery: s.gallery.filter((_, j) => j !== i) }))} className="absolute right-1 top-1 rounded bg-black/60 px-1 text-xs text-white">×</button></div>)}
              <label className="flex size-20 cursor-pointer items-center justify-center rounded-lg border border-dashed border-border text-2xl text-gray-400 hover:bg-gray-50">+<input type="file" accept="image/*" className="hidden" onChange={async (ev) => { const file = ev.target.files?.[0]; if (file) { try { const url = await upload(file); setF((s) => ({ ...s, gallery: [...s.gallery, url] })); } catch { toast("Upload failed", "error"); } } }} /></label>
            </div>
          </Field>
          <Field label="Hero image URL"><Input value={f.leadingImageUrl} onChange={set("leadingImageUrl")} placeholder="https://" /></Field>
          <Field label="Video URL" hint="YouTube or Vimeo"><Input value={f.videoUrl} onChange={set("videoUrl")} /></Field>
          <div className="grid gap-4 sm:grid-cols-2">
            <Field label="Custom button label"><Input value={f.customButtonTitle} onChange={set("customButtonTitle")} placeholder="Book a meeting" /></Field>
            <Field label="Custom button link"><Input value={f.customButtonUrl} onChange={set("customButtonUrl")} placeholder="https://" /></Field>
          </div>
          <div className="grid gap-4 sm:grid-cols-2">
            {(["linkedin", "x", "instagram", "facebook", "youtube"] as const).map((k) => <Field key={k} label={k === "x" ? "X / Twitter" : k[0].toUpperCase() + k.slice(1)}><Input value={f.socials[k]} onChange={(ev) => setF((s) => ({ ...s, socials: { ...s.socials, [k]: ev.target.value } }))} placeholder="https://" /></Field>)}
          </div>
        </Card>
        <div className="sticky bottom-4"><Button size="lg" onClick={save} loading={busy} className="w-full shadow-lg">Save profile</Button></div>
      </div>
      <aside className="lg:sticky lg:top-6 lg:self-start">
        <p className="mb-2 text-xs font-medium uppercase tracking-wide text-gray-500">Live preview</p>
        <Card className="space-y-3">
          {f.leadingImageUrl && <img src={f.leadingImageUrl} alt="" className="h-28 w-full rounded-lg object-cover" />}
          <div className="flex items-center gap-3">{f.logoUrl ? <img src={f.logoUrl} alt="" className="size-12 rounded-lg" /> : <div className="size-12 rounded-lg bg-gray-100" />}<div><p className="font-semibold leading-tight">{f.name || "Company name"}</p><p className="text-xs text-gray-500">{p.myBooths.map((b) => `${p.event.settings.terms.booth} ${b.label}`).join(", ") || `No ${p.event.settings.terms.booth.toLowerCase()} yet`}</p></div></div>
          <div className="flex flex-wrap gap-1">{f.categoryIds.map((id) => { const c = p.categories.find((x) => x.id === id); return c ? <span key={id} className="rounded-full bg-gray-100 px-2 py-0.5 text-xs">{c.name}</span> : null; })}</div>
          <p className="line-clamp-5 text-sm text-gray-700">{f.description || "Your description will appear here."}</p>
          {f.customButtonTitle && <span className="inline-block rounded-lg bg-primary px-3 py-1.5 text-sm text-white">{f.customButtonTitle}</span>}
        </Card>
      </aside>
    </div>
  );
}

function BoothTab({ p }: { p: Props }) {
  const t = p.event.settings.terms;
  const [level, setLevel] = useState("");
  const [maxPrice, setMaxPrice] = useState("");
  const [busy, setBusy] = useState<string | null>(null);
  const router = useRouter();
  const holds = p.orders.filter((o) => o.status === "hold" && o.expiresAt && o.expiresAt > new Date().toISOString());
  const list = p.availableBooths.filter((b) => (!level || b.levelName === level) && (!maxPrice || !b.price || b.price.priceCents <= Number(maxPrice) * 100));
  const levels = [...new Set(p.availableBooths.map((b) => b.levelName))];
  async function reserve(boothId: string) {
    setBusy(boothId);
    try {
      const r = await api<{ order: { id: string }; checkoutUrl: string | null }>("/x/api/reserve", { method: "POST", json: { boothId } });
      if (r.checkoutUrl) window.location.assign(r.checkoutUrl); else { toast("Reserved. The organiser will confirm.", "success"); router.refresh(); }
    } catch (err) { toast(err instanceof Error ? err.message : "Could not reserve", "error"); } finally { setBusy(null); }
  }
  return (
    <div className="space-y-6">
      {p.myBooths.length > 0 && (
        <Card>
          <h2 className="font-semibold">Your {p.myBooths.length > 1 ? t.booths : t.booth}</h2>
          <ul className="mt-3 divide-y divide-border">{p.myBooths.map((b) => <li key={b.id} className="flex items-center justify-between py-3 text-sm"><div><p className="font-medium">{t.booth} {b.label}</p><p className="text-gray-500">{b.levelName} · {b.areaM2} m²</p></div><div className="text-right"><Badge tone={statusTone[b.status]}>{b.status}</Badge>{b.price && <p className="mt-1 text-gray-600">{formatMoney(b.price.priceCents, b.price.currency)}</p>}</div></li>)}</ul>
        </Card>
      )}
      {holds.map((o) => <Card key={o.id} className="border-yellow-300 bg-yellow-50"><p className="text-sm">You have a hold on {t.booth.toLowerCase()} <strong>{p.availableBooths.find((b) => b.id === o.boothId)?.label ?? o.boothId}</strong> until {fmtDateTime(o.expiresAt, p.event.timezone)}.</p>{o.checkoutUrl && <a href={o.checkoutUrl} className="mt-2 inline-block text-sm font-medium text-primary underline">Continue to payment</a>}</Card>)}
      <Card>
        <div className="flex flex-wrap items-end justify-between gap-3">
          <h2 className="font-semibold">Available {t.booths.toLowerCase()} <span className="text-gray-500">({list.length})</span></h2>
          <div className="flex gap-2">
            <Select value={level} onChange={(e) => setLevel(e.target.value)} aria-label="Level"><option value="">All levels</option>{levels.map((l) => <option key={l}>{l}</option>)}</Select>
            <Input type="number" placeholder="Max price" value={maxPrice} onChange={(e) => setMaxPrice(e.target.value)} className="w-32" aria-label="Max price" />
          </div>
        </div>
        {list.length === 0 ? <EmptyState title={`No ${t.booths.toLowerCase()} match`} /> : (
          <ul className="mt-4 grid gap-2 sm:grid-cols-2">
            {list.slice(0, 60).map((b) => (
              <li key={b.id} className="flex items-center justify-between rounded-lg border border-border p-3 text-sm">
                <div><p className="font-medium">{b.label} <span className="font-normal text-gray-500">· {b.levelName}</span></p><p className="text-gray-500">{b.widthM && b.heightM ? `${b.widthM}×${b.heightM} m · ` : ""}{b.areaM2} m² · {b.boothType}</p></div>
                <div className="text-right">{b.price && <p className="font-medium">{formatMoney(b.price.priceCents, b.price.currency)}</p>}<Button size="sm" variant="outline" loading={busy === b.id} onClick={() => reserve(b.id)}>{p.event.settings.sales.mode === "buy" ? "Buy" : "Reserve"}</Button></div>
              </li>
            ))}
          </ul>
        )}
        {list.length > 60 && <p className="mt-2 text-xs text-gray-500">Showing 60 of {list.length}. Use the filters or the <a className="underline" href={p.event.publicUrl} target="_blank" rel="noreferrer">map</a>.</p>}
      </Card>
    </div>
  );
}

function ExtrasTab({ p, onChange }: { p: Props; onChange: () => void }) {
  const [busy, setBusy] = useState<string | null>(null);
  async function add(extraId: string) { setBusy(extraId); try { await api("/x/api/extras", { method: "POST", json: { extraId, quantity: 1 } }); toast("Added", "success"); onChange(); } catch (err) { toast(err instanceof Error ? err.message : "Failed", "error"); } finally { setBusy(null); } }
  async function remove(extraId: string) { setBusy(extraId); try { await api("/x/api/extras", { method: "DELETE", json: { extraId } }); onChange(); } catch (err) { toast(err instanceof Error ? err.message : "Failed", "error"); } finally { setBusy(null); } }
  const mine = new Map(p.myExtras.map((m) => [m.extraId, m]));
  return (
    <div className="grid gap-6 md:grid-cols-2">
      {(["sponsorship", "booth_extra"] as const).map((kind) => (
        <Card key={kind}>
          <h2 className="font-semibold">{kind === "sponsorship" ? "Sponsorship packages" : "Booth extras"}</h2>
          <ul className="mt-3 space-y-3">
            {p.extras.filter((x) => x.kind === kind).map((x) => {
              const left = x.limitPerEvent != null ? x.limitPerEvent - x.quantityUsed : null;
              const held = mine.get(x.id);
              return (
                <li key={x.id} className="rounded-lg border border-border p-3 text-sm">
                  <div className="flex items-start justify-between gap-3"><div><p className="font-medium">{x.name}</p>{x.description && <p className="text-gray-600">{x.description}</p>}<p className="mt-1 text-xs text-gray-500">{x.priceCents != null ? formatMoney(x.priceCents, x.currency) : "Price on request"}{left != null && ` · ${left} left`}{x.limitPerExhibitor != null && ` · max ${x.limitPerExhibitor} each`}</p></div>
                    {held ? <Button size="sm" variant="outline" loading={busy === x.id} onClick={() => remove(x.id)}>Remove ({held.quantity})</Button> : <Button size="sm" loading={busy === x.id} disabled={left === 0} onClick={() => add(x.id)}>Add</Button>}
                  </div>
                </li>
              );
            })}
            {p.extras.filter((x) => x.kind === kind).length === 0 && <li className="text-sm text-gray-500">Nothing offered yet.</li>}
          </ul>
        </Card>
      ))}
    </div>
  );
}

function OrdersTab({ p }: { p: Props }) {
  if (!p.orders.length) return <EmptyState title="No orders yet" hint="Reserve a booth or add extras to see orders here." />;
  return (
    <Card>
      <ul className="divide-y divide-border">{p.orders.map((o) => <li key={o.id} className="flex flex-wrap items-center justify-between gap-2 py-3 text-sm"><div><p className="font-medium">{p.event.settings.terms.booth} {p.myBooths.find((b) => b.id === o.boothId)?.label ?? p.availableBooths.find((b) => b.id === o.boothId)?.label ?? o.boothId}</p><p className="text-xs text-gray-500">{fmtDateTime(o.createdAt, p.event.timezone)} · ref {o.id}</p></div><div className="flex items-center gap-3"><span className="font-medium">{formatMoney(o.amountCents + o.taxCents, o.currency)}</span><Badge tone={statusTone[o.status]}>{o.status.replace("_", " ")}</Badge>{o.status === "hold" && o.checkoutUrl && <a href={o.checkoutUrl} className="text-primary underline">Pay now</a>}</div></li>)}</ul>
    </Card>
  );
}

function AnalyticsTab({ p }: { p: Props }) {
  const days = p.analytics.byDay.slice(-30);
  const max = Math.max(1, ...days.map((d) => d.views));
  const tiles: [string, number][] = [["Profile views", p.analytics.totals.exhibitor_view ?? 0], ["Bookmarks", p.analytics.totals.bookmark ?? 0], ["Directions requested", p.analytics.totals.route ?? 0], ["Button clicks", p.analytics.totals.custom_button ?? 0]];
  return (
    <div className="space-y-6">
      <div className="grid gap-3 sm:grid-cols-4">{tiles.map(([k, v]) => <Card key={k}><p className="text-xs uppercase tracking-wide text-gray-500">{k}</p><p className="mt-1 text-2xl font-semibold">{v}</p></Card>)}</div>
      <Card>
        <h2 className="font-semibold">Profile views, last 30 days</h2>
        {days.length === 0 ? <p className="mt-2 text-sm text-gray-500">No views yet.</p> : (
          <svg viewBox={`0 0 ${days.length * 12} 60`} className="mt-3 h-32 w-full" role="img" aria-label="Views per day">
            {days.map((d, i) => <rect key={d.day} x={i * 12 + 1} y={60 - (d.views / max) * 56} width={10} height={(d.views / max) * 56} fill="var(--primary)" rx={1}><title>{d.day}: {d.views}</title></rect>)}
          </svg>
        )}
      </Card>
    </div>
  );
}

function ShareTab({ p }: { p: Props }) {
  const link = `${p.event.publicUrl}?exhibitor=${encodeURIComponent(p.exhibitor.slug)}`;
  const [qr, setQr] = useState<string>("");
  useEffect(() => { QRCode.toDataURL(link, { width: 240, margin: 1 }).then(setQr).catch(() => setQr("")); }, [link]);
  const badge = `<a href="${link}" style="display:inline-flex;align-items:center;gap:8px;padding:8px 14px;border-radius:999px;background:${p.event.settings.branding.primaryColor};color:#fff;font:600 14px system-ui;text-decoration:none">📍 Find us at ${p.event.settings.terms.booth} ${p.myBooths.map((b) => b.label).join(", ") || "…"} · ${p.event.name}</a>`;
  return (
    <div className="grid gap-6 md:grid-cols-2">
      <Card className="space-y-3">
        <h2 className="font-semibold">Your public link</h2>
        <Input readOnly value={link} onFocus={(e) => e.currentTarget.select()} />
        <Button variant="outline" onClick={() => navigator.clipboard.writeText(link).then(() => toast("Copied", "success"))}>Copy link</Button>
        {qr && <img src={qr} alt="QR code to your listing" className="size-48 rounded-lg border border-border" />}
      </Card>
      <Card className="space-y-3">
        <h2 className="font-semibold">&ldquo;Find us&rdquo; badge</h2>
        <div dangerouslySetInnerHTML={{ __html: badge }} />
        <Textarea readOnly rows={5} value={badge} onFocus={(e) => e.currentTarget.select()} />
        <Button variant="outline" onClick={() => navigator.clipboard.writeText(badge).then(() => toast("Copied", "success"))}>Copy HTML</Button>
      </Card>
    </div>
  );
}

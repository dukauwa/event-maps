"use client";
import { useState } from "react";
import { useRouter } from "next/navigation";
import { Button, Field, Input, Textarea, api, toast, Toaster } from "@/components/ui";
import { formatMoney } from "@/lib/pricing";

interface Props {
  eventSlug: string; boothId: string; boothLabel: string; mode: "reserve" | "buy" | "inquiry";
  extras: { id: string; name: string; priceCents: number | null; currency: string; kind: string }[];
  termsUrl: string | null; defaults: { company: string; contactName: string; contactEmail: string }; exhibitorId: string | null;
}

export function ReserveForm({ eventSlug, boothId, boothLabel, mode, extras, termsUrl, defaults, exhibitorId }: Props) {
  const router = useRouter();
  const [form, setForm] = useState({ ...defaults, notes: "" });
  const [picked, setPicked] = useState<Record<string, number>>({});
  const [agree, setAgree] = useState(false);
  const [busy, setBusy] = useState(false);
  const [done, setDone] = useState<null | { status: string; id: string }>(null);
  const set = (k: keyof typeof form) => (e: React.ChangeEvent<HTMLInputElement | HTMLTextAreaElement>) => setForm((f) => ({ ...f, [k]: e.target.value }));

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    if (termsUrl && !agree) { toast("Please accept the terms", "error"); return; }
    setBusy(true);
    try {
      const r = await api<{ order: { id: string; status: string }; checkoutUrl: string | null }>(`/api/v1/events/${eventSlug}/reserve`, { method: "POST", json: { boothId, exhibitorId: exhibitorId ?? undefined, ...form, extras: Object.entries(picked).filter(([, q]) => q > 0).map(([extraId, quantity]) => ({ extraId, quantity })) } });
      if (r.checkoutUrl) { window.location.assign(r.checkoutUrl); return; }
      setDone({ status: r.order.status, id: r.order.id });
      router.refresh();
    } catch (err) {
      toast(err instanceof Error ? err.message : "Could not reserve", "error");
    } finally { setBusy(false); }
  }

  if (done) return (
    <div className="rounded-xl border border-green-200 bg-green-50 p-5 text-sm text-green-900">
      <p className="text-base font-semibold">Request received for booth {boothLabel}</p>
      <p className="mt-1">{mode === "inquiry" ? "The organiser will get back to you shortly." : "The booth is now reserved for you. The organiser will confirm and send payment details."}</p>
      <p className="mt-2 text-xs text-green-800">Reference: {done.id}</p>
    </div>
  );

  return (
    <form onSubmit={submit} className="space-y-4 rounded-xl border border-border bg-surface p-5">
      <Toaster />
      <h2 className="font-semibold">{mode === "buy" ? "Buy this booth" : mode === "reserve" ? "Reserve this booth" : "Ask about this booth"}</h2>
      <div className="grid gap-4 sm:grid-cols-2">
        <Field label="Company" className="sm:col-span-2"><Input required value={form.company} onChange={set("company")} placeholder="Acme Ltd" /></Field>
        <Field label="Contact name"><Input required value={form.contactName} onChange={set("contactName")} /></Field>
        <Field label="Email"><Input type="email" required value={form.contactEmail} onChange={set("contactEmail")} /></Field>
        <Field label="Notes" className="sm:col-span-2"><Textarea value={form.notes} onChange={set("notes")} placeholder="Anything the organiser should know" /></Field>
      </div>
      {extras.length > 0 && (
        <fieldset className="space-y-2">
          <legend className="text-xs font-medium uppercase tracking-wide text-gray-500">Add-ons</legend>
          {extras.map((x) => (
            <label key={x.id} className="flex items-center justify-between gap-3 rounded-lg border border-border px-3 py-2 text-sm">
              <span>{x.name} {x.priceCents != null && <span className="text-gray-500">· {formatMoney(x.priceCents, x.currency)}</span>}</span>
              <input type="number" min={0} max={10} className="w-16 rounded border border-border px-2 py-1" value={picked[x.id] ?? 0} onChange={(e) => setPicked((p) => ({ ...p, [x.id]: Number(e.target.value) }))} aria-label={`Quantity of ${x.name}`} />
            </label>
          ))}
        </fieldset>
      )}
      {termsUrl && <label className="flex items-center gap-2 text-sm"><input type="checkbox" checked={agree} onChange={(e) => setAgree(e.target.checked)} /> I accept the <a className="text-primary underline" href={termsUrl} target="_blank" rel="noreferrer">terms and conditions</a></label>}
      <Button type="submit" loading={busy} size="lg" className="w-full">{mode === "buy" ? "Continue to payment" : mode === "reserve" ? "Reserve now" : "Send inquiry"}</Button>
      {mode === "buy" && <p className="text-xs text-gray-500">The booth is held for you while you complete checkout.</p>}
    </form>
  );
}

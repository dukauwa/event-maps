"use client";
import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { Button, Field, Input, api, toast, Toaster } from "@/components/ui";

export function MockCheckout({ eventSlug, orderId, boothId, expiresAt }: { eventSlug: string; orderId: string; boothId: string; expiresAt: string | null }) {
  const router = useRouter();
  const [busy, setBusy] = useState(false);
  const [left, setLeft] = useState<number | null>(null);
  // Left empty on purpose. The browser treats these as card fields and autofills them before React
  // hydrates; a server-rendered value would then disagree with the DOM. Any value is accepted anyway.
  const [card, setCard] = useState({ number: "", expiry: "", cvc: "" });
  useEffect(() => {
    if (!expiresAt) return;
    const tick = () => setLeft(Math.max(0, Math.floor((new Date(expiresAt).getTime() - Date.now()) / 1000)));
    tick();
    const t = setInterval(tick, 1000);
    return () => clearInterval(t);
  }, [expiresAt]);
  async function pay(e: React.FormEvent) {
    e.preventDefault();
    setBusy(true);
    try {
      await api(`/api/v1/events/${eventSlug}/orders/${orderId}/mock-pay`, { method: "POST" });
      router.push(`/e/${eventSlug}/reserve/${boothId}/done?order=${orderId}`);
    } catch (err) {
      toast(err instanceof Error ? err.message : "Payment failed", "error");
      setBusy(false);
    }
  }
  return (
    <form onSubmit={pay} autoComplete="off" className="mt-6 space-y-4 rounded-xl border border-border bg-surface p-5">
      <Toaster />
      {left != null && <p className={`text-sm ${left < 120 ? "text-red-600" : "text-gray-600"}`}>Hold expires in {Math.floor(left / 60)}:{String(left % 60).padStart(2, "0")}</p>}
      <Field label="Card number"><Input suppressHydrationWarning inputMode="numeric" autoComplete="off" placeholder="4242 4242 4242 4242" value={card.number} onChange={(e) => setCard((c) => ({ ...c, number: e.target.value }))} /></Field>
      <div className="grid grid-cols-2 gap-4">
        <Field label="Expiry"><Input suppressHydrationWarning autoComplete="off" placeholder="12/34" value={card.expiry} onChange={(e) => setCard((c) => ({ ...c, expiry: e.target.value }))} /></Field>
        <Field label="CVC"><Input suppressHydrationWarning autoComplete="off" placeholder="123" value={card.cvc} onChange={(e) => setCard((c) => ({ ...c, cvc: e.target.value }))} /></Field>
      </div>
      <Button type="submit" size="lg" className="w-full" loading={busy} disabled={left === 0}>Pay now</Button>
      <p className="text-center text-xs text-gray-500">Test mode: any card details are accepted, including none at all.</p>
    </form>
  );
}

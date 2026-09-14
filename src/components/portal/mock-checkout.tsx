"use client";
import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { Button, Field, Input, api, toast, Toaster } from "@/components/ui";

export function MockCheckout({ eventSlug, orderId, boothId, expiresAt }: { eventSlug: string; orderId: string; boothId: string; expiresAt: string | null }) {
  const router = useRouter();
  const [busy, setBusy] = useState(false);
  const [left, setLeft] = useState<number | null>(null);
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
    <form onSubmit={pay} className="mt-6 space-y-4 rounded-xl border border-border bg-surface p-5">
      <Toaster />
      {left != null && <p className={`text-sm ${left < 120 ? "text-red-600" : "text-gray-600"}`}>Hold expires in {Math.floor(left / 60)}:{String(left % 60).padStart(2, "0")}</p>}
      <Field label="Card number"><Input inputMode="numeric" placeholder="4242 4242 4242 4242" defaultValue="4242 4242 4242 4242" /></Field>
      <div className="grid grid-cols-2 gap-4">
        <Field label="Expiry"><Input placeholder="12/34" defaultValue="12/34" /></Field>
        <Field label="CVC"><Input placeholder="123" defaultValue="123" /></Field>
      </div>
      <Button type="submit" size="lg" className="w-full" loading={busy} disabled={left === 0}>Pay now</Button>
      <p className="text-center text-xs text-gray-500">Any card details are accepted in test mode.</p>
    </form>
  );
}

import { cookies } from "next/headers";
import { resolvePortal } from "@/lib/portal/auth";
import { EXHIBITOR_COOKIE } from "@/lib/auth/session";
import { db } from "@/lib/db";
import { getViewerBundle, buildBundle } from "@/lib/bundle";
import { listCategories } from "@/lib/services/categories";
import { listExtras, listExhibitorExtras } from "@/lib/services/extras";
import { listOrders, expireOrders } from "@/lib/services/orders";
import { exhibitorAnalytics } from "@/lib/services/analytics";
import { listPricingRules } from "@/lib/services/pricing-rules";
import { resolveBoothPrice } from "@/lib/pricing";
import { requestOrigin } from "@/lib/auth/session";
import { Portal } from "@/components/portal/portal";

export default async function ExhibitorPortalPage({ params, searchParams }: { params: Promise<{ token: string }>; searchParams: Promise<Record<string, string | undefined>> }) {
  const { token } = await params;
  const sp = await searchParams;
  const r = resolvePortal(token);
  if (!r) return (
    <main className="mx-auto max-w-md px-4 py-24 text-center">
      <h1 className="text-xl font-semibold">This link is no longer valid</h1>
      <p className="mt-2 text-sm text-gray-600">Ask the event organiser for a new exhibitor link.</p>
    </main>
  );
  const jar = await cookies();
  const { exhibitor, event } = r;
  expireOrders(event);
  const bundle = getViewerBundle(db(), event.id, false) ?? buildBundle(db(), event.id)!;
  const rules = listPricingRules(event.id);
  const availableBooths = bundle.booths.filter((b) => b.status === "available").map((b) => ({ id: b.id, label: b.label, levelId: b.levelId, levelName: bundle.levels.find((l) => l.id === b.levelId)?.shortName ?? "", areaM2: b.areaM2, widthM: b.widthM ?? null, heightM: b.heightM ?? null, boothType: b.boothType, price: resolveBoothPrice(b, rules, event.settings) })).sort((a, b) => a.label.localeCompare(b.label, undefined, { numeric: true }));
  const myBooths = bundle.booths.filter((b) => exhibitor.boothIds.includes(b.id)).map((b) => ({ id: b.id, label: b.label, levelName: bundle.levels.find((l) => l.id === b.levelId)?.name ?? "", areaM2: b.areaM2, status: b.status, price: resolveBoothPrice(b, rules, event.settings) }));
  const origin = await requestOrigin();
  return (
    <Portal
      token={token}
      needsCookie={jar.get(EXHIBITOR_COOKIE)?.value !== token}
      tab={sp.tab ?? "profile"}
      event={{ id: event.id, slug: event.slug, name: event.name, timezone: event.timezone, settings: event.settings, publicUrl: `${origin}/e/${event.slug}` }}
      exhibitor={exhibitor}
      categories={listCategories(event.id).map((c) => ({ id: c.id, name: c.name, color: c.color }))}
      myBooths={myBooths}
      availableBooths={availableBooths}
      extras={listExtras(event.id).filter((x) => x.reserveOrBuyAllowed).map((x) => ({ id: x.id, name: x.name, kind: x.kind, description: x.description, priceCents: x.priceCents, currency: x.currency, limitPerEvent: x.limitPerEvent, limitPerExhibitor: x.limitPerExhibitor, quantityUsed: x.quantityUsed }))}
      myExtras={listExhibitorExtras(event.id, exhibitor.id)}
      orders={listOrders(event.id, { exhibitorId: exhibitor.id })}
      analytics={exhibitorAnalytics(event.id, exhibitor.id)}
    />
  );
}

export const dynamic = "force-dynamic";


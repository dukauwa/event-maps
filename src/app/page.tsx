import Link from "next/link";
import type { Metadata } from "next";
import { BRAND } from "@/lib/brand";
import { SiteHeader, DEMO_SLUG } from "@/components/marketing/site-header";
import { SiteFooter } from "@/components/marketing/site-footer";
import { ImagePlaceholder } from "@/components/marketing/image-placeholder";

export const metadata: Metadata = { title: { absolute: `${BRAND.name} · Interactive floor plans for events` }, description: BRAND.description };

const Check = () => (
  <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className="mt-0.5 shrink-0 text-brand" aria-hidden><path d="m5 12.5 4.5 4.5L19 7.5" /></svg>
);

function Eyebrow({ children }: { children: React.ReactNode }) {
  return <p className="text-[13px] font-medium text-brand">{children}</p>;
}

function SectionHead({ eyebrow, title, body, center }: { eyebrow: string; title: React.ReactNode; body?: React.ReactNode; center?: boolean }) {
  return (
    <div className={center ? "mx-auto max-w-2xl text-center" : "max-w-2xl"}>
      <Eyebrow>{eyebrow}</Eyebrow>
      <h2 className="mt-3 text-[34px] font-semibold leading-[1.1] tracking-[-0.03em] text-gray-900 sm:text-[42px]">{title}</h2>
      {body && <p className="mt-4 text-[17px] leading-relaxed text-gray-500">{body}</p>}
    </div>
  );
}

const STEPS: { title: string; body: string }[] = [
  { title: "Find the venue", body: "Search the address and shape the hall outline on the map. Corners, walls and angles snap to the real building, so the plan sits where attendees will stand." },
  { title: "Drop in the existing plan", body: "Upload the PDF from the venue or your CAD export. Booth outlines, numbers and company names are read straight from the drawing into an editable first draft." },
  { title: "Publish and start selling", body: "Exhibitors pick and pay for stands on the booking map while attendees get search and directions. Every change goes live the moment you publish." },
];

const PLANS: { name: string; blurb: string; features: string[]; cta: string; featured?: boolean }[] = [
  { name: "Starter", blurb: "One event, one hall, everything to publish a plan.", features: ["Up to 150 booths", "PDF and image import", "Attendee map with search and directions", "Embed on your website"], cta: "Start with your plan" },
  { name: "Growth", blurb: "For organisers who sell space from the plan.", features: ["Up to 1,000 booths across levels", "Booth sales with holds, add-ons and invoices", "Exhibitor self-service portal", "Analytics and heatmaps", "Grip exhibitor sync"], cta: "Book a walkthrough", featured: true },
  { name: "Enterprise", blurb: "Venues and portfolios running many shows a year.", features: ["Unlimited booths and events", "REST API, webhooks and SDK", "ExpoFP-compatible endpoints", "SSO and priority support"], cta: "Talk to us" },
];

const FAQ: [string, string][] = [
  ["We already use ExpoFP. How hard is it to move?", "Export your plan as PDF and drop it into the event wizard: booths, numbers and exhibitor names come across as a first draft. The embed SDK and data.json use the same method names and shapes as ExpoFP, so most website integrations keep working with a new script URL."],
  ["Do we have to redraw our floor plans?", "No. Vector PDFs from CAD, the venue or ExpoFP are read directly, with exact booth shapes. Scanned plans go through image detection instead, and you tidy the result in the designer."],
  ["Can exhibitors book and pay for stands themselves?", "Yes. The booking map shows only what is for sale with prices and sizes. Exhibitors reserve or buy, add extras and sponsorships, and pay by card or invoice. Holds expire automatically."],
  ["Does the map work inside our event app?", "It embeds with one script tag or an iframe, and the JavaScript SDK lets your app select booths, draw routes and listen for clicks."],
  ["Where does our data live?", "In your own database. Plans export as JSON, GeoJSON and CSV, and every change is available through the API and signed webhooks."],
];

export default function Home() {
  return (
    <div className="flex flex-1 flex-col bg-white text-gray-900">
      <SiteHeader />
      <main className="flex-1">
        {/* Hero */}
        <section className="relative overflow-hidden">
          <div aria-hidden className="pointer-events-none absolute inset-x-0 top-0 h-[520px] bg-[radial-gradient(60%_60%_at_50%_0%,#eef2ff_0%,rgba(255,255,255,0)_70%)]" />
          <div className="relative mx-auto max-w-[1160px] px-5 pb-10 pt-20 text-center sm:px-8 sm:pt-28">
            <Link href="/admin/events/new" className="inline-flex items-center gap-2 rounded-full border border-border bg-white py-1 pl-1 pr-3 text-[13px] text-gray-600 shadow-[var(--shadow-card)] hover:border-border-strong">
              <span className="rounded-full bg-brand-soft px-2 py-0.5 text-xs font-medium text-[#1f3bb3]">New</span>
              Import booths straight from your PDF plan
              <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" aria-hidden><path d="m9 6 6 6-6 6" /></svg>
            </Link>
            <h1 className="mx-auto mt-7 max-w-4xl text-[44px] font-semibold leading-[1.02] tracking-[-0.045em] sm:text-[68px]">The floor plan your whole event runs on</h1>
            <p className="mx-auto mt-6 max-w-2xl text-lg leading-relaxed text-gray-500 sm:text-xl">
              Import the hall from your existing PDF, sell booths straight from the map and guide attendees to every stand. {BRAND.name} embeds anywhere and speaks the ExpoFP API.
            </p>
            <div className="mt-9 flex flex-wrap items-center justify-center gap-3">
              <Link href="/admin/events/new" className="inline-flex h-11 items-center rounded-lg bg-primary px-5 text-[15px] font-medium text-white shadow-[inset_0_1px_0_rgba(255,255,255,0.12)] hover:bg-gray-800">Start with your floor plan</Link>
              <a href={`/e/${DEMO_SLUG}`} className="inline-flex h-11 items-center gap-2 rounded-lg border border-border bg-white px-5 text-[15px] font-medium text-gray-900 shadow-[var(--shadow-card)] hover:border-border-strong hover:bg-gray-50">
                Explore the live demo
                <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" aria-hidden><path d="M5 12h14M13 6l6 6-6 6" /></svg>
              </a>
            </div>
            <p className="mt-4 text-[13px] text-gray-500">No card needed · Works with your current ExpoFP embeds</p>
          </div>
          <div className="relative mx-auto max-w-[1160px] px-5 pb-20 sm:px-8">
            <div className="rounded-2xl border border-border bg-white p-2 shadow-[0_24px_64px_-24px_rgba(16,19,27,0.25)]">
              <div className="flex items-center gap-1.5 px-3 pb-2 pt-1" aria-hidden>
                <span className="size-2.5 rounded-full bg-gray-200" /><span className="size-2.5 rounded-full bg-gray-200" /><span className="size-2.5 rounded-full bg-gray-200" />
                <span className="ml-3 h-5 flex-1 rounded-md bg-gray-50" />
              </div>
              <ImagePlaceholder label="Product screenshot: organiser designer with an imported hall plan" size="2320 × 1450" ratio="16 / 10" />
            </div>
          </div>
        </section>

        {/* Logos */}
        <section aria-labelledby="logos" className="border-y border-gray-100 bg-subtle">
          <div className="mx-auto max-w-[1160px] px-5 py-10 sm:px-8">
            <p id="logos" className="text-center text-[13px] text-gray-500">Floor plans for shows and venues like</p>
            <div className="mt-6 grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-6">
              {Array.from({ length: 6 }, (_, i) => (
                <div key={i} role="img" aria-label="Customer logo placeholder" className="grid h-12 place-items-center rounded-lg bg-gray-100 text-xs font-medium text-gray-500">Logo</div>
              ))}
            </div>
          </div>
        </section>

        {/* Product bento */}
        <section id="product" className="scroll-mt-20">
          <div className="mx-auto max-w-[1160px] px-5 py-24 sm:px-8 sm:py-28">
            <SectionHead eyebrow="Product" title="Everything the show floor needs, on one plan" body="One source of truth for the hall: the designer, the sales map, the attendee app and your website all read the same published plan." />
            <div className="mt-14 grid gap-4 md:grid-cols-6">
              <article className="flex flex-col rounded-2xl border border-border bg-white p-6 shadow-[var(--shadow-card)] md:col-span-4">
                <h3 className="text-lg font-semibold tracking-tight">Start from the plan you already have</h3>
                <p className="mt-2 max-w-md text-[15px] leading-relaxed text-gray-500">Vector PDFs, CAD exports and ExpoFP plans become editable booths with their numbers and exhibitors. Scans are traced from the image.</p>
                <ImagePlaceholder className="mt-6" label="Import step: PDF plan with detected booths highlighted" size="1440 × 800" ratio="16 / 9" />
              </article>
              <article className="flex flex-col rounded-2xl border border-border bg-white p-6 shadow-[var(--shadow-card)] md:col-span-2">
                <h3 className="text-lg font-semibold tracking-tight">Placed on the real building</h3>
                <p className="mt-2 text-[15px] leading-relaxed text-gray-500">Shape the hall outline on a street or satellite map. GPS and directions line up with the venue.</p>
                <ImagePlaceholder className="mt-6" label="Venue step: hall outline on satellite imagery" size="720 × 800" ratio="9 / 10" />
              </article>
              <article id="wayfinding" className="flex scroll-mt-24 flex-col rounded-2xl border border-border bg-white p-6 shadow-[var(--shadow-card)] md:col-span-2">
                <h3 className="text-lg font-semibold tracking-tight">Directions across halls and floors</h3>
                <p className="mt-2 text-[15px] leading-relaxed text-gray-500">Step-free routes, lifts and escalators, and a best-order route through every stand on an attendee&apos;s list.</p>
                <ImagePlaceholder className="mt-6" label="Attendee map on a phone with a route" size="720 × 800" ratio="9 / 10" />
              </article>
              <article className="flex flex-col rounded-2xl border border-border bg-white p-6 shadow-[var(--shadow-card)] md:col-span-4">
                <h3 className="text-lg font-semibold tracking-tight">A designer built for halls</h3>
                <p className="mt-2 max-w-md text-[15px] leading-relaxed text-gray-500">Draw in metres, drop rows of booths in one drag, merge and split stands, and preview exactly what attendees and exhibitors will see before you publish.</p>
                <ImagePlaceholder className="mt-6" label="Designer: booth rows, layers panel and properties" size="1440 × 800" ratio="16 / 9" />
              </article>
            </div>
          </div>
        </section>

        {/* Booth sales */}
        <section id="sales" className="scroll-mt-20 border-t border-gray-100 bg-subtle">
          <div className="mx-auto grid max-w-[1160px] items-center gap-12 px-5 py-24 sm:px-8 sm:py-28 lg:grid-cols-2">
            <div>
              <SectionHead eyebrow="Booth sales" title="Let exhibitors pick their stand and pay for it" body="Exhibitors get their own booking map with open stands, sizes and prices. Attendees never see it: their map stays about finding people." />
              <ul className="mt-8 space-y-3 text-[15px] text-gray-700">
                {["Reserve, buy online or request a quote, per event", "Pricing by booth type, size and level, with holds that expire on their own", "Extras and sponsorship packages at checkout, paid by card or invoice", "A self-service portal for profiles, logos, orders and lead analytics"].map((t) => (
                  <li key={t} className="flex gap-3"><Check />{t}</li>
                ))}
              </ul>
              <div className="mt-8 flex flex-wrap gap-3">
                <a href={`/e/${DEMO_SLUG}/book`} className="inline-flex h-10 items-center rounded-lg bg-primary px-4 text-sm font-medium text-white hover:bg-gray-800">Open the booking map</a>
                <a href={`/e/${DEMO_SLUG}`} className="inline-flex h-10 items-center rounded-lg border border-border bg-white px-4 text-sm font-medium text-gray-900 hover:bg-gray-50">See the attendee view</a>
              </div>
            </div>
            <div className="rounded-2xl border border-border bg-white p-2 shadow-[var(--shadow-card)]">
              <ImagePlaceholder label="Booking map: stands for sale with prices" size="1200 × 960" ratio="5 / 4" />
            </div>
          </div>
        </section>

        {/* How it works */}
        <section aria-labelledby="how" className="border-t border-gray-100">
          <div className="mx-auto max-w-[1160px] px-5 py-24 sm:px-8 sm:py-28">
            <SectionHead eyebrow="How it works" title={<span id="how">From venue address to a sellable map in an afternoon</span>} />
            <ol className="mt-14 grid gap-4 md:grid-cols-3">
              {STEPS.map((s, i) => (
                <li key={s.title} className="rounded-2xl border border-border bg-white p-6 shadow-[var(--shadow-card)]">
                  <span className="grid size-8 place-items-center rounded-lg border border-border bg-subtle font-mono text-[13px] font-medium text-gray-700">{i + 1}</span>
                  <h3 className="mt-5 text-[17px] font-semibold tracking-tight">{s.title}</h3>
                  <p className="mt-2 text-[15px] leading-relaxed text-gray-500">{s.body}</p>
                </li>
              ))}
            </ol>
          </div>
        </section>

        {/* Developers */}
        <section id="developers" className="scroll-mt-20 border-t border-gray-100">
          <div className="mx-auto grid max-w-[1160px] items-start gap-12 px-5 py-24 sm:px-8 sm:py-28 lg:grid-cols-[1fr_1.1fr]">
            <div>
              <SectionHead eyebrow="Developers" title="One script tag, or the whole API" body="Put the live map on your website or inside your event app. The SDK keeps ExpoFP's method and event names, so switching is mostly a new URL." />
              <dl className="mt-8 grid gap-6 sm:grid-cols-2">
                {[["REST API", "Events, booths, exhibitors, orders and sessions, with OpenAPI."], ["Webhooks", "Signed deliveries with retries whenever the plan or a sale changes."], ["ExpoFP-compatible", "data.json, the FloorPlan API and the JSON actions you already call."], ["Exports", "JSON bundle, GeoJSON, CSV and an offline package."]].map(([t, d]) => (
                  <div key={t}><dt className="text-[15px] font-medium text-gray-900">{t}</dt><dd className="mt-1 text-sm leading-relaxed text-gray-500">{d}</dd></div>
                ))}
              </dl>
              <Link href="/docs" className="mt-8 inline-flex items-center gap-1.5 text-sm font-medium text-brand hover:underline">Read the documentation <span aria-hidden>→</span></Link>
            </div>
            <div className="overflow-hidden rounded-2xl border border-border bg-gray-900 shadow-[0_24px_64px_-24px_rgba(16,19,27,0.35)]">
              <div className="flex items-center justify-between border-b border-white/10 px-4 py-2.5">
                <span className="font-mono text-xs text-gray-400">index.html</span>
                <span className="rounded-md bg-white/10 px-2 py-0.5 font-mono text-[11px] text-gray-300">embed</span>
              </div>
              <pre className="overflow-x-auto p-5 font-mono text-[13px] leading-6 text-gray-200"><code>{`<div id="floorplan" style="height:640px"></div>
<script src="https://your-host/sdk/tessera.js"></script>
<script>
  const fp = new Tessera.FloorPlan({
    element: "#floorplan",
    eventId: "grip-connect-2026",
    onBoothClick: ({ booth }) => console.log(booth.label),
  });

  await fp.ready;
  fp.selectRoute("A101", "T05", { accessible: true });
</script>`}</code></pre>
            </div>
          </div>
        </section>

        {/* Pricing */}
        <section id="pricing" className="scroll-mt-20 border-t border-gray-100 bg-subtle">
          <div className="mx-auto max-w-[1160px] px-5 py-24 sm:px-8 sm:py-28">
            <SectionHead center eyebrow="Pricing" title="Plans that grow with your floor" body="Every plan includes the designer, PDF import and the attendee map. Prices are per event." />
            <div className="mt-14 grid gap-4 lg:grid-cols-3">
              {PLANS.map((p) => (
                <article key={p.name} className={p.featured ? "relative flex flex-col rounded-2xl border border-gray-900 bg-white p-7 shadow-[0_24px_64px_-28px_rgba(16,19,27,0.35)]" : "flex flex-col rounded-2xl border border-border bg-white p-7 shadow-[var(--shadow-card)]"}>
                  {p.featured && <span className="absolute -top-3 left-7 rounded-full bg-gray-900 px-2.5 py-1 text-xs font-medium text-white">Most chosen</span>}
                  <h3 className="text-lg font-semibold tracking-tight">{p.name}</h3>
                  <p className="mt-1.5 text-sm leading-relaxed text-gray-500">{p.blurb}</p>
                  {/* Price not set yet: a visible placeholder like the image boxes, to fill in before launch. */}
                  <div className="mt-6 flex items-baseline gap-2">
                    <span role="img" aria-label="Price placeholder" className="inline-grid h-10 w-28 place-items-center rounded-lg bg-gray-100 text-xs font-medium text-gray-500">Price</span>
                    <span className="text-sm text-gray-500">/ event</span>
                  </div>
                  <ul className="mt-6 flex-1 space-y-2.5 text-sm text-gray-700">
                    {p.features.map((f) => <li key={f} className="flex gap-2.5"><Check />{f}</li>)}
                  </ul>
                  <Link href={p.featured ? "/login" : "/admin/events/new"} className={p.featured ? "mt-8 inline-flex h-10 items-center justify-center rounded-lg bg-primary text-sm font-medium text-white hover:bg-gray-800" : "mt-8 inline-flex h-10 items-center justify-center rounded-lg border border-border bg-white text-sm font-medium text-gray-900 hover:bg-gray-50"}>{p.cta}</Link>
                </article>
              ))}
            </div>
          </div>
        </section>

        {/* FAQ */}
        <section aria-labelledby="faq" className="border-t border-gray-100">
          <div className="mx-auto grid max-w-[1160px] gap-12 px-5 py-24 sm:px-8 sm:py-28 lg:grid-cols-[1fr_1.4fr]">
            <SectionHead eyebrow="FAQ" title={<span id="faq">Questions organisers ask first</span>} body={<>Something else? <a className="font-medium text-brand hover:underline" href={`mailto:${BRAND.supportEmail}`}>Email the team</a>.</>} />
            <div className="divide-y divide-border border-y border-border">
              {FAQ.map(([q, a]) => (
                <details key={q} className="group py-5">
                  <summary className="flex cursor-pointer list-none items-center justify-between gap-6 text-[16px] font-medium text-gray-900 [&::-webkit-details-marker]:hidden">
                    {q}
                    <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.75" strokeLinecap="round" className="shrink-0 text-gray-500 transition-transform group-open:rotate-45" aria-hidden><path d="M12 5v14M5 12h14" /></svg>
                  </summary>
                  <p className="mt-3 max-w-2xl text-[15px] leading-relaxed text-gray-500">{a}</p>
                </details>
              ))}
            </div>
          </div>
        </section>

        {/* Closing CTA */}
        <section className="px-5 pb-24 sm:px-8">
          <div className="mx-auto max-w-[1160px] overflow-hidden rounded-3xl border border-border bg-subtle px-6 py-16 text-center sm:px-12">
            <h2 className="mx-auto max-w-2xl text-[34px] font-semibold leading-[1.1] tracking-[-0.03em] sm:text-[42px]">Bring your next show&apos;s floor plan</h2>
            <p className="mx-auto mt-4 max-w-xl text-[17px] leading-relaxed text-gray-500">Upload the PDF you have today. You will be editing booths in a few minutes.</p>
            <div className="mt-8 flex flex-wrap justify-center gap-3">
              <Link href="/admin/events/new" className="inline-flex h-11 items-center rounded-lg bg-primary px-5 text-[15px] font-medium text-white hover:bg-gray-800">Start with your floor plan</Link>
              <a href={`mailto:${BRAND.supportEmail}`} className="inline-flex h-11 items-center rounded-lg border border-border bg-white px-5 text-[15px] font-medium text-gray-900 hover:bg-gray-50">Book a walkthrough</a>
            </div>
          </div>
        </section>
      </main>
      <SiteFooter />
    </div>
  );
}

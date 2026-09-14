import Link from "next/link";
import { BRAND } from "@/lib/brand";

const NAV = [["/docs", "Overview"], ["/docs/embed", "Embed SDK"], ["/docs/api", "REST API"], ["/docs/webhooks", "Webhooks"], ["/docs/data", "Data formats"], ["/docs/migrate", "Migrating from ExpoFP"]];

export default function DocsLayout({ children }: { children: React.ReactNode }) {
  return (
    <div className="min-h-dvh bg-background">
      <header className="border-b border-border bg-surface">
        <div className="mx-auto flex max-w-6xl items-center justify-between px-4 py-3">
          <Link href="/" className="font-semibold">{BRAND.name} <span className="font-normal text-gray-500">Developers</span></Link>
          <nav className="flex gap-4 text-sm"><Link href="/e/grip-connect-2026" className="text-gray-600 hover:text-gray-900">Demo</Link><Link href="/admin" className="text-gray-600 hover:text-gray-900">Organiser portal</Link><a href="/api/v1/openapi.json" className="text-gray-600 hover:text-gray-900">openapi.json</a></nav>
        </div>
      </header>
      <div className="mx-auto grid max-w-6xl gap-8 px-4 py-8 md:grid-cols-[220px_minmax(0,1fr)]">
        <aside className="md:sticky md:top-6 md:self-start"><nav className="flex flex-row flex-wrap gap-1 md:flex-col">{NAV.map(([href, label]) => <Link key={href} href={href} className="rounded-lg px-3 py-1.5 text-sm text-gray-700 hover:bg-gray-100">{label}</Link>)}</nav></aside>
        <main className="prose-docs min-w-0">{children}</main>
      </div>
    </div>
  );
}

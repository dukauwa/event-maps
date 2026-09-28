import Link from "next/link";
import { BRAND } from "@/lib/brand";
import { LogoMark } from "@/components/admin/icons";

const NAV: [string, string][] = [["/#product", "Product"], ["/#sales", "Booth sales"], ["/#developers", "Developers"], ["/#pricing", "Pricing"], ["/docs", "Docs"]];
export const DEMO_SLUG = "grip-connect-2026";

export function SiteHeader() {
  return (
    <header className="sticky top-0 z-40 border-b border-gray-100 bg-white/80 backdrop-blur-md supports-[backdrop-filter]:bg-white/70">
      <div className="mx-auto flex h-16 max-w-[1160px] items-center gap-8 px-5 sm:px-8">
        <Link href="/" className="flex items-center gap-2.5" aria-label={`${BRAND.name} home`}>
          <LogoMark size={24} />
          <span className="text-[15px] font-semibold tracking-tight text-gray-900">{BRAND.name}</span>
        </Link>
        <nav className="hidden flex-1 items-center gap-1 md:flex" aria-label="Main">
          {NAV.map(([href, label]) => <Link key={href} href={href} className="rounded-lg px-3 py-1.5 text-sm text-gray-600 transition-colors hover:text-gray-900">{label}</Link>)}
        </nav>
        <div className="ml-auto hidden items-center gap-2 md:flex">
          <Link href="/login" className="rounded-lg px-3 py-1.5 text-sm font-medium text-gray-700 hover:text-gray-900">Sign in</Link>
          <a href={`/e/${DEMO_SLUG}`} className="inline-flex h-9 items-center rounded-lg bg-primary px-4 text-sm font-medium text-white shadow-[inset_0_1px_0_rgba(255,255,255,0.12)] hover:bg-gray-800">Try the live demo</a>
        </div>
        <details className="group relative ml-auto md:hidden">
          <summary className="grid size-9 cursor-pointer list-none place-items-center rounded-lg border border-border text-gray-700 [&::-webkit-details-marker]:hidden" aria-label="Menu">
            <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.75" strokeLinecap="round" aria-hidden><path d="M4 7h16M4 12h16M4 17h16" /></svg>
          </summary>
          <div className="absolute right-0 top-11 w-60 rounded-xl border border-border bg-white p-2 shadow-[var(--shadow-pop)]">
            {NAV.map(([href, label]) => <Link key={href} href={href} className="block rounded-lg px-3 py-2 text-sm text-gray-700 hover:bg-gray-50">{label}</Link>)}
            <div className="my-2 h-px bg-border" />
            <Link href="/login" className="block rounded-lg px-3 py-2 text-sm text-gray-700 hover:bg-gray-50">Sign in</Link>
            <a href={`/e/${DEMO_SLUG}`} className="mt-1 block rounded-lg bg-primary px-3 py-2 text-center text-sm font-medium text-white">Try the live demo</a>
          </div>
        </details>
      </div>
    </header>
  );
}

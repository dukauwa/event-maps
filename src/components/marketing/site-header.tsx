import Link from "next/link";
import { BRAND } from "@/lib/brand";
import { LogoMark } from "@/components/admin/icons";
import { MobileMenu } from "./mobile-menu";

const NAV: [string, string][] = [
  ["/#product", "Product"],
  ["/#sales", "Booth sales"],
  ["/#developers", "Developers"],
  ["/#pricing", "Pricing"],
  ["/docs", "Docs"],
];
export const DEMO_SLUG = "grip-connect-2026";

export function SiteHeader() {
  return (
    <header className="sticky top-0 z-40 border-b border-gray-100 bg-white/80 backdrop-blur-md supports-[backdrop-filter]:bg-white/70">
      <div className="mx-auto flex h-16 max-w-[1160px] items-center gap-8 px-5 sm:px-8">
        <Link
          href="/"
          className="flex items-center gap-2.5"
          aria-label={`${BRAND.name} home`}
        >
          <LogoMark size={24} />
          <span className="text-[15px] font-semibold tracking-tight text-gray-900">
            {BRAND.name}
          </span>
        </Link>
        <nav
          className="hidden flex-1 items-center gap-1 md:flex"
          aria-label="Main"
        >
          {NAV.map(([href, label]) => (
            <Link
              key={href}
              href={href}
              className="rounded-lg px-3 py-1.5 text-sm text-gray-600 transition-colors hover:text-gray-900"
            >
              {label}
            </Link>
          ))}
        </nav>
        <div className="ml-auto hidden items-center gap-2 md:flex">
          <Link
            href="/login"
            className="rounded-lg px-3 py-1.5 text-sm font-medium text-gray-700 hover:text-gray-900"
          >
            Sign in
          </Link>
          <a
            href={`/e/${DEMO_SLUG}`}
            className="inline-flex h-9 items-center rounded-lg bg-primary px-4 text-sm font-medium text-white shadow-[inset_0_1px_0_rgba(255,255,255,0.12)] hover:bg-gray-800"
          >
            Try the live demo
          </a>
        </div>
        <MobileMenu>
          {NAV.map(([href, label]) => (
            <Link
              key={href}
              href={href}
              className="block rounded-lg px-3 py-2 text-sm text-gray-700 hover:bg-gray-50"
            >
              {label}
            </Link>
          ))}
          <div className="my-2 h-px bg-border" />
          <Link
            href="/login"
            className="block rounded-lg px-3 py-2 text-sm text-gray-700 hover:bg-gray-50"
          >
            Sign in
          </Link>
          <a
            href={`/e/${DEMO_SLUG}`}
            className="mt-1 block rounded-lg bg-primary px-3 py-2 text-center text-sm font-medium text-white"
          >
            Try the live demo
          </a>
        </MobileMenu>
      </div>
    </header>
  );
}

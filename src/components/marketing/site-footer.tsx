import Link from "next/link";
import { BRAND } from "@/lib/brand";
import { LogoMark } from "@/components/admin/icons";
import { DEMO_SLUG } from "./site-header";

const COLUMNS: { title: string; links: [string, string][] }[] = [
  { title: "Product", links: [["/#product", "Floor plan designer"], ["/#sales", "Booth sales"], ["/#wayfinding", "Wayfinding"], [`/e/${DEMO_SLUG}`, "Live demo"]] },
  { title: "Developers", links: [["/docs", "Documentation"], ["/docs/embed", "Embed SDK"], ["/docs/api", "REST API"], ["/docs/migrate", "Migrating from ExpoFP"]] },
  { title: "Company", links: [["https://grip.events", BRAND.company], [`mailto:${BRAND.supportEmail}`, "Support"], ["/login", "Sign in"]] },
];

export function SiteFooter() {
  return (
    <footer className="border-t border-border bg-white">
      <div className="mx-auto grid max-w-[1160px] gap-10 px-5 py-14 sm:px-8 md:grid-cols-[1.4fr_repeat(3,1fr)]">
        <div>
          <Link href="/" className="flex items-center gap-2.5"><LogoMark size={22} /><span className="text-[15px] font-semibold tracking-tight">{BRAND.name}</span></Link>
          <p className="mt-3 max-w-xs text-sm leading-relaxed text-gray-500">Interactive floor plans, booth sales and wayfinding for exhibitions and conferences. Built by {BRAND.company}.</p>
        </div>
        {COLUMNS.map((c) => (
          <div key={c.title}>
            <p className="text-[13px] font-medium text-gray-900">{c.title}</p>
            <ul className="mt-3 space-y-2">
              {c.links.map(([href, label]) => <li key={label}><a href={href} className="text-sm text-gray-500 hover:text-gray-900">{label}</a></li>)}
            </ul>
          </div>
        ))}
      </div>
      <div className="border-t border-border">
        <div className="mx-auto flex max-w-[1160px] flex-wrap items-center justify-between gap-2 px-5 py-6 text-[13px] text-gray-500 sm:px-8">
          <span>© {new Date().getFullYear()} {BRAND.company}. All rights reserved.</span>
          <span>ExpoFP is a trademark of its owner; {BRAND.name} offers a compatible API.</span>
        </div>
      </div>
    </footer>
  );
}

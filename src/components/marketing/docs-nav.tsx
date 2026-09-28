"use client";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { cn } from "@/components/ui";

const NAV: [string, string][] = [["/docs", "Overview"], ["/docs/embed", "Embed SDK"], ["/docs/api", "REST API"], ["/docs/webhooks", "Webhooks"], ["/docs/data", "Data formats"], ["/docs/migrate", "Migrating from ExpoFP"]];

export function DocsNav() {
  const pathname = usePathname();
  return (
    <nav className="flex flex-row flex-wrap gap-1 md:flex-col" aria-label="Documentation">
      <p className="mb-1 hidden px-3 text-xs font-medium text-gray-500 md:block">Guides</p>
      {NAV.map(([href, label]) => {
        const active = pathname === href;
        return (
          <Link key={href} href={href} aria-current={active ? "page" : undefined}
            className={cn("rounded-lg px-3 py-1.5 text-sm transition-colors", active ? "bg-gray-100 font-medium text-gray-900" : "text-gray-600 hover:bg-gray-50 hover:text-gray-900")}>
            {label}
          </Link>
        );
      })}
      <a href="/api/v1/openapi.json" className="rounded-lg px-3 py-1.5 font-mono text-[13px] text-gray-600 hover:bg-gray-50 hover:text-gray-900 md:mt-3">openapi.json</a>
    </nav>
  );
}

import { SiteHeader } from "@/components/marketing/site-header";
import { SiteFooter } from "@/components/marketing/site-footer";
import { DocsNav } from "@/components/marketing/docs-nav";

export default function DocsLayout({ children }: { children: React.ReactNode }) {
  return (
    <div className="min-h-dvh bg-background">
      <SiteHeader />
      <div className="mx-auto grid max-w-[1160px] gap-10 px-5 py-10 sm:px-8 md:grid-cols-[200px_minmax(0,1fr)] md:py-14">
        <aside className="md:sticky md:top-24 md:self-start"><DocsNav /></aside>
        <main className="prose-docs min-w-0 pb-16">{children}</main>
      </div>
      <SiteFooter />
    </div>
  );
}

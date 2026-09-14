import Link from "next/link";
import { redirect } from "next/navigation";
import type { Metadata } from "next";
import { BRAND } from "@/lib/brand";
import { currentUser } from "@/lib/auth/session";
import { DEMO } from "@/lib/seed/demo";
import { LoginForm } from "@/components/admin/login-form";

export const metadata: Metadata = { title: "Sign in" };
export const dynamic = "force-dynamic";

export default async function LoginPage({ searchParams }: { searchParams: Promise<{ next?: string | string[] }> }) {
  const sp = await searchParams;
  const nextRaw = Array.isArray(sp.next) ? sp.next[0] : sp.next;
  const next = nextRaw && nextRaw.startsWith("/") && !nextRaw.startsWith("//") ? nextRaw : "/admin";
  if (await currentUser()) redirect(next);
  const showDemo = process.env.NODE_ENV !== "production" || process.env.SHOW_DEMO_LOGIN === "1";
  return (
    <div className="flex flex-1 items-center justify-center bg-background px-4 py-12">
      <div className="w-full max-w-sm">
        <Link href="/" className="mb-6 flex items-center justify-center gap-2">
          <span className="grid size-9 place-items-center rounded-xl bg-primary text-base font-bold text-white">{BRAND.name[0]}</span>
          <span className="text-xl font-semibold tracking-tight">{BRAND.name}</span>
        </Link>
        <div className="rounded-2xl border border-border bg-surface p-6 shadow-sm">
          <h1 className="text-lg font-semibold">Organiser sign in</h1>
          <p className="mb-5 mt-1 text-sm text-gray-500">Manage floor plans, booths, exhibitors and sales.</p>
          <LoginForm next={next} demo={showDemo ? { email: DEMO.adminEmail, password: DEMO.adminPassword } : undefined} />
        </div>
        <p className="mt-6 text-center text-xs text-gray-500">
          Exhibitor? Use the magic link your organiser sent you. · <a className="hover:text-gray-900" href={`mailto:${BRAND.supportEmail}`}>Support</a>
        </p>
      </div>
    </div>
  );
}

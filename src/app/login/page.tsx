import Link from "next/link";
import { redirect } from "next/navigation";
import type { Metadata } from "next";
import { BRAND } from "@/lib/brand";
import { currentUser } from "@/lib/auth/session";
import { DEMO } from "@/lib/seed/demo";
import { LoginForm } from "@/components/admin/login-form";
import { LogoMark } from "@/components/admin/icons";
import { ImagePlaceholder } from "@/components/marketing/image-placeholder";

export const metadata: Metadata = { title: "Sign in" };
export const dynamic = "force-dynamic";

export default async function LoginPage({ searchParams }: { searchParams: Promise<{ next?: string | string[] }> }) {
  const sp = await searchParams;
  const nextRaw = Array.isArray(sp.next) ? sp.next[0] : sp.next;
  const next = nextRaw && nextRaw.startsWith("/") && !nextRaw.startsWith("//") ? nextRaw : "/admin";
  if (await currentUser()) redirect(next);
  const showDemo = process.env.NODE_ENV !== "production" || process.env.SHOW_DEMO_LOGIN === "1";
  return (
    <div className="grid min-h-screen flex-1 bg-background lg:grid-cols-[minmax(0,1fr)_minmax(0,1.1fr)]">
      <div className="flex flex-col px-6 py-8 sm:px-12">
        <Link href="/" className="flex w-fit items-center gap-2.5">
          <LogoMark size={28} />
          <span className="text-[15px] font-semibold tracking-tight text-gray-900">{BRAND.name}</span>
        </Link>
        <div className="mx-auto flex w-full max-w-[360px] flex-1 flex-col justify-center py-12">
          <h1 className="text-[28px] font-semibold tracking-[-0.02em] text-gray-900">Welcome back</h1>
          <p className="mb-8 mt-2 text-[15px] leading-relaxed text-gray-600">Sign in to manage floor plans, booths, exhibitors and sales.</p>
          <LoginForm next={next} demo={showDemo ? { email: DEMO.adminEmail, password: DEMO.adminPassword } : undefined} />
          <p className="mt-8 text-sm text-gray-600">
            Exhibitor? Use the magic link your organiser sent you, or <a className="font-medium text-gray-900 underline decoration-gray-300 underline-offset-4 hover:decoration-gray-900" href={`mailto:${BRAND.supportEmail}`}>contact support</a>.
          </p>
        </div>
        <p className="text-xs text-gray-500">© {new Date().getFullYear()} {BRAND.name}</p>
      </div>
      <div className="hidden border-l border-border bg-subtle p-10 lg:flex lg:flex-col lg:justify-center">
        <div className="mx-auto w-full max-w-[560px]">
          <p className="text-sm font-medium text-brand">Organiser portal</p>
          <p className="mt-3 text-2xl font-semibold leading-snug tracking-[-0.02em] text-gray-900">Design the hall, sell the booths and guide every attendee from one floor plan.</p>
          <ImagePlaceholder className="mt-8" label="Product screenshot: organiser dashboard" size="1120 × 800" ratio="7 / 5" />
        </div>
      </div>
    </div>
  );
}

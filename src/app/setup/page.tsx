import type { Metadata } from "next";
import Link from "next/link";
import { BRAND } from "@/lib/brand";
import { databaseMissing } from "@/lib/db/config";
import { LogoMark } from "@/components/admin/icons";

export const dynamic = "force-dynamic";
export const metadata: Metadata = { title: `Connect a database · ${BRAND.name}`, robots: { index: false } };

/** Shown (via the proxy) on serverless deployments that have no hosted database yet. */
export default function SetupPage() {
  const missing = databaseMissing();
  return (
    <main className="mx-auto max-w-xl px-5 py-20">
      <p className="flex items-center gap-2.5 text-[15px] font-semibold tracking-tight text-gray-900"><LogoMark size={24} />{BRAND.name}</p>
      {missing ? (
        <>
          <h1 className="mt-10 text-[28px] font-semibold leading-tight tracking-[-0.02em] text-gray-900">Connect a database to finish setup</h1>
          <p className="mt-3 text-[15px] leading-relaxed text-gray-600">This deployment runs every page and API route as its own serverless function, so it needs one shared database. Without it, an event you create would be missing on the next page.</p>
          <ol className="mt-8 list-decimal space-y-3 rounded-xl border border-border bg-subtle py-5 pl-10 pr-5 text-[15px] text-gray-800 marker:text-gray-500">
            <li>In Vercel, open this project and go to <strong>Storage</strong>.</li>
            <li>Choose <strong>Create Database</strong> → <strong>Turso</strong> (free tier), and connect it to this project for all environments.</li>
            <li><strong>Redeploy</strong> the latest deployment. The demo event and organiser login are created on the first visit.</li>
          </ol>
          <p className="mt-6 text-sm text-gray-500">Using Turso directly? Set <code className="rounded-md border border-border bg-subtle px-1.5 font-mono text-[0.85em]">TURSO_DATABASE_URL</code> and <code className="rounded-md border border-border bg-subtle px-1.5 font-mono text-[0.85em]">TURSO_AUTH_TOKEN</code> in the project&apos;s environment variables instead.</p>
        </>
      ) : (
        <>
          <h1 className="mt-10 text-[28px] font-semibold leading-tight tracking-[-0.02em] text-gray-900">The database is connected</h1>
          <p className="mt-3 text-[15px] leading-relaxed text-gray-600">You&apos;re all set.</p>
          <p className="mt-6"><Link href="/admin" className="font-medium text-brand underline underline-offset-4">Go to the organiser portal</Link></p>
        </>
      )}
    </main>
  );
}

import type { Metadata } from "next";
import Link from "next/link";
import { BRAND } from "@/lib/brand";
import { databaseMissing } from "@/lib/db/config";

export const dynamic = "force-dynamic";
export const metadata: Metadata = { title: `Connect a database · ${BRAND.name}`, robots: { index: false } };

/** Shown (via the proxy) on serverless deployments that have no hosted database yet. */
export default function SetupPage() {
  const missing = databaseMissing();
  return (
    <main className="mx-auto max-w-xl px-4 py-16">
      <p className="text-sm font-semibold text-primary">{BRAND.name}</p>
      {missing ? (
        <>
          <h1 className="mt-2 text-2xl font-semibold">Connect a database to finish setup</h1>
          <p className="mt-3 text-gray-700">This deployment runs every page and API route as its own serverless function, so it needs one shared database. Without it, an event you create would be missing on the next page.</p>
          <ol className="mt-6 list-decimal space-y-3 pl-5 text-gray-800">
            <li>In Vercel, open this project and go to <strong>Storage</strong>.</li>
            <li>Choose <strong>Create Database</strong> → <strong>Turso</strong> (free tier), and connect it to this project for all environments.</li>
            <li><strong>Redeploy</strong> the latest deployment. The demo event and organiser login are created on the first visit.</li>
          </ol>
          <p className="mt-6 text-sm text-gray-500">Using Turso directly? Set <code className="rounded bg-gray-100 px-1">TURSO_DATABASE_URL</code> and <code className="rounded bg-gray-100 px-1">TURSO_AUTH_TOKEN</code> in the project&apos;s environment variables instead.</p>
        </>
      ) : (
        <>
          <h1 className="mt-2 text-2xl font-semibold">The database is connected</h1>
          <p className="mt-3 text-gray-700">You&apos;re all set.</p>
          <p className="mt-6"><Link href="/admin" className="font-medium text-primary underline">Go to the organiser portal</Link></p>
        </>
      )}
    </main>
  );
}

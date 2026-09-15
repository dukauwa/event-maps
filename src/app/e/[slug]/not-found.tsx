import Link from "next/link";
import { BRAND } from "@/lib/brand";

export default function ViewerNotFound() {
  return (
    <main className="flex-1 flex flex-col items-center justify-center gap-3 p-8 text-center">
      <p className="text-6xl" aria-hidden="true">🗺️</p>
      <h1 className="text-2xl font-semibold m-0">This floor plan is not available</h1>
      <p className="text-gray-500 m-0 max-w-md">The event does not exist, has not been published yet, or the link is wrong. Ask the organiser for the current link.</p>
      <Link href="/" className="mt-2 text-sm underline">{BRAND.name}</Link>
    </main>
  );
}

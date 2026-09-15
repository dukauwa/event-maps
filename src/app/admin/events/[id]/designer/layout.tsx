import type { Metadata } from "next";

export const metadata: Metadata = { title: "Designer" };

/**
 * The designer takes over the whole viewport. The parent admin layout still renders its sidebar
 * shell (and the shared Toaster at z-60) underneath; this fixed, high-z container covers it.
 */
export default function DesignerLayout({ children }: { children: React.ReactNode }) {
  return <div className="fixed inset-0 z-40 overflow-hidden bg-gray-50">{children}</div>;
}

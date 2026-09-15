import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { db } from "@/lib/db";
import { findEventBySlugOrId, getViewerBundle } from "@/lib/bundle";
import { currentUser } from "@/lib/auth/session";
import { parseViewerParams } from "@/lib/viewer/url-state";
import { FloorPlanViewer } from "@/components/viewer";
import { BRAND } from "@/lib/brand";
import type { ViewerParams } from "@/lib/sdk-protocol";

export type SearchParams = Record<string, string | string[] | undefined>;

/** Resolve event + bundle + parsed params for the viewer pages (shared by `/e/[slug]` and `/e/[slug]/embed`). */
export async function loadViewer(slug: string, sp: SearchParams, extra: Partial<ViewerParams> = {}) {
  const ev = findEventBySlugOrId(db(), slug);
  if (!ev) notFound();
  const params: ViewerParams = { ...parseViewerParams(sp), ...extra };
  let preview = params.preview === "1";
  if (preview) {
    const u = await currentUser();
    preview = !!u && u.orgId === ev.orgId;
    if (!preview) delete params.preview;
  }
  const bundle = getViewerBundle(db(), ev.id, preview);
  if (!bundle) notFound();
  return { ev, bundle, params, preview };
}

export async function viewerMetadata(slug: string): Promise<Metadata> {
  const ev = findEventBySlugOrId(db(), slug);
  if (!ev) return { title: "Not found" };
  const seo = ev.settings.seo ?? {};
  const title = seo.title ?? `${ev.name} · Floor plan`;
  const description = seo.description ?? ev.description ?? `${ev.name} interactive floor plan, exhibitor list and wayfinding — ${BRAND.name}.`;
  return {
    title: { absolute: title },
    description,
    openGraph: { title, description, type: "website", ...(seo.ogImage ? { images: [{ url: seo.ogImage }] } : {}) },
    robots: ev.status === "published" ? undefined : { index: false },
  };
}

export function ViewerPage({ data }: { data: Awaited<ReturnType<typeof loadViewer>> }) {
  return <FloorPlanViewer bundle={data.bundle} params={data.params} slug={data.ev.slug} preview={data.preview} />;
}

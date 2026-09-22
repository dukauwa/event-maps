import type { Metadata } from "next";
import { ViewerPage, loadViewer, viewerMetadata, type SearchParams } from "../viewer-page";

export const dynamic = "force-dynamic";

type Props = { params: Promise<{ slug: string }>; searchParams: Promise<SearchParams> };

export async function generateMetadata({ params }: Props): Promise<Metadata> {
  const { slug } = await params;
  const base = await viewerMetadata(slug);
  const title = typeof base.title === "object" && base.title && "absolute" in base.title ? `${base.title.absolute} · Book a stand` : "Book a stand";
  return { ...base, title: { absolute: title } };
}

/** Exhibitor booking view: the same map with availability, prices and Reserve / Buy on every open stand. */
export default async function BookPage({ params, searchParams }: Props) {
  const { slug } = await params;
  const data = await loadViewer(slug, await searchParams, { mode: "booking" });
  return <ViewerPage data={data} />;
}

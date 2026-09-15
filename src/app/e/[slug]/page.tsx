import type { Metadata } from "next";
import { ViewerPage, loadViewer, viewerMetadata, type SearchParams } from "./viewer-page";

export const dynamic = "force-dynamic";

type Props = { params: Promise<{ slug: string }>; searchParams: Promise<SearchParams> };

export async function generateMetadata({ params }: Props): Promise<Metadata> {
  const { slug } = await params;
  return viewerMetadata(slug);
}

/** Public attendee floor plan viewer. */
export default async function Page({ params, searchParams }: Props) {
  const { slug } = await params;
  const data = await loadViewer(slug, await searchParams);
  return <ViewerPage data={data} />;
}

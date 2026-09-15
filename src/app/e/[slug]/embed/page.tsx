import type { Metadata } from "next";
import { ViewerPage, loadViewer, viewerMetadata, type SearchParams } from "../viewer-page";

export const dynamic = "force-dynamic";

type Props = { params: Promise<{ slug: string }>; searchParams: Promise<SearchParams> };

export async function generateMetadata({ params }: Props): Promise<Metadata> {
  const { slug } = await params;
  return { ...(await viewerMetadata(slug)), robots: { index: false } };
}

/** Same viewer, flagged as embedded (`embed=1`): the SDK iframe target. */
export default async function EmbedPage({ params, searchParams }: Props) {
  const { slug } = await params;
  const data = await loadViewer(slug, await searchParams, { embed: "1" });
  return <ViewerPage data={data} />;
}

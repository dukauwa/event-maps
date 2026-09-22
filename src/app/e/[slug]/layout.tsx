import "maplibre-gl/dist/maplibre-gl.css";
import "@/components/viewer/viewer.css";

/** Public viewer layout: full-viewport, no site chrome. Metadata comes from the page. */
export default function ViewerLayout({ children }: { children: React.ReactNode }) {
  return (
    <>
      {/* Open the tile server connection while the plan is still hydrating; React hoists these into <head>. */}
      <link rel="preconnect" href="https://tiles.openfreemap.org" crossOrigin="" />
      <link rel="dns-prefetch" href="https://tiles.openfreemap.org" />
      {children}
    </>
  );
}

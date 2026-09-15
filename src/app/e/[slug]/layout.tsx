import "maplibre-gl/dist/maplibre-gl.css";
import "@/components/viewer/viewer.css";

/** Public viewer layout: full-viewport, no site chrome. Metadata comes from the page. */
export default function ViewerLayout({ children }: { children: React.ReactNode }) {
  return <>{children}</>;
}

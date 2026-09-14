import type { PlanBundle } from "@/lib/domain/types";
import { bbox } from "@/lib/domain/geometry";

/** Small inline SVG showing a booth in context (neighbours greyed, target highlighted). Server-renderable. */
export function BoothPreview({ bundle, boothId, size = 320, accent = "#1d4ed8" }: { bundle: PlanBundle; boothId: string; size?: number; accent?: string }) {
  const booth = bundle.booths.find((b) => b.id === boothId);
  if (!booth) return null;
  const bb = bbox(booth.polygon);
  const pad = Math.max(bb.maxX - bb.minX, bb.maxY - bb.minY) * 2.5 + 6;
  const view = { minX: bb.minX - pad, minY: bb.minY - pad, w: bb.maxX - bb.minX + pad * 2, h: bb.maxY - bb.minY + pad * 2 };
  const neighbours = bundle.booths.filter((b) => b.levelId === booth.levelId && b.id !== booth.id && b.polygon.some(([x, y]) => x > view.minX && x < view.minX + view.w && y > view.minY && y < view.minY + view.h));
  const colors = bundle.event.settings.branding.boothColors;
  const pts = (poly: [number, number][]) => poly.map((p) => p.join(",")).join(" ");
  const c = booth.center;
  return (
    <svg viewBox={`${view.minX} ${view.minY} ${view.w} ${view.h}`} width={size} height={size * (view.h / view.w)} className="rounded-lg border border-border bg-gray-50" role="img" aria-label={`Booth ${booth.label} location`}>
      {neighbours.map((b) => <polygon key={b.id} points={pts(b.polygon)} fill={b.status === "available" ? colors.available : "#e5e7eb"} stroke="#fff" strokeWidth={0.2} opacity={0.8} />)}
      {neighbours.filter((b) => b.areaM2 > 9).map((b) => <text key={b.id + "t"} x={b.center[0]} y={b.center[1]} fontSize={Math.min(1.6, Math.sqrt(b.areaM2) / 3)} textAnchor="middle" dominantBaseline="middle" fill="#6b7280">{b.label}</text>)}
      <polygon points={pts(booth.polygon)} fill={accent} stroke="#fff" strokeWidth={0.3} />
      <text x={c[0]} y={c[1]} fontSize={Math.min(2, Math.sqrt(booth.areaM2) / 2.5)} fontWeight={700} textAnchor="middle" dominantBaseline="middle" fill="#fff">{booth.label}</text>
    </svg>
  );
}

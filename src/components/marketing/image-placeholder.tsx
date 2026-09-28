import { cn } from "@/lib/cn";

/**
 * A grey box standing in for an image or screenshot that has not been made yet. The caption says what belongs there
 * and at what size, so each one can be swapped for the real asset later.
 */
export function ImagePlaceholder({ label, size, className, ratio = "16 / 10", tone = "light" }: { label: string; size?: string; className?: string; ratio?: string; tone?: "light" | "lighter" }) {
  return (
    <div
      role="img"
      aria-label={`Image placeholder: ${label}`}
      className={cn("relative grid w-full max-w-full place-items-center overflow-hidden rounded-xl", tone === "light" ? "bg-gray-100" : "bg-gray-50", className)}
      style={{ aspectRatio: ratio }}
    >
      <div className="flex flex-col items-center gap-2 px-4 text-center">
        <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" className="text-gray-400" aria-hidden>
          <rect x="3" y="3" width="18" height="18" rx="2.5" /><circle cx="9" cy="9" r="1.75" /><path d="m21 15-4.5-4.5L6 21" />
        </svg>
        <span className="text-xs font-medium text-gray-500">{label}</span>
        {size && <span className="font-mono text-[11px] text-gray-400">{size}</span>}
      </div>
    </div>
  );
}

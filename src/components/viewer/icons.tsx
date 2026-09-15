"use client";
/** Inline stroke icons (24×24) used by the viewer chrome; one component keeps the bundle small and theme-friendly. */
import type { SVGProps } from "react";

const P: Record<string, string> = {
  search: "M11 4a7 7 0 1 0 0 14 7 7 0 0 0 0-14zM20 20l-4.3-4.3",
  close: "M6 6l12 12M18 6L6 18",
  back: "M15 5l-7 7 7 7",
  plus: "M12 5v14M5 12h14",
  minus: "M5 12h14",
  fit: "M4 9V4h5M15 4h5v5M20 15v5h-5M9 20H4v-5",
  cube: "M12 3l8 4.5v9L12 21l-8-4.5v-9zM12 12l8-4.5M12 12v9M12 12L4 7.5",
  locate: "M12 2v3M12 19v3M2 12h3M19 12h3M12 7a5 5 0 1 0 0 10 5 5 0 0 0 0-10zM12 11a1 1 0 1 0 0 2",
  print: "M6 9V3h12v6M6 18H4a2 2 0 0 1-2-2v-5a2 2 0 0 1 2-2h16a2 2 0 0 1 2 2v5a2 2 0 0 1-2 2h-2M6 14h12v7H6z",
  share: "M4 12v7a1 1 0 0 0 1 1h14a1 1 0 0 0 1-1v-7M12 15V3M8 7l4-4 4 4",
  globe: "M12 3a9 9 0 1 0 0 18 9 9 0 0 0 0-18zM3 12h18M12 3c3 3.5 3 14.5 0 18M12 3c-3 3.5-3 14.5 0 18",
  directions: "M12 2l10 10-10 10L2 12zM9 12h6M13 10l2 2-2 2",
  bookmark: "M6 3h12v18l-6-4-6 4z",
  bookmarkFill: "M6 3h12v18l-6-4-6 4z",
  star: "M12 3l2.6 5.5 6 .8-4.4 4.2 1.1 6-5.3-2.9L6.7 19.5l1.1-6L3.4 9.3l6-.8z",
  link: "M10 14a4 4 0 0 0 5.7 0l3-3a4 4 0 0 0-5.7-5.7l-1 1M14 10a4 4 0 0 0-5.7 0l-3 3a4 4 0 0 0 5.7 5.7l1-1",
  mail: "M3 6h18v12H3zM3 7l9 6 9-6",
  phone: "M5 3h4l2 5-2.5 1.5a11 11 0 0 0 6 6L16 13l5 2v4a2 2 0 0 1-2 2A16 16 0 0 1 3 5a2 2 0 0 1 2-2z",
  pin: "M12 21s-7-6.2-7-11a7 7 0 0 1 14 0c0 4.8-7 11-7 11zM12 10h.01",
  clock: "M12 3a9 9 0 1 0 0 18 9 9 0 0 0 0-18zM12 7v5l3 2",
  calendar: "M4 5h16v16H4zM4 10h16M8 3v4M16 3v4",
  layers: "M12 3l9 5-9 5-9-5zM3 13l9 5 9-5M3 17l9 5 9-5",
  swap: "M7 4v16M7 20l-3-3M7 20l3-3M17 20V4M17 4l-3 3M17 4l3 3",
  check: "M5 12l5 5 9-10",
  accessible: "M12 4a1.5 1.5 0 1 0 .01 0M12 7v6h5l2 5M12 13h-2a4 4 0 1 0 4 4",
  walk: "M13 5a1.5 1.5 0 1 0 .01 0M9 21l2-6 2 2v4M15 11l-2-2-3 1-2 3M13 9l3 3",
  turnLeft: "M18 20V11a4 4 0 0 0-4-4H6M9 4L6 7l3 3",
  turnRight: "M6 20V11a4 4 0 0 1 4-4h8M15 4l3 3-3 3",
  uturn: "M8 20V9a4 4 0 0 1 8 0v11M12 16l4 4 4-4",
  flag: "M5 21V4h11l-1 4 1 4H5",
  stairs: "M4 20h4v-4h4v-4h4V8h4",
  elevator: "M5 3h14v18H5zM9 10l2-3 2 3M9 14l2 3 2-3",
  escalator: "M3 17h4l7-9h7M18 8l3 0",
  qr: "M4 4h6v6H4zM14 4h6v6h-6zM4 14h6v6H4zM14 14h2v2h-2zM18 14h2v2h-2zM14 18h2v2h-2zM18 18h2v2h-2z",
  copy: "M8 8h12v12H8zM4 16V4h12",
  moon: "M20 14.5A8 8 0 0 1 9.5 4a8 8 0 1 0 10.5 10.5z",
  sun: "M12 8a4 4 0 1 0 0 8 4 4 0 0 0 0-8zM12 2v2M12 20v2M2 12h2M20 12h2M5 5l1.5 1.5M17.5 17.5L19 19M5 19l1.5-1.5M17.5 6.5L19 5",
  info: "M12 3a9 9 0 1 0 0 18 9 9 0 0 0 0-18zM12 8v.01M12 11v5",
  chevron: "M9 6l6 6-6 6",
  list: "M8 6h13M8 12h13M8 18h13M3 6h.01M3 12h.01M3 18h.01",
  map: "M3 6l6-3 6 3 6-3v15l-6 3-6-3-6 3zM9 3v15M15 6v15",
  reset: "M4 4v6h6M20 20v-6h-6M20 9a8 8 0 0 0-14-3L4 10M4 15a8 8 0 0 0 14 3l2-4",
  play: "M6 4l14 8-14 8z",
  ticket: "M3 8a2 2 0 0 0 2-2h14a2 2 0 0 0 2 2v8a2 2 0 0 0-2 2H5a2 2 0 0 0-2-2zM13 6v12",
  cursor: "M5 3l14 8-6 2-2 6z",
  chevronDown: "M6 9l6 6 6-6",
};

export type IconName = keyof typeof P;

export function Icon({ name, size = 20, filled, ...rest }: { name: IconName; size?: number; filled?: boolean } & SVGProps<SVGSVGElement>) {
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" fill={filled ? "currentColor" : "none"} stroke="currentColor" strokeWidth={2} strokeLinecap="round" strokeLinejoin="round" aria-hidden="true" focusable="false" {...rest}>
      <path d={P[name]} />
    </svg>
  );
}

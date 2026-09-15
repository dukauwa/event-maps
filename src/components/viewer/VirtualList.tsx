"use client";
/** Minimal windowed list with variable row heights (prefix sums) — smooth with thousands of rows and no dependencies. */
import { useCallback, useEffect, useLayoutEffect, useMemo, useRef, useState, type ReactNode } from "react";

export interface VirtualListProps<T> {
  rows: T[];
  rowHeight: (row: T, index: number) => number;
  render: (row: T, index: number) => ReactNode;
  rowKey: (row: T, index: number) => string;
  /** Extra rows rendered above/below the viewport. */
  overscan?: number;
  className?: string;
  /** Called with the first visible row (e.g. to show a sticky letter). */
  onFirstVisible?: (row: T | null) => void;
  header?: ReactNode;
  footer?: ReactNode;
  /** Scroll to this row index when it changes. */
  scrollToIndex?: number | null;
  ariaLabel?: string;
}

export function VirtualList<T>({ rows, rowHeight, render, rowKey, overscan = 6, className, onFirstVisible, header, footer, scrollToIndex, ariaLabel }: VirtualListProps<T>) {
  const ref = useRef<HTMLDivElement>(null);
  const [scrollTop, setScrollTop] = useState(0);
  const [height, setHeight] = useState(600);
  const [headerH, setHeaderH] = useState(0);
  const headerRef = useRef<HTMLDivElement>(null);

  const offsets = useMemo(() => {
    const out = new Array<number>(rows.length + 1);
    out[0] = 0;
    for (let i = 0; i < rows.length; i++) out[i + 1] = out[i] + rowHeight(rows[i], i);
    return out;
  }, [rows, rowHeight]);
  const total = offsets[rows.length] ?? 0;

  useLayoutEffect(() => {
    const el = ref.current;
    if (!el) return;
    const ro = new ResizeObserver(() => { setHeight(el.clientHeight); setHeaderH(headerRef.current?.offsetHeight ?? 0); });
    ro.observe(el);
    if (headerRef.current) ro.observe(headerRef.current);
    setHeight(el.clientHeight);
    setHeaderH(headerRef.current?.offsetHeight ?? 0);
    return () => ro.disconnect();
  }, []);

  const onScroll = useCallback(() => { const el = ref.current; if (el) setScrollTop(el.scrollTop); }, []);

  const top = Math.max(0, scrollTop - headerH);
  let start = lowerBound(offsets, top) - 1;
  if (start < 0) start = 0;
  let end = lowerBound(offsets, top + height);
  start = Math.max(0, start - overscan);
  end = Math.min(rows.length, end + overscan);

  useEffect(() => { onFirstVisible?.(rows.length ? rows[Math.min(rows.length - 1, Math.max(0, lowerBound(offsets, top + 1) - 1))] : null); }, [rows, offsets, top, onFirstVisible]);

  useEffect(() => {
    if (scrollToIndex == null || scrollToIndex < 0 || !ref.current) return;
    ref.current.scrollTo({ top: offsets[scrollToIndex] + headerH, behavior: "auto" });
  }, [scrollToIndex, offsets, headerH]);

  const items: ReactNode[] = [];
  for (let i = start; i < end; i++) {
    items.push(
      <div key={rowKey(rows[i], i)} style={{ position: "absolute", top: offsets[i], left: 0, right: 0, height: offsets[i + 1] - offsets[i] }} role="presentation">
        {render(rows[i], i)}
      </div>,
    );
  }

  return (
    <div ref={ref} onScroll={onScroll} className={`tv-panel-content tv-scrollbar ${className ?? ""}`} role="list" aria-label={ariaLabel}>
      {header && <div ref={headerRef}>{header}</div>}
      <div style={{ position: "relative", height: total }}>{items}</div>
      {footer}
    </div>
  );
}

/** First index whose offset is > value. */
function lowerBound(offsets: number[], value: number): number {
  let lo = 0, hi = offsets.length;
  while (lo < hi) {
    const mid = (lo + hi) >> 1;
    if (offsets[mid] <= value) lo = mid + 1; else hi = mid;
  }
  return lo;
}

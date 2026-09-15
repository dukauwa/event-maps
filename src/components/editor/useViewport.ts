"use client";
import * as React from "react";
import type { Point } from "@/lib/domain/types";
import type { BBox } from "@/lib/domain/geometry";

/** screen = plan * scale + (x, y). `scale` is pixels per metre. */
export interface Viewport { x: number; y: number; scale: number }

export const MIN_SCALE = 0.5;
export const MAX_SCALE = 400;

export function useViewport(initial: Viewport = { x: 40, y: 40, scale: 6 }) {
  const [vp, setVp] = React.useState<Viewport>(initial);
  const ref = React.useRef(vp);
  ref.current = vp;

  const toPlan = React.useCallback((sx: number, sy: number): Point => {
    const v = ref.current;
    return [(sx - v.x) / v.scale, (sy - v.y) / v.scale];
  }, []);

  const toScreen = React.useCallback((p: Point): Point => {
    const v = ref.current;
    return [p[0] * v.scale + v.x, p[1] * v.scale + v.y];
  }, []);

  /** Zoom by `factor` keeping the screen point (sx, sy) fixed. */
  const zoomAt = React.useCallback((factor: number, sx: number, sy: number) => {
    setVp((v) => {
      const scale = Math.min(MAX_SCALE, Math.max(MIN_SCALE, v.scale * factor));
      const k = scale / v.scale;
      return { scale, x: sx - (sx - v.x) * k, y: sy - (sy - v.y) * k };
    });
  }, []);

  const panBy = React.useCallback((dx: number, dy: number) => setVp((v) => ({ ...v, x: v.x + dx, y: v.y + dy })), []);

  /** Fit a plan bbox into a screen size with padding. */
  const fit = React.useCallback((box: BBox, width: number, height: number, padding = 48) => {
    const w = Math.max(1, box.maxX - box.minX), h = Math.max(1, box.maxY - box.minY);
    const scale = Math.min(MAX_SCALE, Math.max(MIN_SCALE, Math.min((width - padding * 2) / w, (height - padding * 2) / h)));
    setVp({ scale, x: (width - w * scale) / 2 - box.minX * scale, y: (height - h * scale) / 2 - box.minY * scale });
  }, []);

  const setScaleAt = React.useCallback((scale: number, sx: number, sy: number) => {
    setVp((v) => {
      const s = Math.min(MAX_SCALE, Math.max(MIN_SCALE, scale));
      const k = s / v.scale;
      return { scale: s, x: sx - (sx - v.x) * k, y: sy - (sy - v.y) * k };
    });
  }, []);

  return { vp, setVp, toPlan, toScreen, zoomAt, panBy, fit, setScaleAt };
}

/** A "nice" length for the scale bar close to `targetPx` pixels. */
export function niceScaleBar(scale: number, targetPx = 120): { metres: number; px: number } {
  const raw = targetPx / scale;
  const steps = [0.1, 0.2, 0.5, 1, 2, 5, 10, 20, 50, 100, 200, 500];
  let metres = steps[0];
  for (const s of steps) if (s <= raw) metres = s;
  return { metres, px: metres * scale };
}

/** Ruler tick spacing (metres) for the current zoom: roughly one labelled tick per 80 px. */
export function rulerStep(scale: number): number {
  return niceScaleBar(scale, 80).metres;
}

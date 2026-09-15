"use client";
import { createContext, useContext, useSyncExternalStore } from "react";
import type { Translator } from "@/lib/i18n";
import type { EventTerms, Locale } from "@/lib/domain/types";
import type { ViewerController, ViewerState } from "@/lib/viewer/controller";

export interface ViewerContextValue {
  controller: ViewerController;
  t: Translator;
  terms: EventTerms;
  locale: Locale;
  isMobile: boolean;
}

export const ViewerContext = createContext<ViewerContextValue | null>(null);

export function useViewer(): ViewerContextValue {
  const v = useContext(ViewerContext);
  if (!v) throw new Error("useViewer must be used inside <FloorPlanViewer>");
  return v;
}

/** Subscribe to the controller snapshot (re-renders on every state change; select with `useViewerSelector` for hot paths). */
export function useViewerState(): ViewerState {
  const { controller } = useViewer();
  return useSyncExternalStore(controller.subscribe, controller.snapshot, controller.snapshot);
}

export function useT(): Translator {
  return useViewer().t;
}

/** Format a price in the event currency. */
export function formatPrice(cents: number, currency: string, locale: string): string {
  try {
    return new Intl.NumberFormat(locale, { style: "currency", currency, maximumFractionDigits: 0 }).format(cents / 100);
  } catch {
    return `${(cents / 100).toFixed(0)} ${currency}`;
  }
}

export function formatTime(iso: string, locale: string, timeZone?: string | null): string {
  try {
    return new Intl.DateTimeFormat(locale, { hour: "2-digit", minute: "2-digit", timeZone: timeZone ?? undefined }).format(new Date(iso));
  } catch {
    return iso.slice(11, 16);
  }
}

export function formatDay(iso: string, locale: string, timeZone?: string | null): string {
  try {
    return new Intl.DateTimeFormat(locale, { weekday: "long", day: "numeric", month: "long", timeZone: timeZone ?? undefined }).format(new Date(iso));
  } catch {
    return iso.slice(0, 10);
  }
}

export function dayKey(iso: string, timeZone?: string | null): string {
  try {
    return new Intl.DateTimeFormat("en-CA", { year: "numeric", month: "2-digit", day: "2-digit", timeZone: timeZone ?? undefined }).format(new Date(iso));
  } catch {
    return iso.slice(0, 10);
  }
}

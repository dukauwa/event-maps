/**
 * Fire-and-forget analytics: batches `AnalyticsEventInput`s and ships them with `navigator.sendBeacon`
 * every 10 s and on `pagehide`. Honours `consent=denied` by dropping everything.
 */
import type { AnalyticsEventInput, AnalyticsType } from "@/lib/domain/types";

export interface AnalyticsOptions {
  slug: string;
  consent?: "ask" | "granted" | "denied";
  flushIntervalMs?: number;
  endpoint?: string;
}

export interface AnalyticsClient {
  track: (type: AnalyticsType, data?: Omit<AnalyticsEventInput, "type" | "sessionId">) => void;
  flush: () => void;
  destroy: () => void;
  readonly sessionId: string;
}

const SESSION_KEY = "tessera:session";

export function getSessionId(): string {
  if (typeof window === "undefined") return "server";
  try {
    const existing = window.sessionStorage.getItem(SESSION_KEY);
    if (existing) return existing;
    const id = `vs_${Math.random().toString(36).slice(2, 10)}${Date.now().toString(36)}`;
    window.sessionStorage.setItem(SESSION_KEY, id);
    return id;
  } catch {
    return `vs_${Math.random().toString(36).slice(2, 12)}`;
  }
}

export function createAnalytics(opts: AnalyticsOptions): AnalyticsClient {
  const denied = opts.consent === "denied";
  const endpoint = opts.endpoint ?? `/api/v1/events/${encodeURIComponent(opts.slug)}/analytics`;
  const sessionId = getSessionId();
  let queue: AnalyticsEventInput[] = [];
  let timer: ReturnType<typeof setInterval> | null = null;
  const lastSearch = { q: "", at: 0 };

  function flush() {
    if (denied || queue.length === 0 || typeof navigator === "undefined") return;
    const body = JSON.stringify({ events: queue.splice(0, 100) });
    try {
      if (typeof navigator.sendBeacon === "function") {
        const ok = navigator.sendBeacon(endpoint, new Blob([body], { type: "application/json" }));
        if (ok) return;
      }
      void fetch(endpoint, { method: "POST", headers: { "content-type": "application/json" }, body, keepalive: true }).catch(() => undefined);
    } catch {
      /* ignore */
    }
  }

  function track(type: AnalyticsType, data: Omit<AnalyticsEventInput, "type" | "sessionId"> = {}) {
    if (denied) return;
    if (type === "search") {
      // Debounce: collapse rapid keystrokes into one event with the final query.
      const q = data.query ?? "";
      const now = Date.now();
      if (q && lastSearch.q && q.startsWith(lastSearch.q) && now - lastSearch.at < 1500) {
        const idx = queue.findIndex((e) => e.type === "search" && e.query === lastSearch.q);
        if (idx >= 0) queue.splice(idx, 1);
      }
      lastSearch.q = q;
      lastSearch.at = now;
      if (!q) return;
    }
    queue.push({ type, sessionId, ...data });
    if (queue.length >= 50) flush();
  }

  if (!denied && typeof window !== "undefined") {
    timer = setInterval(flush, opts.flushIntervalMs ?? 10_000);
    window.addEventListener("pagehide", flush);
    document.addEventListener("visibilitychange", () => { if (document.visibilityState === "hidden") flush(); });
  }

  return {
    track,
    flush,
    sessionId,
    destroy() {
      if (timer) clearInterval(timer);
      if (typeof window !== "undefined") window.removeEventListener("pagehide", flush);
      flush();
      queue = [];
    },
  };
}

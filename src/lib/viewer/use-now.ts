"use client";
import { useSyncExternalStore } from "react";

const MINUTE = 60_000;
const subscribers = new Set<() => void>();
let timer: ReturnType<typeof setInterval> | null = null;
function subscribe(cb: () => void) {
  subscribers.add(cb);
  if (!timer) timer = setInterval(() => subscribers.forEach((s) => s()), MINUTE);
  return () => { subscribers.delete(cb); if (!subscribers.size && timer) { clearInterval(timer); timer = null; } };
}
const snapshot = () => Math.floor(Date.now() / MINUTE) * MINUTE;
const serverSnapshot = () => 0;

/** Current time rounded to the minute, refreshed every minute. Pure during render (store-backed), 0 on the server. */
export function useNow(): number {
  return useSyncExternalStore(subscribe, snapshot, serverSnapshot);
}

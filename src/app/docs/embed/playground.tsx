"use client";
import { useEffect, useRef, useState } from "react";
import Script from "next/script";
import { Button, Input } from "@/components/ui";

type FP = { ready: Promise<unknown>; call: (m: string, ...a: unknown[]) => Promise<unknown>; on: (e: string, h: (p: unknown) => void) => void; destroy: () => void };
declare global { interface Window { Tessera?: { FloorPlan: new (o: Record<string, unknown>) => FP } } }

export function Playground() {
  const ref = useRef<HTMLDivElement>(null);
  const fp = useRef<FP | null>(null);
  const [log, setLog] = useState<string[]>([]);
  const [booth, setBooth] = useState("A101");
  const [loaded, setLoaded] = useState(false);
  const push = (s: string) => setLog((l) => [s, ...l].slice(0, 30));
  useEffect(() => {
    if (!loaded || !ref.current || fp.current || !window.Tessera) return;
    const inst = new window.Tessera.FloorPlan({ element: ref.current, eventId: "grip-connect-2026", baseUrl: location.origin, offHistory: true, onEvent: (name: string, payload: unknown) => push(`${name} ${JSON.stringify(payload ?? "").slice(0, 120)}`) });
    fp.current = inst;
    return () => { inst.destroy(); fp.current = null; };
  }, [loaded]);
  const run = (m: string, ...a: unknown[]) => fp.current?.call(m, ...a).then((r) => push(`→ ${m}: ${JSON.stringify(r ?? null).slice(0, 160)}`)).catch((e) => push(`✕ ${m}: ${e.message}`));
  return (
    <div className="mb-8 rounded-xl border border-border bg-surface p-4">
      <Script src="/sdk/tessera.js" onLoad={() => setLoaded(true)} />
      <div className="mb-3 flex flex-wrap items-center gap-2">
        <Input value={booth} onChange={(e) => setBooth(e.target.value)} className="w-28" aria-label="Booth label" />
        <Button size="sm" variant="outline" onClick={() => run("selectBooth", booth)}>selectBooth</Button>
        <Button size="sm" variant="outline" onClick={() => run("selectRoute", "A101", booth)}>selectRoute(A101 → …)</Button>
        <Button size="sm" variant="outline" onClick={() => run("highlightBooths", ["A101", "B101", "C101"])}>highlightBooths</Button>
        <Button size="sm" variant="outline" onClick={() => run("activateFloor", "L2")}>activateFloor(L2)</Button>
        <Button size="sm" variant="outline" onClick={() => run("getFloors")}>getFloors</Button>
        <Button size="sm" variant="outline" onClick={() => run("setLanguage", "de")}>setLanguage(de)</Button>
        <Button size="sm" variant="outline" onClick={() => run("switchView")}>switchView</Button>
        <Button size="sm" variant="outline" onClick={() => run("reset")}>reset</Button>
      </div>
      <div ref={ref} className="h-[520px] overflow-hidden rounded-lg border border-border bg-gray-100" />
      <pre className="mt-3 max-h-40 overflow-auto rounded-lg bg-gray-950 p-3 text-xs text-gray-100">{log.join("\n") || "Events and results appear here."}</pre>
    </div>
  );
}

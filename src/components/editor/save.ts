"use client";
/**
 * Persist the difference between the last saved document and the current one through the REST
 * API, in dependency order (levels → booths → merges → elements → network → transitions).
 * Returns the id mapping the server minted and the document as it now exists on the server, so
 * a partially failed save still records what succeeded.
 */
import { api } from "@/components/ui";
import type { BoothStatus, BoothType, Polygon } from "@/lib/domain/types";
import { boothApiInput, diffDocuments, levelApiInput, remapIds, transitionApiInput, type EditorDocument, type EditorEdge } from "@/lib/editor/document";

export interface SaveOutcome {
  map: Record<string, string>;
  savedDoc: EditorDocument;
  error: string | null;
  warnings: string[];
}

interface ServerBooth { id: string; label: string; levelId: string; polygon: Polygon; status: BoothStatus; boothType: BoothType; externalId: string | null }

async function listAllBooths(base: string): Promise<ServerBooth[]> {
  const out: ServerBooth[] = [];
  let offset = 0;
  for (;;) {
    const res = await fetch(`${base}/booths?limit=1000&offset=${offset}`, { credentials: "include" });
    const body = (await res.json()) as { data?: ServerBooth[]; meta?: { total: number }; error?: { message: string } };
    if (!res.ok || body.error || !body.data) throw new Error(body.error?.message ?? `HTTP ${res.status}`);
    out.push(...body.data);
    offset += body.data.length;
    if (!body.data.length || offset >= (body.meta?.total ?? 0)) break;
  }
  return out;
}

export async function saveDocument(eventId: string, lastSaved: EditorDocument, current: EditorDocument): Promise<SaveOutcome> {
  const base = `/api/v1/events/${eventId}`;
  const map: Record<string, string> = {};
  const warnings: string[] = [];
  let saved: EditorDocument = { ...lastSaved, pendingMerges: [] };
  let doc = current;
  const remap = (m: Record<string, string>) => { Object.assign(map, m); saved = remapIds(saved, m); doc = remapIds(doc, m); };

  try {
    let plan = diffDocuments(saved, doc);

    // 1. Levels (new ones first: everything else references them).
    for (const l of plan.levels.create) {
      const created = await api<{ id: string }>(`${base}/levels`, { method: "POST", json: levelApiInput(l) });
      remap({ [l.id]: created.id });
      saved = { ...saved, levels: [...saved.levels, { ...l, id: created.id }] };
    }
    for (const u of plan.levels.update) {
      await api(`${base}/levels/${u.id}`, { method: "PATCH", json: u.patch });
      saved = { ...saved, levels: saved.levels.map((l) => (l.id === u.id ? doc.levels.find((x) => x.id === u.id) ?? l : l)) };
    }
    plan = diffDocuments(saved, doc);

    // 2. New booths (bulk upsert by label, then read back the ids).
    if (plan.booths.create.length) {
      const items = plan.booths.create.map(boothApiInput);
      const r = await api<{ created: number; updated: number; errors: { index: number; error: string }[] }>(`${base}/booths`, { method: "POST", json: items });
      for (const e of r.errors) warnings.push(`Booth ${items[e.index]?.label ?? e.index}: ${e.error}`);
      const failed = new Set(r.errors.map((e) => plan.booths.create[e.index]?.id));
      const serverBooths = await listAllBooths(base);
      const byLabel = new Map(serverBooths.map((b) => [b.label, b.id]));
      const m: Record<string, string> = {};
      const createdIds: string[] = [];
      for (const b of plan.booths.create) {
        if (failed.has(b.id)) continue;
        const sid = byLabel.get(b.label);
        if (sid && sid !== b.id) m[b.id] = sid;
        if (sid) createdIds.push(sid);
      }
      remap(m);
      const created = new Set(createdIds);
      saved = { ...saved, booths: [...saved.booths, ...doc.booths.filter((b) => created.has(b.id))] };
    }

    // 3. Merges through the merge endpoint (keeps exhibitor assignments server-side).
    for (const mg of doc.pendingMerges) {
      const savedIds = new Set(saved.booths.map((b) => b.id));
      if (!savedIds.has(mg.keepId) || !mg.removedIds.every((id) => savedIds.has(id))) continue;
      const merged = await api<ServerBooth>(`${base}/booths/merge`, { method: "POST", json: { boothIds: [mg.keepId, ...mg.removedIds], label: mg.label } });
      const removed = new Set(mg.removedIds);
      saved = { ...saved, booths: saved.booths.filter((b) => !removed.has(b.id)).map((b) => (b.id === mg.keepId ? { ...b, polygon: merged.polygon, label: merged.label } : b)) };
    }
    plan = diffDocuments(saved, doc);

    // 4. Booth updates / deletes.
    for (const u of plan.booths.update) {
      await api(`${base}/booths/${u.id}`, { method: "PATCH", json: u.patch });
      saved = { ...saved, booths: saved.booths.map((b) => (b.id === u.id ? doc.booths.find((x) => x.id === u.id) ?? b : b)) };
    }
    for (const id of plan.booths.delete) {
      await api(`${base}/booths/${id}`, { method: "DELETE" }).catch((e: Error) => { if (!/not found/i.test(e.message)) throw e; });
      saved = { ...saved, booths: saved.booths.filter((b) => b.id !== id) };
    }

    // 5. Elements per level.
    for (const levelId of plan.elementLevels) {
      const elements = doc.elements.filter((e) => e.levelId === levelId).sort((a, b) => a.sortIndex - b.sortIndex);
      await api(`${base}/elements`, { method: "PUT", json: { levelId, elements: elements.map((e) => ({ id: e.id, kind: e.kind, geometry: e.geometry, props: e.props, sortIndex: e.sortIndex })) } });
      saved = { ...saved, elements: [...saved.elements.filter((e) => e.levelId !== levelId), ...elements] };
    }

    // 6. Path network per level (server keeps `wn_` node ids, mints edge ids).
    for (const levelId of plan.wayfindingLevels) {
      const nodes = doc.nodes.filter((n) => n.levelId === levelId);
      const edges = doc.edges.filter((e) => e.levelId === levelId);
      const r = await api<{ idMap: Record<string, string>; edges: { id: string; from: string; to: string }[] }>(`${base}/wayfinding`, {
        method: "PUT",
        json: { levelId, nodes: nodes.map((n) => ({ id: n.id, x: n.x, y: n.y })), edges: edges.map((e) => ({ from: e.from, to: e.to, accessible: e.accessible, oneWay: e.oneWay, virtual: e.virtual, weight: e.weight })) },
      });
      const m: Record<string, string> = {};
      for (const [from, to] of Object.entries(r.idMap)) if (from !== to) m[from] = to;
      const key = (a: string, b: string) => `${a}→${b}`;
      const serverEdge = new Map(r.edges.map((e) => [key(e.from, e.to), e.id]));
      for (const e of edges) {
        const sid = serverEdge.get(key(m[e.from] ?? e.from, m[e.to] ?? e.to));
        if (sid && sid !== e.id) m[e.id] = sid;
      }
      remap(m);
      const nodesNow = doc.nodes.filter((n) => n.levelId === levelId);
      const edgesNow: EditorEdge[] = doc.edges.filter((e) => e.levelId === levelId);
      saved = { ...saved, nodes: [...saved.nodes.filter((n) => n.levelId !== levelId), ...nodesNow], edges: [...saved.edges.filter((e) => e.levelId !== levelId), ...edgesNow] };
    }
    plan = diffDocuments(saved, doc);

    // 7. Transitions.
    for (const t of plan.transitions.create) {
      if (t.nodeIds.length < 2) { warnings.push(`Transition "${t.name}" needs two nodes and was not saved`); continue; }
      const created = await api<{ id: string }>(`${base}/wayfinding/transitions`, { method: "POST", json: transitionApiInput(t) });
      remap({ [t.id]: created.id });
      saved = { ...saved, transitions: [...saved.transitions, { ...t, id: created.id }] };
    }
    for (const u of plan.transitions.update) {
      await api(`${base}/wayfinding/transitions/${u.id}`, { method: "PATCH", json: u.patch });
      saved = { ...saved, transitions: saved.transitions.map((t) => (t.id === u.id ? doc.transitions.find((x) => x.id === u.id) ?? t : t)) };
    }
    for (const id of plan.transitions.delete) {
      await api(`${base}/wayfinding/transitions/${id}`, { method: "DELETE" }).catch((e: Error) => { if (!/not found/i.test(e.message)) throw e; });
      saved = { ...saved, transitions: saved.transitions.filter((t) => t.id !== id) };
    }

    // 8. Deleted levels last (cascades their content).
    for (const id of plan.levels.delete) {
      await api(`${base}/levels/${id}`, { method: "DELETE" }).catch((e: Error) => { if (!/not found/i.test(e.message)) throw e; });
      saved = { ...saved, levels: saved.levels.filter((l) => l.id !== id), booths: saved.booths.filter((b) => b.levelId !== id), elements: saved.elements.filter((e) => e.levelId !== id), nodes: saved.nodes.filter((n) => n.levelId !== id), edges: saved.edges.filter((e) => e.levelId !== id) };
    }
    return { map, savedDoc: saved, error: null, warnings };
  } catch (e) {
    return { map, savedDoc: saved, error: e instanceof Error ? e.message : String(e), warnings };
  }
}

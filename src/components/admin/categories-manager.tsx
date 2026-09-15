"use client";
import * as React from "react";
import { api, Button, EmptyState, Field, Input, Table, Td, Th } from "@/components/ui";
import { eventApi } from "./lib";
import { ConfirmButton, PageHeader, run, Section, useRefresh } from "./primitives";

export interface CategoryRow { id: string; name: string; color: string | null; parentId: string | null; sortIndex: number; exhibitorCount: number }
const PALETTE = ["#7c3aed", "#0f766e", "#c2410c", "#1d4ed8", "#b91c1c", "#4d7c0f", "#be185d", "#0e7490", "#9333ea", "#334155", "#78350f", "#1e3a8a"];

export function CategoriesManager({ event, categories }: { event: { id: string; name: string; exhibitors: string }; categories: CategoryRow[] }) {
  const { refresh, pending } = useRefresh();
  const base = eventApi(event.id);
  const [name, setName] = React.useState("");
  const [color, setColor] = React.useState(PALETTE[categories.length % PALETTE.length]);
  const [busy, setBusy] = React.useState(false);
  const [editing, setEditing] = React.useState<{ id: string; name: string; color: string } | null>(null);
  const byParent = React.useMemo(() => new Map(categories.map((c) => [c.id, c.name])), [categories]);

  const create = async (e: React.FormEvent) => {
    e.preventDefault();
    setBusy(true);
    const r = await run(() => api(`${base}/categories`, { method: "POST", json: { name: name.trim(), color } }), { success: "Category created", onDone: refresh });
    setBusy(false);
    if (r) { setName(""); setColor(PALETTE[(categories.length + 1) % PALETTE.length]); }
  };
  const save = async () => {
    if (!editing) return;
    await run(() => api(`${base}/categories/${editing.id}`, { method: "PATCH", json: { name: editing.name.trim(), color: editing.color || null } }), { success: "Saved", onDone: () => { setEditing(null); refresh(); } });
  };
  const move = async (i: number, dir: -1 | 1) => {
    const j = i + dir;
    if (j < 0 || j >= categories.length) return;
    const a = categories[i], b = categories[j];
    await run(async () => { await api(`${base}/categories/${a.id}`, { method: "PATCH", json: { sortIndex: j } }); await api(`${base}/categories/${b.id}`, { method: "PATCH", json: { sortIndex: i } }); }, { onDone: refresh });
  };
  const normalise = async () => {
    await run(async () => { for (let i = 0; i < categories.length; i++) if (categories[i].sortIndex !== i) await api(`${base}/categories/${categories[i].id}`, { method: "PATCH", json: { sortIndex: i } }); }, { success: "Order normalised", onDone: refresh });
  };

  return (
    <>
      <PageHeader crumbs={[{ href: "/admin", label: "Events" }, { href: `/admin/events/${event.id}`, label: event.name }, { label: "Categories" }]} title="Categories" subtitle={`${categories.length} categories · used to filter ${event.exhibitors.toLowerCase()} in the viewer`} actions={categories.some((c, i) => c.sortIndex !== i) ? <Button variant="outline" size="sm" onClick={normalise}>Normalise order</Button> : undefined} />
      <div className="grid gap-6 lg:grid-cols-3">
        <Section title="New category" className="lg:order-2">
          <form onSubmit={create} className="space-y-3">
            <Field label="Name" hint="Use “Parent / Child” in CSV imports to create hierarchies."><Input required value={name} onChange={(e) => setName(e.target.value)} placeholder="e.g. Fintech & Payments" /></Field>
            <Field label="Colour">
              <div className="flex items-center gap-2">
                <input type="color" value={color} onChange={(e) => setColor(e.target.value)} className="h-9 w-12 cursor-pointer rounded border border-border" aria-label="Colour" />
                <Input value={color} onChange={(e) => setColor(e.target.value)} className="font-mono" />
              </div>
              <div className="mt-2 flex flex-wrap gap-1">{PALETTE.map((p) => <button key={p} type="button" className="size-5 rounded-full border border-white ring-1 ring-border" style={{ background: p }} onClick={() => setColor(p)} aria-label={p} />)}</div>
            </Field>
            <Button type="submit" loading={busy} disabled={!name.trim()} className="w-full">Add category</Button>
          </form>
        </Section>
        <div className="lg:col-span-2">
          {categories.length === 0 ? <EmptyState title="No categories yet" hint="Categories are created automatically when importing exhibitors with a category column." /> : (
            <Table>
              <thead><tr><Th className="w-24">Order</Th><Th>Name</Th><Th>Colour</Th><Th className="text-right">{event.exhibitors}</Th><Th className="w-32" /></tr></thead>
              <tbody>
                {categories.map((c, i) => (
                  <tr key={c.id} className="hover:bg-gray-50">
                    <Td>
                      <span className="inline-flex items-center gap-0.5">
                        <button type="button" className="rounded px-1 text-gray-500 hover:bg-gray-100 disabled:opacity-30" disabled={i === 0 || pending} onClick={() => move(i, -1)} aria-label="Move up">↑</button>
                        <button type="button" className="rounded px-1 text-gray-500 hover:bg-gray-100 disabled:opacity-30" disabled={i === categories.length - 1 || pending} onClick={() => move(i, 1)} aria-label="Move down">↓</button>
                        <span className="ml-1 text-xs tabular-nums text-gray-400">{i + 1}</span>
                      </span>
                    </Td>
                    <Td>
                      {editing?.id === c.id ? <Input value={editing.name} onChange={(e) => setEditing({ ...editing, name: e.target.value })} className="h-8" autoFocus onKeyDown={(e) => { if (e.key === "Enter") void save(); if (e.key === "Escape") setEditing(null); }} /> : (
                        <span className="font-medium">{c.parentId && byParent.get(c.parentId) ? <span className="text-gray-400">{byParent.get(c.parentId)} / </span> : null}{c.name}</span>
                      )}
                    </Td>
                    <Td>
                      {editing?.id === c.id ? <span className="inline-flex items-center gap-2"><input type="color" value={editing.color || "#999999"} onChange={(e) => setEditing({ ...editing, color: e.target.value })} className="h-8 w-10 cursor-pointer rounded border border-border" aria-label="Colour" /><Input value={editing.color} onChange={(e) => setEditing({ ...editing, color: e.target.value })} className="h-8 w-28 font-mono text-xs" /></span> : (
                        <span className="inline-flex items-center gap-2"><span className="size-4 rounded-full border border-border" style={{ background: c.color ?? "#e5e7eb" }} /><span className="font-mono text-xs text-gray-500">{c.color ?? "—"}</span></span>
                      )}
                    </Td>
                    <Td className="text-right tabular-nums">{c.exhibitorCount}</Td>
                    <Td className="text-right">
                      {editing?.id === c.id ? <span className="inline-flex gap-1"><Button size="sm" onClick={save}>Save</Button><Button size="sm" variant="ghost" onClick={() => setEditing(null)}>Cancel</Button></span> : (
                        <span className="inline-flex gap-1"><Button size="sm" variant="ghost" onClick={() => setEditing({ id: c.id, name: c.name, color: c.color ?? "" })}>Edit</Button><ConfirmButton variant="ghost" message={c.exhibitorCount ? `Remove from ${c.exhibitorCount} ${event.exhibitors.toLowerCase()}?` : "Delete?"} onConfirm={() => run(() => api(`${base}/categories/${c.id}`, { method: "DELETE" }), { success: "Deleted", onDone: refresh })}>Delete</ConfirmButton></span>
                      )}
                    </Td>
                  </tr>
                ))}
              </tbody>
            </Table>
          )}
        </div>
      </div>
    </>
  );
}

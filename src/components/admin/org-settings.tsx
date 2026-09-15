"use client";
import * as React from "react";
import Link from "next/link";
import { api, Badge, Button, Dialog, EmptyState, Field, Input, Select, Table, Td, Th } from "@/components/ui";
import { WEBHOOK_EVENTS, type WebhookEventType } from "@/lib/domain/types";
import { BRAND } from "@/lib/brand";
import { fmtDateTime } from "./lib";
import { Checkbox, ConfirmButton, CopyButton, Drawer, Notice, PageHeader, run, Section, Switch, useRefresh } from "./primitives";

export interface ApiKeyRow { id: string; name: string; prefix: string; scopes: string[]; lastUsedAt: string | null; createdAt: string; revokedAt: string | null }
export interface WebhookRow { id: string; url: string; eventId: string | null; events: string[]; active: boolean; createdAt: string; secretPreview: string }
export interface DeliveryRow { id: string; eventType: string; status: "pending" | "success" | "failed"; responseCode: number | null; attempts: number; lastError: string | null; nextAttemptAt: string | null; deliveredAt: string | null; createdAt: string; payload: unknown }
export interface EventRef { id: string; name: string }

export function OrgSettings({ orgName, apiKeys, webhooks, events, origin }: { orgName: string; apiKeys: ApiKeyRow[]; webhooks: WebhookRow[]; events: EventRef[]; origin: string }) {
  return (
    <>
      <PageHeader crumbs={[{ href: "/admin", label: "Events" }, { label: "Organisation settings" }]} title={orgName} subtitle="API access and outbound webhooks for every event in this organisation." actions={<Link href="/docs" className="inline-flex h-10 items-center rounded-lg border border-border bg-surface px-4 text-sm font-medium hover:bg-gray-50">Developer docs ↗</Link>} />
      <div className="space-y-6">
        <ApiKeys apiKeys={apiKeys} origin={origin} />
        <Webhooks webhooks={webhooks} events={events} origin={origin} />
      </div>
    </>
  );
}

function ApiKeys({ apiKeys, origin }: { apiKeys: ApiKeyRow[]; origin: string }) {
  const { refresh } = useRefresh();
  const [open, setOpen] = React.useState(false);
  const [name, setName] = React.useState("");
  const [scopes, setScopes] = React.useState<string[]>(["read", "write"]);
  const [busy, setBusy] = React.useState(false);
  const [created, setCreated] = React.useState<{ name: string; key: string } | null>(null);
  const create = async (e: React.FormEvent) => {
    e.preventDefault();
    setBusy(true);
    const r = await run(() => api<{ key: string; name: string }>("/api/v1/api-keys", { method: "POST", json: { name: name.trim(), scopes } }), { success: "API key created", onDone: refresh });
    setBusy(false);
    if (r) { setCreated({ name: r.name, key: r.key }); setName(""); setScopes(["read", "write"]); }
  };
  const active = apiKeys.filter((k) => !k.revokedAt), revoked = apiKeys.filter((k) => k.revokedAt);
  return (
    <Section title="API keys" description={<>Authenticate with <code className="font-mono text-xs">Authorization: Bearer {BRAND.apiKeyPrefix}_live_…</code> against <code className="font-mono text-xs">{origin}/api/v1</code>. Keys are shown once.</>} actions={<Button size="sm" onClick={() => { setCreated(null); setOpen(true); }}>Create key</Button>}>
      {apiKeys.length === 0 ? <EmptyState title="No API keys" hint="Create a key to read the floor plan from your website or push exhibitors from your CRM." /> : (
        <Table>
          <thead><tr><Th>Name</Th><Th>Key</Th><Th>Scopes</Th><Th>Last used</Th><Th>Created</Th><Th className="w-24" /></tr></thead>
          <tbody>
            {[...active, ...revoked].map((k) => (
              <tr key={k.id} className={k.revokedAt ? "text-gray-400" : "hover:bg-gray-50"}>
                <Td className="font-medium">{k.name}{k.revokedAt && <Badge tone="red" className="ml-2">revoked</Badge>}</Td>
                <Td><code className="font-mono text-xs">{k.prefix}…</code></Td>
                <Td><span className="flex gap-1">{k.scopes.map((s) => <Badge key={s} tone={s === "write" ? "blue" : "gray"}>{s}</Badge>)}</span></Td>
                <Td className="text-gray-600">{k.lastUsedAt ? fmtDateTime(k.lastUsedAt) : "never"}</Td>
                <Td className="text-gray-600">{fmtDateTime(k.createdAt)}</Td>
                <Td className="text-right">{!k.revokedAt && <ConfirmButton variant="ghost" message="Revoke? Integrations using it will stop working." onConfirm={() => run(() => api(`/api/v1/api-keys/${k.id}`, { method: "DELETE" }), { success: "Key revoked", onDone: refresh })}>Revoke</ConfirmButton>}</Td>
              </tr>
            ))}
          </tbody>
        </Table>
      )}
      <Dialog open={open} onClose={() => setOpen(false)} title={created ? "Copy your new API key" : "Create API key"}>
        {created ? (
          <div className="space-y-4">
            <Notice tone="warn">This is the only time the full key is shown. Store it in your secrets manager now.</Notice>
            <Field label={created.name}><div className="flex gap-2"><Input readOnly value={created.key} className="font-mono text-xs" onFocus={(e) => e.currentTarget.select()} /><CopyButton text={created.key} size="md" variant="primary" /></div></Field>
            <pre className="overflow-x-auto rounded-lg bg-gray-900 p-3 text-[11px] text-gray-100"><code>{`curl ${origin}/api/v1/events \\\n  -H "Authorization: Bearer ${created.key}"`}</code></pre>
            <div className="flex justify-end"><Button onClick={() => setOpen(false)}>Done</Button></div>
          </div>
        ) : (
          <form onSubmit={create} className="space-y-4">
            <Field label="Name" hint="Where the key is used, e.g. “Website”, “CRM sync”"><Input required value={name} onChange={(e) => setName(e.target.value)} autoFocus /></Field>
            <div><span className="mb-1 block text-xs font-medium uppercase tracking-wide text-gray-500">Scopes</span><div className="flex gap-4"><Checkbox checked={scopes.includes("read")} onChange={(v) => setScopes(v ? [...new Set([...scopes, "read"])] : scopes.filter((s) => s !== "read"))} label="read" /><Checkbox checked={scopes.includes("write")} onChange={(v) => setScopes(v ? [...new Set([...scopes, "write"])] : scopes.filter((s) => s !== "write"))} label="write" /></div></div>
            <div className="flex justify-end gap-2"><Button type="button" variant="ghost" onClick={() => setOpen(false)}>Cancel</Button><Button type="submit" loading={busy} disabled={!name.trim() || scopes.length === 0}>Create</Button></div>
          </form>
        )}
      </Dialog>
    </Section>
  );
}

function Webhooks({ webhooks, events, origin }: { webhooks: WebhookRow[]; events: EventRef[]; origin: string }) {
  const { refresh, pending } = useRefresh();
  const [open, setOpen] = React.useState(false);
  const [f, setF] = React.useState({ url: "", eventId: "", all: true, events: [] as WebhookEventType[] });
  const [busy, setBusy] = React.useState(false);
  const [created, setCreated] = React.useState<{ url: string; secret: string } | null>(null);
  const [testing, setTesting] = React.useState<string | null>(null);
  const [testResult, setTestResult] = React.useState<Record<string, DeliveryRow>>({});
  const [deliveriesFor, setDeliveriesFor] = React.useState<WebhookRow | null>(null);
  const eventName = React.useMemo(() => new Map(events.map((e) => [e.id, e.name])), [events]);
  const groups = React.useMemo(() => { const g = new Map<string, WebhookEventType[]>(); for (const e of WEBHOOK_EVENTS) { const k = e.split(".")[0]; g.set(k, [...(g.get(k) ?? []), e]); } return [...g.entries()]; }, []);
  const create = async (e: React.FormEvent) => {
    e.preventDefault();
    setBusy(true);
    const r = await run(() => api<{ url: string; secret: string }>("/api/v1/webhooks", { method: "POST", json: { url: f.url.trim(), eventId: f.eventId || null, events: f.all ? ["*"] : f.events } }), { success: "Webhook created", onDone: refresh });
    setBusy(false);
    if (r) { setCreated({ url: r.url, secret: r.secret }); setF({ url: "", eventId: "", all: true, events: [] }); }
  };
  const test = async (w: WebhookRow) => {
    setTesting(w.id);
    const r = await run(() => api<DeliveryRow>(`/api/v1/webhooks/${w.id}/test`, { method: "POST" }));
    if (r) { setTestResult((s) => ({ ...s, [w.id]: r })); }
    setTesting(null);
  };
  return (
    <Section title="Webhooks" description={<>POST JSON to your endpoint on booth, exhibitor, order, session and publish events. Verify <code className="font-mono text-xs">X-{BRAND.name}-Signature: t=&lt;unix&gt;,v1=HMAC-SHA256(secret, &quot;&lt;t&gt;.&lt;body&gt;&quot;)</code>. Failed deliveries retry 5× with backoff.</>} actions={<Button size="sm" onClick={() => { setCreated(null); setOpen(true); }}>Add webhook</Button>}>
      {webhooks.length === 0 ? <EmptyState title="No webhooks" hint="Add one to sync booth sales into your CRM or trigger a rebuild when the plan is published." /> : (
        <Table>
          <thead><tr><Th>Endpoint</Th><Th>Events</Th><Th>Scope</Th><Th>Active</Th><Th>Created</Th><Th className="w-56" /></tr></thead>
          <tbody>
            {webhooks.map((w) => {
              const tr = testResult[w.id];
              return (
                <tr key={w.id} className="hover:bg-gray-50">
                  <Td><code className="block max-w-xs truncate font-mono text-xs" title={w.url}>{w.url}</code><span className="text-xs text-gray-400">secret {w.secretPreview}</span>{tr && <span className={`block text-xs ${tr.status === "success" ? "text-green-700" : "text-red-700"}`}>Test: {tr.status}{tr.responseCode ? ` (HTTP ${tr.responseCode})` : ""}{tr.lastError ? ` — ${tr.lastError}` : ""}</span>}</Td>
                  <Td>{w.events.includes("*") ? <Badge tone="blue">all events</Badge> : <span className="flex max-w-xs flex-wrap gap-1">{w.events.slice(0, 4).map((e) => <Badge key={e}>{e}</Badge>)}{w.events.length > 4 && <span className="text-xs text-gray-500">+{w.events.length - 4}</span>}</span>}</Td>
                  <Td className="text-gray-600">{w.eventId ? eventName.get(w.eventId) ?? w.eventId : "Organisation"}</Td>
                  <Td><Switch checked={w.active} onChange={(v) => run(() => api(`/api/v1/webhooks/${w.id}`, { method: "PATCH", json: { active: v } }), { success: v ? "Enabled" : "Paused", onDone: refresh })} /></Td>
                  <Td className="text-gray-600">{fmtDateTime(w.createdAt)}</Td>
                  <Td className="text-right"><span className="inline-flex gap-1"><Button size="sm" variant="outline" loading={testing === w.id} onClick={() => test(w)}>Test</Button><Button size="sm" variant="ghost" onClick={() => setDeliveriesFor(w)}>Deliveries</Button><ConfirmButton variant="ghost" onConfirm={() => run(() => api(`/api/v1/webhooks/${w.id}`, { method: "DELETE" }), { success: "Webhook deleted", onDone: refresh })}>Delete</ConfirmButton></span></Td>
                </tr>
              );
            })}
          </tbody>
        </Table>
      )}
      {pending && <p className="mt-2 text-xs text-gray-500">Refreshing…</p>}
      <Dialog open={open} onClose={() => setOpen(false)} title={created ? "Webhook created" : "Add webhook"} wide>
        {created ? (
          <div className="space-y-4">
            <Notice tone="warn">Copy the signing secret now — it is not shown again.</Notice>
            <Field label="Endpoint"><Input readOnly value={created.url} className="font-mono text-xs" /></Field>
            <Field label="Signing secret"><div className="flex gap-2"><Input readOnly value={created.secret} className="font-mono text-xs" onFocus={(e) => e.currentTarget.select()} /><CopyButton text={created.secret} size="md" variant="primary" /></div></Field>
            <pre className="overflow-x-auto rounded-lg bg-gray-900 p-3 text-[11px] text-gray-100"><code>{`// Node\nconst [t, v1] = sig.split(",").map((p) => p.split("=")[1]);\nconst expected = crypto.createHmac("sha256", SECRET).update(\`\${t}.\${rawBody}\`).digest("hex");\ncrypto.timingSafeEqual(Buffer.from(expected), Buffer.from(v1));`}</code></pre>
            <div className="flex justify-end"><Button onClick={() => setOpen(false)}>Done</Button></div>
          </div>
        ) : (
          <form onSubmit={create} className="space-y-4">
            <Field label="Endpoint URL"><Input required type="url" value={f.url} onChange={(e) => setF({ ...f, url: e.target.value })} placeholder="https://example.com/hooks/tessera" autoFocus /></Field>
            <Field label="Scope"><Select value={f.eventId} onChange={(e) => setF({ ...f, eventId: e.target.value })}><option value="">All events in the organisation</option>{events.map((e) => <option key={e.id} value={e.id}>{e.name}</option>)}</Select></Field>
            <div>
              <div className="mb-2 flex items-center justify-between"><span className="text-xs font-medium uppercase tracking-wide text-gray-500">Event types</span><Switch checked={f.all} onChange={(v) => setF({ ...f, all: v })} label="All event types" /></div>
              {!f.all && (
                <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
                  {groups.map(([g, list]) => (
                    <div key={g} className="rounded-lg border border-border p-3">
                      <div className="mb-1 flex items-center justify-between"><span className="text-xs font-semibold capitalize">{g}</span><button type="button" className="text-xs text-primary hover:underline" onClick={() => setF({ ...f, events: list.every((e) => f.events.includes(e)) ? f.events.filter((e) => !list.includes(e)) : [...new Set([...f.events, ...list])] })}>{list.every((e) => f.events.includes(e)) ? "none" : "all"}</button></div>
                      <div className="space-y-1">{list.map((e) => <Checkbox key={e} checked={f.events.includes(e)} onChange={(v) => setF({ ...f, events: v ? [...f.events, e] : f.events.filter((x) => x !== e) })} label={<span className="font-mono text-xs">{e}</span>} />)}</div>
                    </div>
                  ))}
                </div>
              )}
            </div>
            <div className="flex justify-end gap-2"><Button type="button" variant="ghost" onClick={() => setOpen(false)}>Cancel</Button><Button type="submit" loading={busy} disabled={!f.url.trim() || (!f.all && f.events.length === 0)}>Create webhook</Button></div>
          </form>
        )}
      </Dialog>
      {deliveriesFor && <DeliveriesDrawer webhook={deliveriesFor} onClose={() => setDeliveriesFor(null)} />}
      <p className="mt-3 text-xs text-gray-500">Stuck deliveries can be flushed with <code className="font-mono">POST {origin}/api/v1/webhooks/process</code> (e.g. from a cron).</p>
    </Section>
  );
}

function DeliveriesDrawer({ webhook, onClose }: { webhook: WebhookRow; onClose: () => void }) {
  const [rows, setRows] = React.useState<DeliveryRow[] | null>(null);
  const [error, setError] = React.useState<string | null>(null);
  const [openId, setOpenId] = React.useState<string | null>(null);
  const load = React.useCallback(() => { setRows(null); api<DeliveryRow[]>(`/api/v1/webhooks/${webhook.id}/deliveries`).then(setRows).catch((e) => setError(e instanceof Error ? e.message : "Failed to load")); }, [webhook.id]);
  React.useEffect(() => { load(); }, [load]);
  const tone = { success: "green", failed: "red", pending: "yellow" } as const;
  return (
    <Drawer open onClose={onClose} title={<span className="truncate">Deliveries · <code className="font-mono text-xs">{webhook.url}</code></span>} wide footer={<><Button variant="outline" onClick={load}>Reload</Button><Button variant="ghost" onClick={onClose}>Close</Button></>}>
      {error ? <Notice tone="error">{error}</Notice> : rows === null ? <p className="text-sm text-gray-500">Loading…</p> : rows.length === 0 ? <EmptyState title="No deliveries yet" hint="Send a test or trigger an event." /> : (
        <ul className="divide-y divide-border rounded-lg border border-border">
          {rows.map((d) => (
            <li key={d.id} className="px-3 py-2 text-sm">
              <button type="button" className="flex w-full items-center gap-3 text-left" onClick={() => setOpenId(openId === d.id ? null : d.id)}>
                <Badge tone={tone[d.status]}>{d.status}</Badge>
                <span className="font-mono text-xs">{d.eventType}</span>
                <span className="ml-auto text-xs text-gray-500">{d.responseCode ? `HTTP ${d.responseCode} · ` : ""}{d.attempts} attempt{d.attempts === 1 ? "" : "s"} · {fmtDateTime(d.createdAt)}</span>
              </button>
              {d.lastError && <p className="mt-1 text-xs text-red-700">{d.lastError}{d.status === "pending" && d.nextAttemptAt ? ` · retry ${fmtDateTime(d.nextAttemptAt)}` : ""}</p>}
              {openId === d.id && <pre className="mt-2 max-h-64 overflow-auto rounded-lg bg-gray-900 p-3 text-[11px] text-gray-100"><code>{JSON.stringify(d.payload, null, 2)}</code></pre>}
            </li>
          ))}
        </ul>
      )}
    </Drawer>
  );
}

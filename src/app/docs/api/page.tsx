import { OPENAPI_OPS } from "@/lib/api/openapi";
import { H1, H2, P, Code, Inline } from "../_ui";

export const metadata = { title: "REST API" };

export default function ApiDocs() {
  const groups = new Map<string, { path: string; method: string; summary: string; body?: string; query?: Record<string, string>; pub?: boolean; description?: string }[]>();
  for (const [path, methods] of Object.entries(OPENAPI_OPS)) for (const [method, op] of Object.entries(methods)) {
    if (!op) continue;
    const tag = op.tags[0];
    if (!groups.has(tag)) groups.set(tag, []);
    groups.get(tag)!.push({ path, method: method.toUpperCase(), summary: op.summary, body: op.body, query: op.query, pub: op.public, description: op.description });
  }
  return (
    <>
      <H1>REST API</H1>
      <P>Base path <Inline>/api/v1</Inline>. Authenticate with <Inline>Authorization: Bearer &lt;key&gt;</Inline> or <Inline>X-Api-Key</Inline>; the organiser session cookie also works for same-origin calls. Responses are <Inline>&#123; data, meta? &#125;</Inline> or <Inline>&#123; error: &#123; code, message, details? &#125; &#125;</Inline>. Event ids accept the slug. Machine-readable spec: <a className="text-primary underline" href="/api/v1/openapi.json">/api/v1/openapi.json</a>.</P>
      <Code lang="bash">{`KEY=tsr_live_demo_9f3b1c7e2a4d6f8b0c1d2e3f4a5b6c7d
# Bulk upsert booths from a CSV export of your CAD tool
curl -X POST -H "Authorization: Bearer $KEY" -F file=@booths.csv http://localhost:3000/api/v1/events/grip-connect-2026/booths/import
# Put a booth on hold for 2 hours
curl -X POST -H "Authorization: Bearer $KEY" -H "Content-Type: application/json" -d '{"status":"held","holdMinutes":120}' \\
  http://localhost:3000/api/v1/events/grip-connect-2026/booths/A101/status
# Route between two booths (public)
curl "http://localhost:3000/api/v1/events/grip-connect-2026/route?from=booth:A101&to=booth:T05&accessible=1"`}</Code>
      {[...groups.entries()].map(([tag, ops]) => (
        <section key={tag}>
          <H2 id={tag.toLowerCase()}>{tag}</H2>
          <div className="mb-6 divide-y divide-border rounded-xl border border-border">
            {ops.map((o) => (
              <div key={o.method + o.path} className="px-3 py-2 text-sm">
                <div className="flex flex-wrap items-center gap-2"><span className={`rounded px-1.5 py-0.5 font-mono text-xs font-semibold ${o.method === "GET" ? "bg-green-100 text-green-800" : o.method === "DELETE" ? "bg-red-100 text-red-800" : "bg-blue-100 text-blue-800"}`}>{o.method}</span><code className="font-mono text-xs">{o.path}</code>{o.pub && <span className="rounded bg-gray-100 px-1.5 text-xs text-gray-600">public</span>}</div>
                <p className="mt-1 text-gray-700">{o.summary}</p>
                {o.description && <p className="mt-1 text-xs text-gray-500">{o.description}</p>}
                {o.body && <p className="mt-1 text-xs text-gray-500">Body: <code>{o.body}</code></p>}
                {o.query && Object.keys(o.query).length > 0 && <p className="mt-1 text-xs text-gray-500">Query: {Object.entries(o.query).map(([k, v]) => <span key={k} className="mr-2"><code>{k}</code>{v ? ` (${v})` : ""}</span>)}</p>}
              </div>
            ))}
          </div>
        </section>
      ))}
    </>
  );
}

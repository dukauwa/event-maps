export function H1({ children }: { children: React.ReactNode }) { return <h1 className="mb-2 text-3xl font-semibold tracking-tight">{children}</h1>; }
export function H2({ children, id }: { children: React.ReactNode; id?: string }) { return <h2 id={id} className="mb-3 mt-10 text-xl font-semibold">{children}</h2>; }
export function P({ children }: { children: React.ReactNode }) { return <p className="mb-4 max-w-3xl text-sm leading-6 text-gray-700">{children}</p>; }
export function Code({ children, lang }: { children: string; lang?: string }) { return <pre className="mb-4 overflow-x-auto rounded-xl border border-border bg-gray-950 p-4 text-xs leading-5 text-gray-100" data-lang={lang}><code>{children}</code></pre>; }
export function Inline({ children }: { children: React.ReactNode }) { return <code className="rounded bg-gray-100 px-1 py-0.5 text-[0.85em] text-gray-900">{children}</code>; }
export function Table({ rows, head }: { head: string[]; rows: (React.ReactNode)[][] }) {
  return <div className="mb-6 overflow-x-auto rounded-xl border border-border"><table className="w-full text-sm"><thead className="bg-gray-50"><tr>{head.map((h) => <th key={h} className="px-3 py-2 text-left text-xs font-semibold uppercase text-gray-500">{h}</th>)}</tr></thead><tbody>{rows.map((r, i) => <tr key={i} className="border-t border-border align-top">{r.map((c, j) => <td key={j} className="px-3 py-2">{c}</td>)}</tr>)}</tbody></table></div>;
}

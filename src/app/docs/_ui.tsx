export function H1({ children }: { children: React.ReactNode }) { return <h1 className="mb-3 text-[32px] font-semibold leading-tight tracking-[-0.025em] text-gray-900">{children}</h1>; }
export function H2({ children, id }: { children: React.ReactNode; id?: string }) { return <h2 id={id} className="mb-3 mt-12 scroll-mt-24 text-xl font-semibold tracking-[-0.015em] text-gray-900">{children}</h2>; }
export function P({ children }: { children: React.ReactNode }) { return <p className="mb-4 max-w-3xl text-[15px] leading-7 text-gray-700">{children}</p>; }
export function Code({ children, lang }: { children: string; lang?: string }) { return <pre className="mb-5 overflow-x-auto rounded-xl border border-gray-800 bg-[#0f1219] p-4 font-mono text-[12.5px] leading-6 text-gray-100" data-lang={lang}><code>{children}</code></pre>; }
export function Inline({ children }: { children: React.ReactNode }) { return <code className="rounded-md border border-border bg-subtle px-1.5 py-0.5 font-mono text-[0.85em] text-gray-900">{children}</code>; }
export function Table({ rows, head }: { head: string[]; rows: (React.ReactNode)[][] }) {
  return <div className="mb-6 overflow-x-auto rounded-xl border border-border"><table className="w-full text-sm"><thead className="bg-subtle"><tr>{head.map((h) => <th key={h} className="h-10 px-4 text-left text-xs font-medium text-gray-500">{h}</th>)}</tr></thead><tbody>{rows.map((r, i) => <tr key={i} className="border-t border-border align-top">{r.map((c, j) => <td key={j} className="px-4 py-2.5 text-gray-800">{c}</td>)}</tr>)}</tbody></table></div>;
}

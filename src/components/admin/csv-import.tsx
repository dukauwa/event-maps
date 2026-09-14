"use client";
import * as React from "react";
import { api, Button, Dialog, Textarea } from "@/components/ui";
import { Notice } from "./primitives";

export interface ImportResult { parsed?: number; created: number; updated: number; errors: { index: number; error: string }[] }

export function CsvImportDialog({ open, onClose, endpoint, title, columns, sample, onImported }: { open: boolean; onClose: () => void; endpoint: string; title: string; columns: string; sample?: string; onImported?: (r: ImportResult) => void }) {
  const [csv, setCsv] = React.useState("");
  const [busy, setBusy] = React.useState(false);
  const [result, setResult] = React.useState<ImportResult | null>(null);
  const [error, setError] = React.useState<string | null>(null);
  React.useEffect(() => { if (open) { setCsv(""); setResult(null); setError(null); } }, [open]);
  const submit = async () => {
    setBusy(true); setError(null);
    try {
      const r = await api<ImportResult>(endpoint, { method: "POST", json: { csv } });
      setResult(r);
      onImported?.(r);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Import failed");
    } finally {
      setBusy(false);
    }
  };
  return (
    <Dialog open={open} onClose={onClose} title={title} wide>
      <div className="space-y-4">
        <p className="text-sm text-gray-600">Paste CSV or choose a file. Rows are matched to existing records (by external id, then label/name) and updated; new rows are created. Comma, semicolon and tab delimiters are detected.</p>
        <p className="rounded-lg bg-gray-50 px-3 py-2 font-mono text-xs text-gray-700">Columns: {columns}</p>
        <label className="inline-flex h-9 cursor-pointer items-center rounded-lg border border-border bg-surface px-3 text-sm font-medium hover:bg-gray-50">
          Choose CSV file
          <input type="file" accept=".csv,text/csv,.txt" className="hidden" onChange={async (e) => { const f = e.target.files?.[0]; if (f) setCsv(await f.text()); e.target.value = ""; }} />
        </label>
        <Textarea value={csv} onChange={(e) => setCsv(e.target.value)} placeholder={sample ?? "label,level,x,y,width,height"} className="min-h-40 font-mono text-xs" spellCheck={false} />
        {error && <Notice tone="error">{error}</Notice>}
        {result && (
          <Notice tone={result.errors.length ? "warn" : "success"}>
            <p className="font-medium">{result.parsed != null ? `${result.parsed} rows parsed · ` : ""}{result.created} created · {result.updated} updated · {result.errors.length} errors</p>
            {result.errors.length > 0 && (
              <ul className="mt-2 max-h-40 list-inside list-disc overflow-y-auto text-xs">
                {result.errors.slice(0, 50).map((e, i) => <li key={i}>Row {e.index + 2}: {e.error}</li>)}
                {result.errors.length > 50 && <li>… and {result.errors.length - 50} more</li>}
              </ul>
            )}
          </Notice>
        )}
        <div className="flex justify-end gap-2">
          <Button variant="ghost" onClick={onClose}>{result ? "Close" : "Cancel"}</Button>
          <Button onClick={submit} loading={busy} disabled={!csv.trim()}>Import</Button>
        </div>
      </div>
    </Dialog>
  );
}

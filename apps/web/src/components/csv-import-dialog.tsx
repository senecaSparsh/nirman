"use client";

import { useState, useRef } from "react";
import { Upload, FileSpreadsheet, X, CheckCircle2, AlertCircle, Download } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/input";
import { toast } from "sonner";
import { cn } from "@/lib/utils";

type ImportResult = {
  created: number;
  skipped: number;
  errors: { row: number; error: string }[];
};

/**
 * Generic CSV Import Dialog — used for suppliers and customers.
 *
 * Props:
 *   endpoint — API URL to PUT the items to (e.g. "/api/suppliers")
 *   entityName — "Supplier" | "Customer" (for labels)
 *   templateHeaders — CSV header string for the template download
 *   templateSample — Sample row for the template
 *   fieldMap — Maps CSV row keys to API payload keys
 *   numericFields — Fields that should be converted to numbers
 */
export function GenericCsvImportDialog({
  open,
  onClose,
  endpoint,
  entityName,
  templateHeaders,
  templateSample,
  fieldMap,
  numericFields = [],
  onSuccess,
}: {
  open: boolean;
  onClose: () => void;
  endpoint: string;
  entityName: string;
  templateHeaders: string;
  templateSample: string;
  fieldMap: Record<string, string>;
  numericFields?: string[];
  onSuccess: () => void;
}) {
  const [file, setFile] = useState<File | null>(null);
  const [preview, setPreview] = useState<Record<string, string>[]>([]);
  const [importing, setImporting] = useState(false);
  const [result, setResult] = useState<ImportResult | null>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);

  if (!open) return null;

  function parseCsv(text: string): Record<string, string>[] {
    // Proper CSV parser — handles quoted fields with embedded commas,
    // newlines inside quotes, and escaped double-quotes ("").
    const rows: string[][] = [];
    let current: string[] = [];
    let field = "";
    let inQuotes = false;
    let i = 0;
    while (i < text.length) {
      const ch = text[i];
      if (inQuotes) {
        if (ch === '"') {
          if (text[i + 1] === '"') {
            field += '"';
            i += 2;
            continue;
          }
          inQuotes = false;
          i++;
          continue;
        }
        field += ch;
        i++;
        continue;
      }
      if (ch === '"') {
        inQuotes = true;
        i++;
        continue;
      }
      if (ch === ",") {
        current.push(field);
        field = "";
        i++;
        continue;
      }
      if (ch === "\r") {
        i++;
        continue;
      }
      if (ch === "\n") {
        current.push(field);
        rows.push(current);
        current = [];
        field = "";
        i++;
        continue;
      }
      field += ch;
      i++;
    }
    // Last field/row
    if (field.length > 0 || current.length > 0) {
      current.push(field);
      rows.push(current);
    }
    if (rows.length < 2) return [];
    const headers = rows[0]!.map((h) => h.trim());
    const result: Record<string, string>[] = [];
    for (let r = 1; r < rows.length; r++) {
      const values = rows[r]!;
      if (values.length === 1 && !values[0]) continue;
      const row: Record<string, string> = {};
      headers.forEach((h, idx) => {
        row[h] = (values[idx] ?? "").trim();
      });
      result.push(row);
    }
    return result;
  }

  function handleFileSelect(e: React.ChangeEvent<HTMLInputElement>) {
    const f = e.target.files?.[0];
    if (!f) return;
    setFile(f);
    setResult(null);
    const reader = new FileReader();
    reader.onload = () => {
      const text = reader.result as string;
      const parsed = parseCsv(text);
      setPreview(parsed);
      if (parsed.length === 0) {
        toast.error("No data rows found in CSV");
      }
    };
    reader.readAsText(f);
  }

  function downloadTemplate() {
    const csv = `${templateHeaders}\n${templateSample}`;
    const blob = new Blob([csv], { type: "text/csv" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = `${entityName.toLowerCase()}s-template.csv`;
    a.click();
    URL.revokeObjectURL(url);
  }

  async function importData() {
    if (preview.length === 0) {
      toast.error("No data to import");
      return;
    }

    // Map CSV rows to API payload using fieldMap
    const items = preview.map((row) => {
      const item: Record<string, string | number | null> = {};
      for (const [csvKey, apiKey] of Object.entries(fieldMap)) {
        const raw = row[csvKey] ?? "";
        if (numericFields.includes(apiKey)) {
          item[apiKey] = raw ? Number(raw) : null;
        } else {
          item[apiKey] = raw || null;
        }
      }
      return item;
    });

    setImporting(true);
    try {
      const res = await fetch(endpoint, {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ items }),
      });
      const data: ImportResult = await res.json();
      if (!res.ok) throw new Error("Import failed");
      setResult(data);
      if (data.created > 0) {
        toast.success(`Imported ${data.created} ${entityName.toLowerCase()}s`);
        onSuccess();
      }
      if (data.errors.length > 0) {
        toast.warning(`${data.errors.length} rows had errors`);
      }
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Import failed");
    } finally {
      setImporting(false);
    }
  }

  function reset() {
    setFile(null);
    setPreview([]);
    setResult(null);
    if (fileInputRef.current) fileInputRef.current.value = "";
  }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-4" onClick={onClose}>
      <div
        className="max-h-[90vh] w-full max-w-2xl overflow-y-auto rounded-lg border border-border bg-card shadow-xl"
        onClick={(e) => e.stopPropagation()}
      >
        {/* Header */}
        <div className="flex items-center justify-between border-b border-border px-5 py-3">
          <div className="flex items-center gap-2">
            <FileSpreadsheet className="h-5 w-5 text-brand" />
            <h2 className="text-body font-semibold">Import {entityName}s from CSV</h2>
          </div>
          <button onClick={onClose} className="rounded-md p-1 text-muted-foreground hover:text-foreground">
            <X className="h-5 w-5" />
          </button>
        </div>

        <div className="space-y-4 p-5">
          {/* Template download */}
          <div className="flex items-center justify-between rounded-lg border border-border bg-subtle/50 p-3">
            <div>
              <div className="text-body font-medium">Need a template?</div>
              <div className="text-caption text-muted-foreground">
                Download the CSV template with sample data
              </div>
            </div>
            <Button variant="outline" size="sm" onClick={downloadTemplate}>
              <Download className="mr-1.5 h-3.5 w-3.5" /> Template
            </Button>
          </div>

          {/* File upload */}
          <div>
            <Label>CSV File</Label>
            <div
              className={cn(
                "mt-1 flex items-center justify-center rounded-lg border-2 border-dashed p-6 transition-colors",
                file ? "border-success/40 bg-success/5" : "border-border hover:border-brand/40",
              )}
            >
              <input
                ref={fileInputRef}
                type="file"
                accept=".csv,text/csv"
                onChange={handleFileSelect}
                className="hidden"
                id="csv-file-input"
              />
              <label htmlFor="csv-file-input" className="cursor-pointer text-center">
                {file ? (
                  <div className="flex flex-col items-center gap-1">
                    <CheckCircle2 className="h-6 w-6 text-success" />
                    <span className="text-body font-medium">{file.name}</span>
                    <span className="text-caption text-muted-foreground">{preview.length} rows parsed</span>
                  </div>
                ) : (
                  <div className="flex flex-col items-center gap-1">
                    <Upload className="h-6 w-6 text-muted-foreground" />
                    <span className="text-body font-medium">Click to select CSV file</span>
                    <span className="text-caption text-muted-foreground">.csv format, max 500 rows</span>
                  </div>
                )}
              </label>
            </div>
          </div>

          {/* Preview */}
          {preview.length > 0 && !result && (
            <div>
              <Label>Preview ({preview.length} rows)</Label>
              <div className="mt-1 max-h-48 overflow-y-auto rounded-lg border border-border">
                <table className="w-full text-caption">
                  <thead className="sticky top-0 bg-subtle">
                    <tr>
                      {Object.keys(preview[0] ?? {}).map((h) => (
                        <th key={h} className="px-2 py-1 text-left font-medium text-muted-foreground">{h}</th>
                      ))}
                    </tr>
                  </thead>
                  <tbody>
                    {preview.slice(0, 10).map((row, i) => (
                      <tr key={i} className="border-t border-border/50">
                        {Object.values(row).map((v, j) => (
                          <td key={j} className="px-2 py-1">{v}</td>
                        ))}
                      </tr>
                    ))}
                  </tbody>
                </table>
                {preview.length > 10 && (
                  <div className="border-t border-border/50 px-2 py-1 text-caption text-muted-foreground">
                    … and {preview.length - 10} more rows
                  </div>
                )}
              </div>
            </div>
          )}

          {/* Result */}
          {result && (
            <div className="space-y-3 rounded-lg border border-border bg-subtle/30 p-4">
              <div className="flex items-center gap-2 text-body font-semibold">
                <CheckCircle2 className="h-5 w-5 text-success" />
                Import Complete
              </div>
              <div className="grid grid-cols-3 gap-3">
                <div className="rounded-md border border-success/30 bg-success/5 p-2 text-center">
                  <div className="text-h3 font-bold text-success">{result.created}</div>
                  <div className="text-micro text-muted-foreground">Created</div>
                </div>
                <div className="rounded-md border border-warning/30 bg-warning/5 p-2 text-center">
                  <div className="text-h3 font-bold text-warning">{result.skipped}</div>
                  <div className="text-micro text-muted-foreground">Skipped (duplicates)</div>
                </div>
                <div className="rounded-md border border-danger/30 bg-danger/5 p-2 text-center">
                  <div className="text-h3 font-bold text-danger">{result.errors.length}</div>
                  <div className="text-micro text-muted-foreground">Errors</div>
                </div>
              </div>
              {result.errors.length > 0 && (
                <div className="max-h-32 overflow-y-auto rounded-md border border-border bg-card p-2">
                  {result.errors.slice(0, 20).map((e, i) => (
                    <div key={i} className="flex items-start gap-1.5 py-0.5 text-caption">
                      <AlertCircle className="mt-0.5 h-3 w-3 shrink-0 text-danger" />
                      <span className="text-muted-foreground">Row {e.row}:</span>
                      <span>{e.error}</span>
                    </div>
                  ))}
                  {result.errors.length > 20 && (
                    <div className="py-0.5 text-caption text-muted-foreground">
                      … and {result.errors.length - 20} more errors
                    </div>
                  )}
                </div>
              )}
              <Button variant="outline" size="sm" onClick={reset}>
                Import another file
              </Button>
            </div>
          )}

          {/* Actions */}
          {!result && (
            <div className="flex justify-end gap-2 border-t border-border pt-4">
              <Button variant="outline" onClick={onClose}>Cancel</Button>
              <Button onClick={importData} disabled={preview.length === 0 || importing}>
                {importing ? (
                  <>
                    <Upload className="mr-1.5 h-3.5 w-3.5 animate-pulse" /> Importing…
                  </>
                ) : (
                  <>
                    <Upload className="mr-1.5 h-3.5 w-3.5" /> Import {preview.length} {entityName.toLowerCase()}s
                  </>
                )}
              </Button>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}

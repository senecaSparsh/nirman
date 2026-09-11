"use client";

import { useState, useRef } from "react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Loader2, Upload, RefreshCw, Database, Zap } from "lucide-react";

/**
 * HSN/GST Master Admin Panel.
 *
 * Three ways to keep the HSN/GST master in sync with government rates:
 *
 * 1. **Sync from baseline** — re-seeds the DB from the bundled JSON file
 *    (`packages/services/data/hsn-gst-master.json`). The JSON is kept
 *    in sync with the `hsn-code-package` npm package (12,604 HSN codes
 *    from CBIC Notification 09/2025-CT(Rate)).
 *
 * 2. **Import CSV** — upload a CSV downloaded from gst.gov.in / CBIC.
 *    The system parses and upserts all entries directly into the DB.
 *    No deploy needed. Format: hsnCode,description,gstRate[,category][,sacCode]
 *
 * 3. **Auto-sync** — if `GSTA_API_KEY` is set, the system auto-fetches
 *    unknown HSN codes from the gstaccelerator.in API in real-time and
 *    caches them in the DB. The weekly cron re-seeds from the bundled
 *    JSON automatically.
 *
 * All paths are admin/manager only (enforced server-side).
 */
export function HsnMasterAdmin() {
  const [seeding, setSeeding] = useState(false);
  const [importing, setImporting] = useState(false);
  const [importResult, setImportResult] = useState<string | null>(null);
  const fileRef = useRef<HTMLInputElement>(null);

  async function handleSeed() {
    setSeeding(true);
    setImportResult(null);
    try {
      const res = await fetch("/api/hsn-gst", { method: "PUT" });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error ?? "Failed to seed");
      toast.success(`Seeded ${data.seeded} HSN/GST entries`);
      setImportResult(`Seeded ${data.seeded} entries from bundled JSON.`);
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Unknown error");
    } finally {
      setSeeding(false);
    }
  }

  async function handleImportCsv(file: File) {
    setImporting(true);
    setImportResult(null);
    try {
      const text = await file.text();
      const res = await fetch("/api/hsn-gst/import", {
        method: "POST",
        headers: { "Content-Type": "text/csv" },
        body: text,
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error ?? "Failed to import");
      toast.success(`Imported ${data.imported} HSN/GST entries`);
      setImportResult(`Imported ${data.imported} entries from ${file.name}.`);
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Unknown error");
    } finally {
      setImporting(false);
      if (fileRef.current) fileRef.current.value = "";
    }
  }

  return (
    <div className="rounded-lg border p-6 space-y-4">
      <div className="flex items-center gap-2">
        <Database className="size-5 text-muted-foreground" />
        <h3 className="text-lg font-semibold">HSN/GST Master</h3>
      </div>
      <p className="text-sm text-muted-foreground">
        The HSN/GST master is sourced from the
        <code className="mx-1 px-1 py-0.5 rounded bg-muted text-xs">hsn-code-package</code>
        npm package (12,604 HSN codes + 496 SAC codes from CBIC Notification 09/2025-CT(Rate)).
        Categories link to specific HSN codes so selecting a category auto-fills HSN + GST.
        A weekly cron auto-reseeds the DB. Import a CBIC CSV for manual overrides.
      </p>

      {/* Sync from baseline */}
      <div className="space-y-2">
        <div className="flex items-center justify-between">
          <div>
            <p className="text-sm font-medium">Sync from bundled baseline</p>
            <p className="text-xs text-muted-foreground">
              Re-seeds the DB from the JSON file in the repo (12,604+ entries).
              Run after <code className="mx-1 px-1 py-0.5 rounded bg-muted text-xs">{"pnpm hsn:auto-sync"}</code>
              + deploy, or use the weekly cron.
            </p>
          </div>
          <Button onClick={handleSeed} disabled={seeding} variant="outline" size="sm">
            {seeding ? <Loader2 className="size-4 animate-spin" /> : <RefreshCw className="size-4" />}
            Sync
          </Button>
        </div>
      </div>

      <div className="border-t" />

      {/* CSV import */}
      <div className="space-y-2">
        <div className="flex items-center justify-between">
          <div>
            <p className="text-sm font-medium">Import CBIC CSV</p>
            <p className="text-xs text-muted-foreground">
              Download a CSV from gst.gov.in, then upload it here. Format:
              <code className="mx-1 px-1 py-0.5 rounded bg-muted text-xs">hsnCode,description,gstRate</code>
            </p>
          </div>
          <div>
            <Input
              ref={fileRef}
              type="file"
              accept=".csv,text/csv"
              className="hidden"
              onChange={(e) => {
                const file = e.target.files?.[0];
                if (file) handleImportCsv(file);
              }}
            />
            <Button
              onClick={() => fileRef.current?.click()}
              disabled={importing}
              variant="outline"
              size="sm"
            >
              {importing ? <Loader2 className="size-4 animate-spin" /> : <Upload className="size-4" />}
              Upload CSV
            </Button>
          </div>
        </div>
      </div>

      <div className="border-t" />

      {/* Auto-sync info */}
      <div className="space-y-2">
        <div className="flex items-center gap-2">
          <Zap className="size-4 text-muted-foreground" />
          <div>
            <p className="text-sm font-medium">Auto-sync (API fallback)</p>
            <p className="text-xs text-muted-foreground">
              If <code className="mx-1 px-1 py-0.5 rounded bg-muted text-xs">GSTA_API_KEY</code> is set,
              unknown HSN codes are auto-fetched from gstaccelerator.in and cached in the DB.
              A weekly cron (Mondays 3am UTC) re-seeds from the bundled JSON.
              No manual action needed.
            </p>
          </div>
        </div>
      </div>

      {importResult && (
        <div className="rounded-md bg-muted p-3 text-sm">
          {importResult}
        </div>
      )}
    </div>
  );
}

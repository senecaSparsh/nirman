"use client";

import { useState, useRef } from "react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
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
    <Card>
      <CardHeader divided>
        <CardTitle className="flex items-center gap-2">
          <Database className="size-4 text-muted-foreground" />
          HSN / GST Master
        </CardTitle>
        <CardDescription>
          Sourced from the <code className="rounded bg-muted px-1 py-0.5 text-caption">hsn-code-package</code> baseline
          (12,604 HSN + 496 SAC codes from CBIC Notification 09/2025-CT(Rate)). Categories link to HSN codes to auto-fill GST.
        </CardDescription>
      </CardHeader>
      <CardContent className="space-y-4">
        <div className="grid gap-4 sm:grid-cols-2">
          {/* Sync from baseline */}
          <div className="flex flex-col justify-between gap-3 rounded-lg border border-border bg-subtle/30 p-3.5">
            <div>
              <p className="text-body font-medium text-foreground">Sync from bundled baseline</p>
              <p className="mt-0.5 text-caption text-muted-foreground">
                Re-seeds the database from the bundled JSON baseline (12,604+ entries). Also runs automatically via weekly cron.
              </p>
            </div>
            <div className="flex justify-end">
              <Button onClick={handleSeed} disabled={seeding} variant="outline" size="sm">
                {seeding ? <Loader2 className="size-3.5 animate-spin" /> : <RefreshCw className="size-3.5" />}
                Sync Baseline
              </Button>
            </div>
          </div>

          {/* CSV import */}
          <div className="flex flex-col justify-between gap-3 rounded-lg border border-border bg-subtle/30 p-3.5">
            <div>
              <p className="text-body font-medium text-foreground">Import CBIC CSV</p>
              <p className="mt-0.5 text-caption text-muted-foreground">
                Upload a CSV from gst.gov.in for manual overrides. Format: <code className="rounded bg-muted px-1 py-0.5 text-micro">hsnCode,description,gstRate</code>
              </p>
            </div>
            <div className="flex justify-end">
              <Input
                ref={fileRef}
                type="file"
                accept=".csv,text/csv"
                className="hidden"
                aria-hidden="true"
                tabIndex={-1}
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
                {importing ? <Loader2 className="size-3.5 animate-spin" /> : <Upload className="size-3.5" />}
                Upload CSV
              </Button>
            </div>
          </div>
        </div>

        {/* Auto-sync info */}
        <div className="flex items-start gap-2.5 rounded-md border border-border bg-muted/40 px-3 py-2.5">
          <Zap className="mt-0.5 size-3.5 shrink-0 text-muted-foreground" />
          <p className="text-caption text-muted-foreground">
            <span className="font-medium text-foreground">Auto-sync (API fallback):</span>{" "}
            If <code className="rounded bg-muted px-1 py-0.5 text-micro">GSTA_API_KEY</code> is set, unknown HSN codes are auto-fetched from gstaccelerator.in and cached in the database.
          </p>
        </div>

        {importResult && (
          <div className="rounded-md bg-muted p-3 text-body text-foreground">
            {importResult}
          </div>
        )}
      </CardContent>
    </Card>
  );
}

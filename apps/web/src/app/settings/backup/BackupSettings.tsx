"use client";

import { useState, useRef } from "react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Download, Upload, Database, Shield, AlertTriangle, CheckCircle2, HardDrive, Cloud } from "lucide-react";
import { useLocalFirstMode } from "@/lib/local-first";

export function BackupSettings() {
  const [exporting, setExporting] = useState(false);
  const [importing, setImporting] = useState(false);
  const [importResult, setImportResult] = useState<{ success: boolean; message: string } | null>(null);
  const { enabled: localFirst, toggle: toggleLocalFirst } = useLocalFirstMode();
  const fileRef = useRef<HTMLInputElement>(null);

  async function handleExport() {
    setExporting(true);
    try {
      const res = await fetch("/api/backup/export");
      if (!res.ok) throw new Error("Backup failed");
      const blob = await res.blob();
      const url = URL.createObjectURL(blob);
      const a = document.createElement("a");
      a.href = url;
      a.download = res.headers.get("Content-Disposition")?.split('filename="')[1]?.replace('"', "") ?? "nirman-backup.json";
      a.click();
      URL.revokeObjectURL(url);
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Backup failed");
    } finally {
      setExporting(false);
    }
  }

  async function handleImport(file: File) {
    setImporting(true);
    setImportResult(null);
    try {
      const text = await file.text();
      const json = JSON.parse(text);
      const res = await fetch("/api/backup/import", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(json),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error ?? "Restore failed");
      setImportResult({ success: true, message: `Restored ${data.recordCount ?? 0} records across ${data.tableCount ?? 0} tables.` });
    } catch (err) {
      setImportResult({ success: false, message: err instanceof Error ? err.message : "Restore failed" });
    } finally {
      setImporting(false);
    }
  }

  return (
    <div className="space-y-6">
      {/* Storage mode toggle */}
      <Card className="p-6">
        <div className="flex items-start gap-3 mb-4">
          <div className="flex h-10 w-10 items-center justify-center rounded-lg bg-primary/10">
            <HardDrive className="h-5 w-5 text-primary" />
          </div>
          <div>
            <h3 className="font-semibold">Data Storage Mode</h3>
            <p className="text-sm text-muted-foreground">Choose where your business data is stored</p>
          </div>
        </div>
        <div className="grid grid-cols-2 gap-3">
          <button
            className={`rounded-lg border-2 p-4 text-left transition-all ${!localFirst ? "border-primary bg-primary/5" : "border-border hover:border-border/80"}`}
            onClick={() => toggleLocalFirst(false)}
          >
            <Cloud className="h-5 w-5 mb-2 text-primary" />
            <p className="font-medium text-sm">Cloud (Default)</p>
            <p className="text-xs text-muted-foreground mt-1">Data syncs to the server automatically. Accessible from any device. Real-time collaboration.</p>
            {!localFirst && <CheckCircle2 className="h-4 w-4 text-primary mt-2" />}
          </button>
          <button
            className={`rounded-lg border-2 p-4 text-left transition-all ${localFirst ? "border-primary bg-primary/5" : "border-border hover:border-border/80"}`}
            onClick={() => toggleLocalFirst(true)}
          >
            <HardDrive className="h-5 w-5 mb-2 text-primary" />
            <p className="font-medium text-sm">Local-First</p>
            <p className="text-xs text-muted-foreground mt-1">Caches all data in browser storage. Works offline. Auto-syncs when online. Best for slow connections.</p>
            {localFirst && <CheckCircle2 className="h-4 w-4 text-primary mt-2" />}
          </button>
        </div>
      </Card>

      {/* Export */}
      <Card className="p-6">
        <div className="flex items-start gap-3 mb-4">
          <div className="flex h-10 w-10 items-center justify-center rounded-lg bg-emerald-500/10">
            <Download className="h-5 w-5 text-emerald-600" />
          </div>
          <div className="flex-1">
            <h3 className="font-semibold">Download Backup</h3>
            <p className="text-sm text-muted-foreground">
              Export all your company data as a single JSON file. Includes projects, materials, POs, sales, payments, GL entries, and audit logs.
            </p>
          </div>
        </div>
        <div className="flex items-center gap-3">
          <Button onClick={handleExport} disabled={exporting}>
            <Download className="h-4 w-4" />
            {exporting ? "Preparing backup…" : "Download Full Backup"}
          </Button>
          <span className="text-xs text-muted-foreground">
            The file can be restored on any Nirman instance.
          </span>
        </div>
      </Card>

      {/* Import / Restore */}
      <Card className="p-6">
        <div className="flex items-start gap-3 mb-4">
          <div className="flex h-10 w-10 items-center justify-center rounded-lg bg-amber-500/10">
            <Upload className="h-5 w-5 text-amber-600" />
          </div>
          <div className="flex-1">
            <h3 className="font-semibold">Restore from Backup</h3>
            <p className="text-sm text-muted-foreground">
              Upload a previously downloaded backup file to restore data. This will merge with existing data.
            </p>
          </div>
        </div>
        <div className="rounded-lg bg-amber-50 border border-amber-200 p-3 mb-4 flex items-start gap-2">
          <AlertTriangle className="h-4 w-4 text-amber-600 mt-0.5 shrink-0" />
          <p className="text-sm text-amber-800">
            <strong>Warning:</strong> Restore will upsert records by ID. Existing records with the same ID will be overwritten.
            Download a backup first before restoring.
          </p>
        </div>
        <input
          ref={fileRef}
          type="file"
          accept="application/json,.json"
          className="hidden"
          onChange={(e) => {
            const file = e.target.files?.[0];
            if (file) handleImport(file);
          }}
        />
        <Button variant="outline" onClick={() => fileRef.current?.click()} disabled={importing}>
          <Upload className="h-4 w-4" />
          {importing ? "Restoring…" : "Select Backup File"}
        </Button>
        {importResult && (
          <div className={`mt-4 rounded-lg p-3 ${importResult.success ? "bg-emerald-50 border border-emerald-200" : "bg-red-50 border border-red-200"}`}>
            <div className="flex items-start gap-2">
              {importResult.success ? (
                <CheckCircle2 className="h-4 w-4 text-emerald-600 mt-0.5" />
              ) : (
                <AlertTriangle className="h-4 w-4 text-red-600 mt-0.5" />
              )}
              <p className={`text-sm ${importResult.success ? "text-emerald-800" : "text-red-800"}`}>
                {importResult.message}
              </p>
            </div>
          </div>
        )}
      </Card>

      {/* Info */}
      <Card className="p-6">
        <div className="flex items-start gap-3">
          <Shield className="h-5 w-5 text-muted-foreground mt-0.5" />
          <div>
            <h3 className="font-semibold text-sm">Data Safety</h3>
            <ul className="mt-2 space-y-1.5 text-sm text-muted-foreground">
              <li>• All mutations are wrapped in database transactions (235 transaction points)</li>
              <li>• Every change is logged to an immutable audit trail (289 logging points)</li>
              <li>• Master data uses soft-delete (21 models) — nothing is ever truly lost</li>
              <li>• Optimistic locking prevents concurrent edit conflicts on key entities</li>
              <li>• The service worker caches the app shell for offline access</li>
              <li>• Form drafts auto-save to IndexedDB every 2 seconds</li>
            </ul>
          </div>
        </div>
      </Card>
    </div>
  );
}

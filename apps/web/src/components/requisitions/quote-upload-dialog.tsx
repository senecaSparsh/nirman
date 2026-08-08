"use client";

import { useState } from "react";
import { toast } from "sonner";
import { Upload, Loader2, X } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input, Label, Select, Textarea } from "@/components/ui/input";
import { Dialog } from "@/components/ui/dialog";
import { formatCurrency } from "@/lib/utils";

type MaterialOption = { id: string; code: string; name: string; unit: string };
type SupplierOption = { id: string; name: string };

type RequisitionLine = {
  materialId: string;
  materialCode: string;
  materialName: string;
  unit: string;
  qtyRequested: number;
};

export function QuoteUploadDialog({
  open,
  onOpenChange,
  requisitionId,
  reqNumber,
  requisitionLines,
  suppliers,
  materials,
  onUploaded,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  requisitionId: string;
  reqNumber: string;
  requisitionLines: RequisitionLine[];
  suppliers: SupplierOption[];
  materials: MaterialOption[];
  onUploaded?: () => void;
}) {
  const [saving, setSaving] = useState(false);
  const [uploading, setUploading] = useState(false);
  const [supplierId, setSupplierId] = useState("");
  const [fileUrl, setFileUrl] = useState("");
  const [fileName, setFileName] = useState("");
  const [mimeType, setMimeType] = useState("");
  const [landedTotal, setLandedTotal] = useState("");
  const [validUntil, setValidUntil] = useState("");
  const [notes, setNotes] = useState("");
  // Line amounts — prefilled from requisition lines, editable
  const [linePrices, setLinePrices] = useState<Record<string, string>>({});

  const computedTotal = requisitionLines.reduce((sum, l) => {
    const price = Number(linePrices[l.materialId] ?? 0);
    return sum + l.qtyRequested * price;
  }, 0);

  async function handleFileUpload(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    if (!file) return;
    setUploading(true);
    try {
      const formData = new FormData();
      formData.append("file", file);
      const res = await fetch("/api/uploads", { method: "POST", body: formData });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error ?? "Upload failed");
      setFileUrl(data.url);
      setFileName(data.fileName);
      setMimeType(data.mimeType);
      toast.success("Quote file uploaded");
    } catch (err: unknown) {
      toast.error(err instanceof Error ? err.message : "Upload failed");
    } finally {
      setUploading(false);
    }
  }

  function clearFile() {
    setFileUrl("");
    setFileName("");
    setMimeType("");
  }

  async function onSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (!supplierId) return toast.error("Select a supplier");
    if (!fileUrl) return toast.error("Upload a quote file (PDF/image)");
    if (!landedTotal && computedTotal === 0) return toast.error("Enter the landed total or line prices");

    const total = landedTotal ? Number(landedTotal) : computedTotal;
    if (total <= 0) return toast.error("Landed total must be > 0");

    setSaving(true);
    try {
      const lines = requisitionLines.map((l) => ({
        materialId: l.materialId,
        qty: l.qtyRequested,
        unitPrice: Number(linePrices[l.materialId] ?? 0),
      }));
      const res = await fetch("/api/quotes", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          requisitionId,
          supplierId,
          fileUrl,
          fileName,
          mimeType,
          landedTotal: total,
          validUntil: validUntil || null,
          notes: notes.trim() || null,
          lines,
        }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error ?? "Failed to upload quote");
      toast.success("Quote uploaded", {
        description: `${reqNumber} — ${suppliers.find((s) => s.id === supplierId)?.name}`,
      });
      // Reset
      setSupplierId(""); clearFile(); setLandedTotal(""); setValidUntil(""); setNotes("");
      setLinePrices({});
      onUploaded?.();
      onOpenChange(false);
    } catch (err: unknown) {
      toast.error(err instanceof Error ? err.message : "Failed");
    } finally {
      setSaving(false);
    }
  }

  return (
    <Dialog
      open={open}
      onOpenChange={onOpenChange}
      title="Upload Vendor Quote"
      description={`${reqNumber} — attach a quote file + enter pricing`}
      className="max-w-2xl"
    >
      <form onSubmit={onSubmit} className="space-y-3">
        {/* Supplier + file upload */}
        <div className="grid gap-3 sm:grid-cols-2">
          <div className="space-y-1.5">
            <Label>Supplier *</Label>
            <Select value={supplierId} onChange={(e) => setSupplierId(e.target.value)} required>
              <option value="" disabled>Select supplier…</option>
              {suppliers.map((s) => (
                <option key={s.id} value={s.id}>{s.name}</option>
              ))}
            </Select>
          </div>
          <div className="space-y-1.5">
            <Label>Quote File (PDF/Image) *</Label>
            {fileUrl ? (
              <div className="flex items-center gap-2 rounded-md border px-3 py-2">
                <a href={fileUrl} target="_blank" rel="noopener noreferrer" className="flex-1 truncate text-body text-primary hover:underline">
                  {fileName}
                </a>
                <Button type="button" variant="ghost" size="icon" className="h-6 w-6" onClick={clearFile}>
                  <X className="h-3.5 w-3.5" />
                </Button>
              </div>
            ) : (
              <label className="flex cursor-pointer items-center justify-center gap-2 rounded-md border border-dashed px-3 py-2 text-body text-muted-foreground hover:border-foreground/30">
                {uploading ? <Loader2 className="h-4 w-4 animate-spin" /> : <Upload className="h-4 w-4" />}
                <span>{uploading ? "Uploading…" : "Choose file"}</span>
                <input type="file" accept=".pdf,image/*" className="hidden" onChange={handleFileUpload} disabled={uploading} />
              </label>
            )}
          </div>
        </div>

        {/* Per-line prices */}
        <div className="space-y-2">
          <Label>Line Prices (per unit, delivered to site)</Label>
          <div className="rounded-md border divide-y divide-border">
            {requisitionLines.map((l) => (
              <div key={l.materialId} className="flex items-center gap-2 px-3 py-2">
                <div className="flex-1 min-w-0">
                  <div className="truncate text-body font-medium">{l.materialName}</div>
                  <div className="font-mono text-caption text-muted-foreground">{l.materialCode}</div>
                </div>
                <span className="tnum text-caption text-muted-foreground shrink-0">{l.qtyRequested} {l.unit}</span>
                <Input
                  type="number"
                  step="0.01"
                  min="0"
                  placeholder="0.00"
                  value={linePrices[l.materialId] ?? ""}
                  onChange={(e) => setLinePrices((p) => ({ ...p, [l.materialId]: e.target.value }))}
                  className="w-28 text-right"
                />
              </div>
            ))}
          </div>
          <div className="flex items-center justify-between px-1">
            <span className="text-caption text-muted-foreground">Computed total from lines</span>
            <span className="tnum font-medium">{formatCurrency(computedTotal)}</span>
          </div>
        </div>

        {/* Landed total (override) + valid until */}
        <div className="grid gap-3 sm:grid-cols-2">
          <div className="space-y-1.5">
            <Label>Landed Total (delivered to site) *</Label>
            <Input
              type="number"
              step="0.01"
              min="0"
              placeholder={computedTotal > 0 ? String(computedTotal) : "0.00"}
              value={landedTotal}
              onChange={(e) => setLandedTotal(e.target.value)}
            />
            <p className="text-micro text-muted-foreground">Leave blank to use computed total from lines</p>
          </div>
          <div className="space-y-1.5">
            <Label>Valid Until</Label>
            <Input type="date" value={validUntil} onChange={(e) => setValidUntil(e.target.value)} />
          </div>
        </div>

        <div className="space-y-1.5">
          <Label>Notes</Label>
          <Textarea value={notes} onChange={(e) => setNotes(e.target.value)} rows={2} />
        </div>

        <div className="flex justify-end gap-2 pt-2">
          <Button type="button" variant="outline" onClick={() => onOpenChange(false)} disabled={saving}>
            Cancel
          </Button>
          <Button type="submit" disabled={saving || uploading}>
            {saving ? "Saving…" : "Upload Quote"}
          </Button>
        </div>
      </form>
    </Dialog>
  );
}

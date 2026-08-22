"use client";

import { useState, useEffect } from "react";
import { toast } from "sonner";
import { Upload, Loader2, X } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input, Label, Select, Textarea } from "@/components/ui/input";
import { Dialog } from "@/components/ui/dialog";
import { SelectWithCreate } from "@/components/ui/select-with-create";
import { SupplierFormDialog } from "@/components/procurement/supplier-form-dialog";
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
  const [localSuppliers, setLocalSuppliers] = useState<SupplierOption[]>(suppliers);
  useEffect(() => { setLocalSuppliers(suppliers); }, [suppliers]);
  const [fileUrl, setFileUrl] = useState("");
  const [fileName, setFileName] = useState("");
  const [mimeType, setMimeType] = useState("");
  const [landedTotal, setLandedTotal] = useState("");
  const [validUntil, setValidUntil] = useState("");
  const [notes, setNotes] = useState("");
  // Line amounts — prefilled from requisition lines, editable
  const [linePrices, setLinePrices] = useState<Record<string, string>>({});
  // Per-line landed-cost components (all per-unit, optional)
  const [lineFreight, setLineFreight] = useState<Record<string, string>>({});
  const [lineLoading, setLineLoading] = useState<Record<string, string>>({});
  const [linePacking, setLinePacking] = useState<Record<string, string>>({});
  const [lineInsurance, setLineInsurance] = useState<Record<string, string>>({});
  const [lineDiscount, setLineDiscount] = useState<Record<string, string>>({});
  const [lineBuyerTransport, setLineBuyerTransport] = useState<Record<string, string>>({});
  const [showLandedCost, setShowLandedCost] = useState(false);
  const [deliveryTermsType, setDeliveryTermsType] = useState<"DELIVERED_SITE" | "EX_WORKS" | "FOR_STATION" | "CUSTOM">("DELIVERED_SITE");
  const [deliveryTermsNote, setDeliveryTermsNote] = useState("");

  const needsBuyerTransport = deliveryTermsType === "EX_WORKS" || deliveryTermsType === "FOR_STATION";

  const computedTotal = requisitionLines.reduce((sum, l) => {
    const price = Number(linePrices[l.materialId] ?? 0);
    const freight = Number(lineFreight[l.materialId] ?? 0);
    const loading = Number(lineLoading[l.materialId] ?? 0);
    const packing = Number(linePacking[l.materialId] ?? 0);
    const insurance = Number(lineInsurance[l.materialId] ?? 0);
    const discount = Number(lineDiscount[l.materialId] ?? 0);
    const buyerTransport = Number(lineBuyerTransport[l.materialId] ?? 0);
    // taxableValue = (price - discount + packing) per unit
    const taxablePU = price - discount + packing;
    // landed per unit = taxablePU + freight + buyerTransport + loading + insurance (GST computed server-side)
    const landedPU = taxablePU + freight + buyerTransport + loading + insurance;
    return sum + l.qtyRequested * landedPU;
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
        freightPerUnit: Number(lineFreight[l.materialId] ?? 0) || undefined,
        loadingPerUnit: Number(lineLoading[l.materialId] ?? 0) || undefined,
        packingPerUnit: Number(linePacking[l.materialId] ?? 0) || undefined,
        insurancePerUnit: Number(lineInsurance[l.materialId] ?? 0) || undefined,
        discountPerUnit: Number(lineDiscount[l.materialId] ?? 0) || undefined,
        buyerTransportPerUnit: Number(lineBuyerTransport[l.materialId] ?? 0) || undefined,
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
          landedTotal: landedTotal ? total : undefined, // let server compute if not overridden
          validUntil: validUntil || null,
          notes: notes.trim() || null,
          deliveryTermsType,
          deliveryTerms: deliveryTermsType === "CUSTOM" ? deliveryTermsNote.trim() || undefined : undefined,
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
      setLinePrices({}); setLineFreight({}); setLineLoading({}); setLinePacking({}); setLineInsurance({}); setLineDiscount({}); setLineBuyerTransport({});
      setShowLandedCost(false); setDeliveryTermsType("DELIVERED_SITE"); setDeliveryTermsNote("");
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
            <SelectWithCreate
              value={supplierId}
              onChange={setSupplierId}
              required
              placeholder="Select supplier…"
              createLabel="supplier"
              options={localSuppliers.map((s) => ({ value: s.id, label: s.name }))}
              renderCreateDialog={({ open: o, onCreated, onClose }) => (
                <SupplierFormDialog open={o} onOpenChange={onClose} onCreated={(e) => { setLocalSuppliers((p) => [...p, { id: e.id, name: e.label ?? "" }]); onCreated(e); }} supplier={null} />
              )}
            />
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
          <div className="flex items-center justify-between">
            <Label>Line Prices (per unit)</Label>
            <button
              type="button"
              onClick={() => setShowLandedCost((v) => !v)}
              className="text-caption text-primary hover:underline"
            >
              {showLandedCost ? "Hide landed-cost breakdown" : "Show landed-cost breakdown (freight, loading, etc.)"}
            </button>
          </div>
          <div className="rounded-md border divide-y divide-border">
            {requisitionLines.map((l) => {
              const price = Number(linePrices[l.materialId] ?? 0);
              const freight = Number(lineFreight[l.materialId] ?? 0);
              const loading = Number(lineLoading[l.materialId] ?? 0);
              const packing = Number(linePacking[l.materialId] ?? 0);
              const insurance = Number(lineInsurance[l.materialId] ?? 0);
              const discount = Number(lineDiscount[l.materialId] ?? 0);
              const buyerTransport = Number(lineBuyerTransport[l.materialId] ?? 0);
              const taxablePU = price - discount + packing;
              const landedPU = taxablePU + freight + buyerTransport + loading + insurance;
              return (
                <div key={l.materialId} className="px-3 py-2 space-y-1.5">
                  <div className="flex items-center gap-2">
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
                  {showLandedCost ? (
                    <div className="grid grid-cols-5 gap-1.5 pl-1">
                      <LandedCostInput label="Disc/unit" value={lineDiscount[l.materialId] ?? ""} onChange={(v) => setLineDiscount((p) => ({ ...p, [l.materialId]: v }))} />
                      <LandedCostInput label="Pkg/unit" value={linePacking[l.materialId] ?? ""} onChange={(v) => setLinePacking((p) => ({ ...p, [l.materialId]: v }))} />
                      <LandedCostInput label="Frt/unit" value={lineFreight[l.materialId] ?? ""} onChange={(v) => setLineFreight((p) => ({ ...p, [l.materialId]: v }))} />
                      <LandedCostInput label="Ld/unit" value={lineLoading[l.materialId] ?? ""} onChange={(v) => setLineLoading((p) => ({ ...p, [l.materialId]: v }))} />
                      <LandedCostInput label="Ins/unit" value={lineInsurance[l.materialId] ?? ""} onChange={(v) => setLineInsurance((p) => ({ ...p, [l.materialId]: v }))} />
                    </div>
                  ) : null}
                  {showLandedCost && needsBuyerTransport ? (
                    <div className="pl-1">
                      <LandedCostInput
                        label="Buyer transport/unit *"
                        value={lineBuyerTransport[l.materialId] ?? ""}
                        onChange={(v) => setLineBuyerTransport((p) => ({ ...p, [l.materialId]: v }))}
                      />
                    </div>
                  ) : null}
                  {showLandedCost ? (
                    <div className="flex items-center justify-between pl-1 text-caption">
                      <span className="text-muted-foreground">Landed/unit (ex-GST):</span>
                      <span className="tnum font-medium">{formatCurrency(landedPU)}</span>
                    </div>
                  ) : null}
                </div>
              );
            })}
          </div>
          <div className="flex items-center justify-between px-1">
            <span className="text-caption text-muted-foreground">Computed total from lines (ex-GST)</span>
            <span className="tnum font-medium">{formatCurrency(computedTotal)}</span>
          </div>
        </div>

        {/* Delivery basis — determines who bears transport cost */}
        <div className="space-y-1.5">
          <Label>Delivery Basis *</Label>
          <Select
            value={deliveryTermsType}
            onChange={(e) => setDeliveryTermsType(e.target.value as "DELIVERED_SITE" | "EX_WORKS" | "FOR_STATION" | "CUSTOM")}
          >
            <option value="DELIVERED_SITE">Delivered to site (supplier arranges freight)</option>
            <option value="EX_WORKS">Ex-works (we pick up — we bear transport)</option>
            <option value="FOR_STATION">FOR station (supplier to depot, we arrange onward)</option>
            <option value="CUSTOM">Custom (specify below)</option>
          </Select>
          {deliveryTermsType === "CUSTOM" ? (
            <Input
              type="text"
              value={deliveryTermsNote}
              onChange={(e) => setDeliveryTermsNote(e.target.value)}
              placeholder="Describe delivery terms"
            />
          ) : null}
          {needsBuyerTransport ? (
            <p className="text-micro text-warning">
              Enter buyer transport per unit for each line below — this normalizes the comparison against delivered quotes.
            </p>
          ) : null}
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

function LandedCostInput({ label, value, onChange }: { label: string; value: string; onChange: (v: string) => void }) {
  return (
    <div className="space-y-0.5">
      <label className="text-micro text-muted-foreground block">{label}</label>
      <Input
        type="number"
        step="0.01"
        min="0"
        placeholder="0"
        value={value}
        onChange={(e) => onChange(e.target.value)}
        className="w-full text-right text-caption h-8"
      />
    </div>
  );
}

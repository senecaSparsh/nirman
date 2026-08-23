"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { toast } from "sonner";
import { Dialog } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input, Label, Select } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { SelectWithCreate } from "@/components/ui/select-with-create";
import { ProjectFormDialog } from "@/components/projects/project-form-dialog";
import { PhotoUploader } from "@/components/ui/photo-uploader";
import { ChequeFields, EMPTY_CHEQUE, type ChequeFormState } from "@/components/sales/cheque-fields";
import { required, positiveNumber, type ValidationErrors } from "@/lib/validate";
import { formatCurrency } from "@/lib/utils";
import type { ProjectOption, AreaUnit } from "@/lib/types";

type FormValues = {
  sellerName: string;
  totalArea: string;
  totalCost: string;
};

const errorBorder = "border-danger focus-visible:border-danger focus-visible:ring-danger/25";

const AREA_UNITS: AreaUnit[] = ["SQFT", "SQM", "SQYD", "ACRE", "BIGHA", "KATHA", "HECTARE"];
const PAYMENT_MODES = ["CASH", "BANK_TRANSFER", "CHEQUE", "UPI", "OTHER"] as const;

type SellerOption = { id: string; name: string; phone?: string | null };

/**
 * LandPurchaseOrderDialog — book a land purchase with a token amount.
 *
 * Lifecycle: BOOKED → COMPLETED (when registry document is uploaded).
 * The full cost is recorded as an asset; the token is the first payment.
 * Balance is paid via subsequent payments; completion requires the registry doc.
 */
export function LandPurchaseOrderDialog({
  open,
  onOpenChange,
  projects,
  sellers,
  onCreated,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  projects: ProjectOption[];
  sellers: SellerOption[];
  onCreated?: (purchaseId: string) => void;
}) {
  const router = useRouter();
  const [saving, setSaving] = useState(false);
  const [localProjects, setLocalProjects] = useState<ProjectOption[]>(projects);
  useEffect(() => { setLocalProjects(projects); }, [projects]);

  const [form, setForm] = useState({
    sellerId: "",
    sellerName: "",
    sellerContact: "",
    projectId: "",
    purchaseDate: new Date().toISOString().slice(0, 10),
    totalArea: "",
    areaUnit: "SQFT" as AreaUnit,
    totalCost: "",
    location: "",
    registryNo: "",
    notes: "",
    // Token payment
    tokenAmount: "",
    tokenPaymentMode: "BANK_TRANSFER",
  });
  const [cheque, setCheque] = useState<ChequeFormState>(EMPTY_CHEQUE);
  const [atsDocUrl, setAtsDocUrl] = useState("");
  const [errors, setErrors] = useState<ValidationErrors<FormValues>>({});

  function set<K extends keyof typeof form>(key: K, value: (typeof form)[K]) {
    setForm((f) => ({ ...f, [key]: value }));
  }

  function validateField(key: keyof FormValues): string | undefined {
    if (key === "sellerName") return required(form.sellerName, "Seller name");
    if (key === "totalArea") return required(form.totalArea, "Total area") ?? positiveNumber(form.totalArea, "Total area");
    if (key === "totalCost") return required(form.totalCost, "Total cost") ?? positiveNumber(form.totalCost, "Total cost");
  }

  function onBlur(key: keyof FormValues) {
    const error = validateField(key);
    setErrors((prev) => ({ ...prev, [key]: error }));
  }

  // When a seller is selected, populate name + contact
  useEffect(() => {
    if (form.sellerId) {
      const s = sellers.find((x) => x.id === form.sellerId);
      if (s) {
        set("sellerName", s.name);
        set("sellerContact", s.phone ?? "");
      }
    }
  }, [form.sellerId, sellers]);

  const totalCostNum = Number(form.totalCost) || 0;
  const tokenNum = Number(form.tokenAmount) || 0;
  const balanceAfterToken = totalCostNum - tokenNum;
  const isCheque = form.tokenPaymentMode === "CHEQUE";

  async function onSubmit(e: React.FormEvent) {
    e.preventDefault();
    const newErrors: ValidationErrors<FormValues> = {};
    (["sellerName", "totalArea", "totalCost"] as const).forEach((k) => {
      const err = validateField(k);
      if (err) newErrors[k] = err;
    });
    setErrors(newErrors);
    if (Object.keys(newErrors).length > 0) return;

    if (tokenNum > totalCostNum) {
      toast.error(`Token amount (${formatCurrency(tokenNum)}) cannot exceed total cost (${formatCurrency(totalCostNum)})`);
      return;
    }
    if (isCheque && tokenNum > 0 && !cheque.chequeNo.trim()) {
      toast.error("Cheque number is required for cheque payments");
      return;
    }

    setSaving(true);
    try {
      const payload: Record<string, unknown> = {
        mode: "BOOKED",
        sellerId: form.sellerId || undefined,
        sellerName: form.sellerName.trim(),
        sellerContact: form.sellerContact.trim() || undefined,
        projectId: form.projectId || undefined,
        purchaseDate: form.purchaseDate,
        totalArea: Number(form.totalArea),
        areaUnit: form.areaUnit,
        totalCost: totalCostNum,
        location: form.location.trim() || undefined,
        registryNo: form.registryNo.trim() || undefined,
        tokenAmount: tokenNum > 0 ? tokenNum : undefined,
        tokenPaymentMode: tokenNum > 0 ? form.tokenPaymentMode : undefined,
        ...(isCheque && tokenNum > 0 ? {
          tokenChequeNo: cheque.chequeNo.trim(),
          tokenChequeDate: cheque.chequeDate || undefined,
          tokenChequeBank: cheque.chequeBank.trim() || undefined,
          tokenChequePhotoUrl: cheque.chequePhotoUrl || undefined,
        } : {}),
        atsDocumentUrl: atsDocUrl || undefined,
      };

      const res = await fetch("/api/land-purchases", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(payload),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error ?? "Failed to create land purchase order");
      toast.success("Land purchase order booked", {
        description: balanceAfterToken > 0
          ? `Balance due: ${formatCurrency(balanceAfterToken)}. Record payments and upload the registry document to complete.`
          : "Fully paid — upload the registry document to complete.",
      });
      onCreated?.(data.id);
      onOpenChange(false);
      router.refresh();
    } catch (err: unknown) {
      toast.error(err instanceof Error ? err.message : "Failed to create land purchase order");
    } finally {
      setSaving(false);
    }
  }

  return (
    <Dialog
      open={open}
      onOpenChange={onOpenChange}
      title="Book Land Purchase (Order)"
      description="Book land with a token payment. Complete when the registry document is uploaded."
      className="max-w-lg"
    >
      <form onSubmit={onSubmit} className="space-y-4">
        {/* Seller */}
        <div className="space-y-3">
          <p className="text-label font-semibold text-muted-foreground">Seller</p>
          {sellers.length > 0 && (
            <div className="space-y-1.5">
              <Label htmlFor="lp-seller">Select existing seller (optional)</Label>
              <Select id="lp-seller" value={form.sellerId} onChange={(e) => set("sellerId", e.target.value)}>
                <option value="">— New seller —</option>
                {sellers.map((s) => (
                  <option key={s.id} value={s.id}>{s.name}</option>
                ))}
              </Select>
            </div>
          )}
          <div className="grid grid-cols-2 gap-3">
            <div className="space-y-1.5">
              <Label htmlFor="lp-seller-name">Seller Name *</Label>
              <Input
                id="lp-seller-name"
                value={form.sellerName}
                onChange={(e) => set("sellerName", e.target.value)}
                onBlur={() => onBlur("sellerName")}
                className={errors.sellerName ? errorBorder : ""}
                required
              />
              {errors.sellerName && <p className="text-micro text-danger">{errors.sellerName}</p>}
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="lp-seller-contact">Contact</Label>
              <Input id="lp-seller-contact" value={form.sellerContact} onChange={(e) => set("sellerContact", e.target.value)} placeholder="Phone" />
            </div>
          </div>
        </div>

        {/* Land details */}
        <div className="space-y-3">
          <p className="text-label font-semibold text-muted-foreground">Land Details</p>
          <div className="grid grid-cols-2 gap-3">
            <div className="space-y-1.5">
              <Label htmlFor="lp-area">Total Area *</Label>
              <Input
                id="lp-area"
                type="number"
                min="0"
                step="0.01"
                value={form.totalArea}
                onChange={(e) => set("totalArea", e.target.value)}
                onBlur={() => onBlur("totalArea")}
                className={errors.totalArea ? errorBorder : ""}
                placeholder="0"
                required
              />
              {errors.totalArea && <p className="text-micro text-danger">{errors.totalArea}</p>}
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="lp-unit">Area Unit</Label>
              <Select id="lp-unit" value={form.areaUnit} onChange={(e) => set("areaUnit", e.target.value as AreaUnit)}>
                {AREA_UNITS.map((u) => (<option key={u} value={u}>{u}</option>))}
              </Select>
            </div>
          </div>
          <div className="grid grid-cols-2 gap-3">
            <div className="space-y-1.5">
              <Label htmlFor="lp-cost">Total Cost (₹) *</Label>
              <Input
                id="lp-cost"
                type="number"
                min="0"
                step="0.01"
                value={form.totalCost}
                onChange={(e) => set("totalCost", e.target.value)}
                onBlur={() => onBlur("totalCost")}
                className={errors.totalCost ? errorBorder : ""}
                placeholder="0"
                required
              />
              {errors.totalCost && <p className="text-micro text-danger">{errors.totalCost}</p>}
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="lp-date">Purchase Date</Label>
              <Input id="lp-date" type="date" value={form.purchaseDate} onChange={(e) => set("purchaseDate", e.target.value)} />
            </div>
          </div>
          <div className="grid grid-cols-2 gap-3">
            <div className="space-y-1.5">
              <Label htmlFor="lp-location">Location</Label>
              <Input id="lp-location" value={form.location} onChange={(e) => set("location", e.target.value)} placeholder="Village, district, etc." />
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="lp-project">Project (optional)</Label>
              <SelectWithCreate
                id="lp-project"
                value={form.projectId}
                onChange={(v) => set("projectId", v)}
                placeholder="— Standalone —"
                createLabel="project"
                options={localProjects.map((p) => ({ value: p.id, label: p.name }))}
                renderCreateDialog={({ open: o, onCreated, onClose }) => (
                  <ProjectFormDialog open={o} onOpenChange={onClose} onCreated={(e) => { setLocalProjects((p) => [...p, { id: e.id, name: e.label ?? "", type: "RESIDENTIAL", status: "PLANNED" }]); onCreated(e); }} />
                )}
              />
            </div>
          </div>
          <div className="space-y-1.5">
            <Label htmlFor="lp-registry">Registry No. (optional)</Label>
            <Input id="lp-registry" value={form.registryNo} onChange={(e) => set("registryNo", e.target.value)} placeholder="If already registered" />
          </div>
        </div>

        {/* Token payment */}
        <div className="space-y-3 rounded-md border border-border p-3">
          <p className="text-label font-semibold text-muted-foreground">Token Payment</p>
          <div className="grid grid-cols-2 gap-3">
            <div className="space-y-1.5">
              <Label htmlFor="lp-token">Token Amount (₹)</Label>
              <Input id="lp-token" type="number" min="0" step="0.01" value={form.tokenAmount} onChange={(e) => set("tokenAmount", e.target.value)} placeholder="0" />
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="lp-token-mode">Payment Mode</Label>
              <Select id="lp-token-mode" value={form.tokenPaymentMode} onChange={(e) => set("tokenPaymentMode", e.target.value)}>
                {PAYMENT_MODES.map((m) => (<option key={m} value={m}>{m.replace("_", " ")}</option>))}
              </Select>
            </div>
          </div>
          {tokenNum > 0 && totalCostNum > 0 && (
            <p className="text-caption text-muted-foreground">
              Balance after token: <strong className="text-foreground tnum">{formatCurrency(balanceAfterToken)}</strong>
            </p>
          )}
          {isCheque && tokenNum > 0 && <ChequeFields value={cheque} onChange={setCheque} />}
        </div>

        {/* ATS document */}
        <div className="space-y-1.5">
          <Label>Agreement to Sell (ATS) — optional</Label>
          <PhotoUploader
            photos={atsDocUrl ? [{ url: atsDocUrl }] : []}
            onChange={(photos) => setAtsDocUrl(photos[0]?.url ?? "")}
            maxPhotos={1}
            label="Upload ATS Document"
          />
          <p className="text-caption text-muted-foreground">
            Upload the signed ATS now, or later from the land purchase detail. The registry document is required to complete the purchase.
          </p>
        </div>

        <div className="flex justify-end gap-2 pt-2">
          <Button type="button" variant="outline" onClick={() => onOpenChange(false)} disabled={saving}>Cancel</Button>
          <Button type="submit" disabled={saving}>{saving ? "Booking…" : "Book Land Purchase"}</Button>
        </div>
      </form>
    </Dialog>
  );
}

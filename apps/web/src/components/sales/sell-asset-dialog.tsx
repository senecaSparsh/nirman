"use client";

import { useEffect, useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import { toast } from "sonner";
import { Dialog } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input, Select, Label } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { formatCurrency } from "@/lib/utils";
import { required, positiveNumber, type ValidationErrors } from "@/lib/validate";
import type { AssetType, SellableAssetRow } from "@/lib/types";

type SaleFormValues = {
  assetType: string;
  customerId: string;
  salePrice: string;
};

const errorBorder = "border-danger focus-visible:border-danger focus-visible:ring-danger/25";

const PAYMENT_MODES = ["CASH", "BANK_TRANSFER", "CHEQUE", "UPI", "OTHER"] as const;

type CustomerOption = { id: string; name: string };

export function SellAssetDialog({
  open,
  onOpenChange,
  customers,
  presetAsset,
  onSold,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  customers: CustomerOption[];
  /** When set, the dialog is locked to this asset (no type toggle / select). */
  presetAsset?: SellableAssetRow | null;
  /** Called after a successful sale — lets the caller update local state. */
  onSold?: (assetId: string, saleId: string) => void;
}) {
  const router = useRouter();
  const [saving, setSaving] = useState(false);
  const [assets, setAssets] = useState<SellableAssetRow[]>([]);
  const [loadingAssets, setLoadingAssets] = useState(false);
  const isPreset = Boolean(presetAsset);
  const [form, setForm] = useState({
    assetType: "LAND" as AssetType,
    assetId: "",
    customerId: "",
    salePrice: "",
    paymentMode: "BANK_TRANSFER",
    initialPayment: "",
    initialPaymentMode: "BANK_TRANSFER",
    notes: "",
  });
  const [errors, setErrors] = useState<ValidationErrors<SaleFormValues>>({});

  function validateField(key: keyof SaleFormValues): string | undefined {
    if (key === "assetType") return required(form.assetType, "Asset type");
    if (key === "customerId") return required(form.customerId, "Customer");
    if (key === "salePrice") return required(form.salePrice, "Sale price") ?? positiveNumber(form.salePrice, "Sale price");
  }

  function onBlur(key: keyof SaleFormValues) {
    const error = validateField(key);
    setErrors((prev) => ({ ...prev, [key]: error }));
  }

  // When a preset asset is provided, seed the form from it whenever it changes.
  useEffect(() => {
    if (presetAsset) {
      setForm((f) => ({
        ...f,
        assetType: presetAsset.assetType,
        assetId: presetAsset.assetId,
        salePrice: presetAsset.askingPrice != null ? String(presetAsset.askingPrice) : f.salePrice,
      }));
    }
  }, [presetAsset]);

  // Fetch sellable assets whenever the asset type changes (or dialog opens).
  // Skipped when a preset asset is locked in.
  useEffect(() => {
    if (!open || isPreset) return;
    setLoadingAssets(true);
    setAssets([]);
    fetch(`/api/sellable-assets?type=${form.assetType}`)
      .then((r) => r.json())
      .then((d) => { if (Array.isArray(d)) setAssets(d); })
      .catch(() => toast.error("Failed to load sellable assets"))
      .finally(() => setLoadingAssets(false));
  }, [open, form.assetType, isPreset]);

  const selectedAsset = useMemo(
    () => isPreset && presetAsset
      ? presetAsset
      : assets.find((a) => a.assetId === form.assetId) ?? null,
    [assets, form.assetId, isPreset, presetAsset],
  );

  const salePriceNum = Number(form.salePrice) || 0;
  const costBasis = selectedAsset?.costBasis ?? 0;
  const estimatedProfit = salePriceNum - costBasis;
  const initialPaymentNum = Number(form.initialPayment) || 0;

  function set(key: keyof typeof form, value: string) {
    setForm((f) => ({ ...f, [key]: value }));
  }

  function onAssetChange(value: string) {
    const asset = assets.find((a) => a.assetId === value) ?? null;
    setForm((f) => ({
      ...f,
      assetId: value,
      salePrice: asset?.askingPrice != null ? String(asset.askingPrice) : f.salePrice,
    }));
  }

  async function onSubmit(e: React.FormEvent) {
    e.preventDefault();
    const newErrors: ValidationErrors<SaleFormValues> = {};
    (["assetType", "customerId", "salePrice"] as (keyof SaleFormValues)[]).forEach((key) => {
      const error = validateField(key);
      if (error) newErrors[key] = error;
    });
    setErrors(newErrors);
    if (!form.assetId) { toast.error("Select an asset to sell"); return; }
    if (Object.keys(newErrors).length > 0) {
      toast.error("Please fix the errors in the form");
      return;
    }
    setSaving(true);
    try {
      const payload: Record<string, unknown> = {
        assetType: form.assetType,
        customerId: form.customerId,
        projectId: selectedAsset?.projectId,
        salePrice: salePriceNum,
        paymentMode: form.paymentMode,
        notes: form.notes.trim() || null,
      };
      if (form.assetType === "LAND") payload.landParcelId = form.assetId;
      else payload.builtUnitId = form.assetId;
      if (initialPaymentNum > 0) {
        payload.initialPayment = initialPaymentNum;
        payload.initialPaymentMode = form.initialPaymentMode;
      }
      const res = await fetch("/api/sales", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(payload),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error ?? "Failed to create sale");
      const saleId = data.saleId ?? "";
      const balanceAfter = salePriceNum - initialPaymentNum;
      toast.success(`Booking ${data.saleNumber ?? ""} created`, {
        description: balanceAfter > 0
          ? `Balance due: ${formatCurrency(balanceAfter)}. Record payments as they come in.`
          : "Fully paid — sale complete.",
        action: balanceAfter > 0 ? {
          label: "Record Payment",
          onClick: () => router.push(`/sales?sale=${saleId}`),
        } : undefined,
      });
      onSold?.(form.assetId, saleId);
      onOpenChange(false);
      router.refresh();
    } catch (err: unknown) {
      toast.error((err instanceof Error ? err.message : "Something went wrong"));
    } finally {
      setSaving(false);
    }
  }

  return (
    <Dialog
      open={open}
      onOpenChange={onOpenChange}
      title={isPreset ? "Sell Unit" : "New Sale"}
      description={isPreset ? "Record the sale of this unit to a customer." : "Sell a land parcel or built unit to a customer."}
      className="max-w-lg"
    >
      <form onSubmit={onSubmit} className="space-y-3">
        {/* Asset type toggle — hidden when a preset asset is locked in */}
        {isPreset ? (
          <div className="space-y-1.5">
            <Label>Asset</Label>
            <div className="flex items-center justify-between rounded-md border border-input bg-muted/40 px-3 py-2">
              <span className="text-body font-medium text-foreground">{presetAsset?.label}</span>
              <span className="text-caption text-muted-foreground">{presetAsset?.projectName ?? "No project"}</span>
            </div>
          </div>
        ) : (
          <>
            <div className="space-y-1.5">
              <Label className={errors.assetType ? "text-danger" : undefined}>Asset Type</Label>
              <Select value={form.assetType} onChange={(e) => { set("assetType", e.target.value); set("assetId", ""); set("salePrice", ""); }} onBlur={() => onBlur("assetType")} aria-invalid={!!errors.assetType} className={errors.assetType ? errorBorder : undefined}>
                <option value="LAND">Land Parcel</option>
                <option value="BUILT_UNIT">Built Unit</option>
              </Select>
              {errors.assetType && <p className="text-caption text-danger" role="alert">{errors.assetType}</p>}
            </div>

            {/* Asset select */}
            <div className="space-y-1.5">
              <Label htmlFor="sa-asset">Asset *</Label>
              <Select id="sa-asset" value={form.assetId} onChange={(e) => onAssetChange(e.target.value)} disabled={loadingAssets}>
                <option value="">{loadingAssets ? "Loading…" : "Select an asset"}</option>
                {assets.map((a) => (
                  <option key={a.assetId} value={a.assetId}>
                    {a.label} · {a.projectName ?? "No project"} · Cost {formatCurrency(a.costBasis)}
                  </option>
                ))}
              </Select>
              {assets.length === 0 && !loadingAssets && (
                <p className="text-caption text-muted-foreground">No available {form.assetType === "LAND" ? "land parcels" : "built units"} to sell.</p>
              )}
            </div>
          </>
        )}

        {/* Customer select */}
        <div className="space-y-1.5">
          <Label htmlFor="sa-customer" className={errors.customerId ? "text-danger" : undefined}>Customer *</Label>
          <Select id="sa-customer" value={form.customerId} onChange={(e) => set("customerId", e.target.value)} onBlur={() => onBlur("customerId")} aria-invalid={!!errors.customerId} className={errors.customerId ? errorBorder : undefined}>
            <option value="">Select a customer</option>
            {customers.map((c) => (
              <option key={c.id} value={c.id}>{c.name}</option>
            ))}
          </Select>
          {errors.customerId && <p className="text-caption text-danger" role="alert">{errors.customerId}</p>}
          {customers.length === 0 && (
            <p className="text-caption text-muted-foreground">No customers yet. Create one in the Customers tab.</p>
          )}
        </div>

        {/* Sale price + live profit */}
        <div className="grid grid-cols-2 gap-3">
          <div className="space-y-1.5">
            <Label htmlFor="sa-price" className={errors.salePrice ? "text-danger" : undefined}>Sale Price *</Label>
            <Input id="sa-price" type="number" min="0" step="0.01" value={form.salePrice} onChange={(e) => set("salePrice", e.target.value)} onBlur={() => onBlur("salePrice")} required aria-invalid={!!errors.salePrice} className={errors.salePrice ? errorBorder : undefined} />
            {errors.salePrice && <p className="text-caption text-danger" role="alert">{errors.salePrice}</p>}
          </div>
          <div className="space-y-1.5">
            <Label>Cost Basis</Label>
            <div className="flex h-9 items-center rounded-md border border-input bg-muted/40 px-3 text-body text-muted-foreground tnum">
              {formatCurrency(costBasis)}
            </div>
          </div>
        </div>
        {salePriceNum > 0 && (
          <div className="flex items-center justify-between rounded-md border bg-muted/40 px-3 py-2 text-body">
            <span className="text-muted-foreground">Estimated Profit</span>
            <span className={`font-medium tnum ${estimatedProfit >= 0 ? "text-success" : "text-danger"}`}>
              {formatCurrency(estimatedProfit)}
            </span>
          </div>
        )}

        {/* Payment mode */}
        <div className="space-y-1.5">
          <Label htmlFor="sa-mode">Payment Mode</Label>
          <Select id="sa-mode" value={form.paymentMode} onChange={(e) => set("paymentMode", e.target.value)}>
            {PAYMENT_MODES.map((m) => (
              <option key={m} value={m}>{m.replace("_", " ")}</option>
            ))}
          </Select>
        </div>

        {/* Initial payment */}
        <div className="grid grid-cols-2 gap-3">
          <div className="space-y-1.5">
            <Label htmlFor="sa-init">Initial Payment</Label>
            <Input id="sa-init" type="number" min="0" step="0.01" value={form.initialPayment} onChange={(e) => set("initialPayment", e.target.value)} placeholder="0" />
          </div>
          {initialPaymentNum > 0 && (
            <div className="space-y-1.5">
              <Label htmlFor="sa-init-mode">Initial Payment Mode</Label>
              <Select id="sa-init-mode" value={form.initialPaymentMode} onChange={(e) => set("initialPaymentMode", e.target.value)}>
                {PAYMENT_MODES.map((m) => (
                  <option key={m} value={m}>{m.replace("_", " ")}</option>
                ))}
              </Select>
            </div>
          )}
        </div>

        {/* Notes */}
        <div className="space-y-1.5">
          <Label htmlFor="sa-notes">Notes</Label>
          <Textarea id="sa-notes" value={form.notes} onChange={(e) => set("notes", e.target.value)} rows={2} />
        </div>

        <div className="flex justify-end gap-2 pt-2">
          <Button type="button" variant="outline" onClick={() => onOpenChange(false)} disabled={saving}>
            Cancel
          </Button>
          <Button type="submit" disabled={saving || !form.assetId || !form.customerId}>
            {saving ? "Creating…" : "Create Sale"}
          </Button>
        </div>
      </form>
    </Dialog>
  );
}

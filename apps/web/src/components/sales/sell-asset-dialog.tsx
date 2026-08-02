"use client";

import { useEffect, useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import { toast } from "sonner";
import { Dialog } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input, Select, Label } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { formatCurrency } from "@/lib/utils";
import type { AssetType, SellableAssetRow } from "@/lib/types";

const PAYMENT_MODES = ["CASH", "BANK_TRANSFER", "CHEQUE", "UPI", "OTHER"] as const;

type CustomerOption = { id: string; name: string };

export function SellAssetDialog({
  open,
  onOpenChange,
  customers,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  customers: CustomerOption[];
}) {
  const router = useRouter();
  const [saving, setSaving] = useState(false);
  const [assets, setAssets] = useState<SellableAssetRow[]>([]);
  const [loadingAssets, setLoadingAssets] = useState(false);
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

  // Fetch sellable assets whenever the asset type changes (or dialog opens)
  useEffect(() => {
    if (!open) return;
    setLoadingAssets(true);
    setAssets([]);
    fetch(`/api/sellable-assets?type=${form.assetType}`)
      .then((r) => r.json())
      .then((d) => { if (Array.isArray(d)) setAssets(d); })
      .catch(() => toast.error("Failed to load sellable assets"))
      .finally(() => setLoadingAssets(false));
  }, [open, form.assetType]);

  const selectedAsset = useMemo(
    () => assets.find((a) => a.assetId === form.assetId) ?? null,
    [assets, form.assetId],
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
    if (!form.assetId) { toast.error("Select an asset to sell"); return; }
    if (!form.customerId) { toast.error("Select a customer"); return; }
    if (salePriceNum <= 0) { toast.error("Sale price must be greater than 0"); return; }
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
      toast.success(`Sale ${data.saleNumber ?? ""} created`);
      onOpenChange(false);
      router.refresh();
    } catch (err: any) {
      toast.error(err?.message ?? "Something went wrong");
    } finally {
      setSaving(false);
    }
  }

  return (
    <Dialog
      open={open}
      onOpenChange={onOpenChange}
      title="New Sale"
      description="Sell a land parcel or built unit to a customer."
      className="max-w-lg"
    >
      <form onSubmit={onSubmit} className="space-y-3">
        {/* Asset type toggle */}
        <div className="space-y-1.5">
          <Label>Asset Type</Label>
          <Select value={form.assetType} onChange={(e) => { set("assetType", e.target.value); set("assetId", ""); set("salePrice", ""); }}>
            <option value="LAND">Land Parcel</option>
            <option value="BUILT_UNIT">Built Unit</option>
          </Select>
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

        {/* Customer select */}
        <div className="space-y-1.5">
          <Label htmlFor="sa-customer">Customer *</Label>
          <Select id="sa-customer" value={form.customerId} onChange={(e) => set("customerId", e.target.value)}>
            <option value="">Select a customer</option>
            {customers.map((c) => (
              <option key={c.id} value={c.id}>{c.name}</option>
            ))}
          </Select>
          {customers.length === 0 && (
            <p className="text-caption text-muted-foreground">No customers yet. Create one in the Customers tab.</p>
          )}
        </div>

        {/* Sale price + live profit */}
        <div className="grid grid-cols-2 gap-3">
          <div className="space-y-1.5">
            <Label htmlFor="sa-price">Sale Price *</Label>
            <Input id="sa-price" type="number" min="0" step="0.01" value={form.salePrice} onChange={(e) => set("salePrice", e.target.value)} required />
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

"use client";

import { useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import { Loader2, ShoppingCart, IndianRupee } from "lucide-react";
import { toast } from "sonner";
import { formatCurrency, formatNumber } from "@/lib/utils";
import { Input, Select, Label, Textarea } from "@/components/ui/input";
import { haptic } from "@/lib/haptic";

interface UnitOpt {
  id: string;
  label: string;
  projectId: string;
  askingPrice: number | null;
  area: number;
  areaUnit: string;
}
interface ParcelOpt {
  id: string;
  label: string;
  projectId: string | null;
  askingPrice: number | null;
  area: number;
  areaUnit: string;
}
interface CustomerOpt {
  id: string;
  name: string;
  phone: string | null;
}
interface ProjectOpt {
  id: string;
  name: string;
}

const PAYMENT_MODES = ["CASH", "BANK_TRANSFER", "CHEQUE", "UPI", "OTHER"] as const;

/**
 * Mobile new-sale form. Posts to the existing POST /api/sales endpoint
 * (sellAsset service). On success, redirects to the sales list so the
 * user can record the initial payment inline.
 */
export function MobileNewSaleForm({
  units,
  parcels,
  customers,
  projects,
  initialBuiltUnitId,
  initialLandParcelId,
  initialCustomerId,
}: {
  units: UnitOpt[];
  parcels: ParcelOpt[];
  customers: CustomerOpt[];
  projects: ProjectOpt[];
  initialBuiltUnitId?: string;
  initialLandParcelId?: string;
  initialCustomerId?: string;
}) {
  const router = useRouter();
  const [assetType, setAssetType] = useState<"BUILT_UNIT" | "LAND">(
    initialBuiltUnitId ? "BUILT_UNIT" : initialLandParcelId ? "LAND" : "BUILT_UNIT",
  );
  const [builtUnitId, setBuiltUnitId] = useState(initialBuiltUnitId ?? units[0]?.id ?? "");
  const [landParcelId, setLandParcelId] = useState(initialLandParcelId ?? parcels[0]?.id ?? "");
  const [customerId, setCustomerId] = useState(initialCustomerId ?? customers[0]?.id ?? "");
  const [salePrice, setSalePrice] = useState("");
  const [gstRate, setGstRate] = useState("0");
  const [initialPayment, setInitialPayment] = useState("");
  const [initialPaymentMode, setInitialPaymentMode] = useState<string>("BANK_TRANSFER");
  const [notes, setNotes] = useState("");
  const [submitting, setSubmitting] = useState(false);

  const assetOptions = assetType === "BUILT_UNIT" ? units : parcels;
  const selectedAssetId = assetType === "BUILT_UNIT" ? builtUnitId : landParcelId;
  const selectedAsset = assetOptions.find((a) => a.id === selectedAssetId);
  const projectId = selectedAsset?.projectId ?? projects[0]?.id ?? "";

  // Pre-fill sale price from the unit's asking price when an asset is chosen.
  const suggestedPrice = useMemo(() => {
    if (!selectedAsset) return "";
    return selectedAsset.askingPrice ? String(selectedAsset.askingPrice) : "";
  }, [selectedAsset]);

  function onAssetChange(id: string) {
    if (assetType === "BUILT_UNIT") setBuiltUnitId(id);
    else setLandParcelId(id);
    const a = assetOptions.find((x) => x.id === id);
    setSalePrice(a?.askingPrice ? String(a.askingPrice) : "");
  }

  async function submit() {
    if (!customerId) return toast.error("Select a customer");
    if (!projectId) return toast.error("No project for this asset");
    const price = Number(salePrice || suggestedPrice);
    if (!(price > 0)) return toast.error("Enter a valid sale price");
    const payment = initialPayment ? Number(initialPayment) : undefined;
    if (payment != null && !(payment >= 0)) return toast.error("Invalid initial payment");

    setSubmitting(true);
    try {
      const res = await fetch("/api/sales", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          assetType,
          builtUnitId: assetType === "BUILT_UNIT" ? builtUnitId : null,
          landParcelId: assetType === "LAND" ? landParcelId : null,
          customerId,
          projectId,
          salePrice: price,
          gstRate: Number(gstRate) || 0,
          initialPayment: payment,
          initialPaymentMode: payment ? initialPaymentMode : undefined,
          notes: notes || null,
        }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error ?? "Failed to create sale");
      haptic(30);
      toast.success(`Booking ${data.saleNumber} created`);
      router.push("/m/book/sales");
      router.refresh();
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "An error occurred");
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <div className="space-y-4 px-4 py-4 pb-8">
      {/* ── Asset type ────────────────────────────────────────── */}
      <div>
        <Label>Asset type</Label>
        <div className="grid grid-cols-2 gap-2">
          {(["BUILT_UNIT", "LAND"] as const).map((t) => (
            <button
              key={t}
              type="button"
              onClick={() => setAssetType(t)}
              className={`flex min-h-11 items-center justify-center rounded-lg border px-3 text-[13px] font-semibold transition-colors ${
                assetType === t
                  ? "border-brand bg-brand-soft text-brand"
                  : "border-border bg-card text-foreground"
              }`}
            >
              {t === "BUILT_UNIT" ? "Built Unit" : "Land Parcel"}
            </button>
          ))}
        </div>
      </div>

      {/* ── Asset ─────────────────────────────────────────────── */}
      <div>
        <Label>{assetType === "BUILT_UNIT" ? "Unit" : "Parcel"}</Label>
        {assetOptions.length === 0 ? (
          <p className="rounded-md border border-border bg-muted/40 px-3 py-2 text-meta text-muted-foreground">
            No {assetType === "BUILT_UNIT" ? "available units" : "available parcels"}.
          </p>
        ) : (
          <Select value={selectedAssetId} onChange={(e) => onAssetChange(e.target.value)}>
            {assetOptions.map((a) => (
              <option key={a.id} value={a.id}>
                {a.label}
              </option>
            ))}
          </Select>
        )}
        {selectedAsset && (
          <p className="mt-1.5 text-caption text-muted-foreground">
            {formatNumber(selectedAsset.area, 0)} {selectedAsset.areaUnit}
            {selectedAsset.askingPrice ? ` · asking ${formatCurrency(selectedAsset.askingPrice)}` : ""}
          </p>
        )}
      </div>

      {/* ── Customer ──────────────────────────────────────────── */}
      <div>
        <Label>Customer</Label>
        <Select value={customerId} onChange={(e) => setCustomerId(e.target.value)}>
          {customers.map((c) => (
            <option key={c.id} value={c.id}>
              {c.name}
              {c.phone ? ` · ${c.phone}` : ""}
            </option>
          ))}
        </Select>
      </div>

      {/* ── Price ─────────────────────────────────────────────── */}
      <div>
        <Label>Sale price</Label>
        <div className="relative">
          <IndianRupee className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
          <Input
            type="number"
            inputMode="decimal"
            min="0"
            step="0.01"
            value={salePrice || suggestedPrice}
            onChange={(e) => setSalePrice(e.target.value)}
            className="pl-9"
            placeholder={suggestedPrice ? suggestedPrice : "0.00"}
          />
        </div>
      </div>

      <div>
        <Label>GST rate (%)</Label>
        <Input
          type="number"
          inputMode="decimal"
          min="0"
          max="28"
          step="0.01"
          value={gstRate}
          onChange={(e) => setGstRate(e.target.value)}
        />
      </div>

      {/* ── Initial payment (optional) ────────────────────────── */}
      <div className="rounded-lg border border-border bg-card p-3">
        <p className="mb-2 text-meta font-semibold text-foreground">Initial payment (optional)</p>
        <div className="space-y-3">
          <div>
            <Label>Amount</Label>
            <div className="relative">
              <IndianRupee className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
              <Input
                type="number"
                inputMode="decimal"
                min="0"
                step="0.01"
                value={initialPayment}
                onChange={(e) => setInitialPayment(e.target.value)}
                className="pl-9"
                placeholder="0.00"
              />
            </div>
          </div>
          <div>
            <Label>Mode</Label>
            <Select value={initialPaymentMode} onChange={(e) => setInitialPaymentMode(e.target.value)}>
              {PAYMENT_MODES.map((m) => (
                <option key={m} value={m}>
                  {m.replace(/_/g, " ")}
                </option>
              ))}
            </Select>
          </div>
        </div>
      </div>

      <div>
        <Label>Notes (optional)</Label>
        <Textarea rows={2} value={notes} onChange={(e) => setNotes(e.target.value)} placeholder="Sale notes" />
      </div>

      <button
        type="button"
        onClick={submit}
        disabled={submitting}
        className="flex min-h-12 w-full items-center justify-center gap-2 rounded-lg bg-primary px-4 py-3 text-body font-semibold text-primary-foreground shadow-raised transition-colors active:scale-[0.99] disabled:opacity-60"
      >
        {submitting ? <Loader2 className="h-5 w-5 animate-spin" /> : <ShoppingCart className="h-5 w-5" />}
        Create Sale
      </button>
    </div>
  );
}

"use client";

import { useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import { Loader2, ShoppingCart, IndianRupee, Building2, MapPin } from "lucide-react";
import { toast } from "sonner";
import { formatCurrency, formatNumber } from "@/lib/utils";
import { haptic } from "@/lib/haptic";
import { MobileCreateCustomerButton } from "./mobile-customer-form";

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

const inputClass =
  "w-full h-10 rounded-[0.5rem] border px-3 text-[0.75rem] font-medium outline-none";
const inputStyle = {
  borderColor: "var(--color-line)",
  backgroundColor: "var(--color-paper)",
  color: "var(--color-ink-950)",
} as React.CSSProperties;

function FormField({
  label,
  required,
  children,
}: {
  label: string;
  required?: boolean;
  children: React.ReactNode;
}) {
  return (
    <div>
      <label
        className="block text-[0.5625rem] font-semibold mb-1"
        style={{ color: "var(--color-ink-500)" }}
      >
        {label}
        {required ? <span style={{ color: "var(--color-stop)" }}> *</span> : null}
      </label>
      {children}
    </div>
  );
}

/**
 * Mobile new-sale form. Posts to the existing POST /api/sales endpoint
 * (sellAsset service). On success, redirects to the sales list so the
 * user can record the initial payment inline.
 */
export function MobileNewSaleForm({
  units,
  parcels,
  customers: initialCustomers,
  projects,
  initialBuiltUnitId,
  initialLandParcelId,
  initialCustomerId,
  existingPhones = [],
}: {
  units: UnitOpt[];
  parcels: ParcelOpt[];
  customers: CustomerOpt[];
  projects: ProjectOpt[];
  initialBuiltUnitId?: string;
  initialLandParcelId?: string;
  initialCustomerId?: string;
  existingPhones?: string[];
}) {
  const router = useRouter();
  const [customers, setCustomers] = useState<CustomerOpt[]>(initialCustomers);
  const [assetType, setAssetType] = useState<"BUILT_UNIT" | "LAND">(
    initialBuiltUnitId ? "BUILT_UNIT" : initialLandParcelId ? "LAND" : "BUILT_UNIT",
  );
  const [builtUnitId, setBuiltUnitId] = useState(initialBuiltUnitId ?? units[0]?.id ?? "");
  const [landParcelId, setLandParcelId] = useState(initialLandParcelId ?? parcels[0]?.id ?? "");
  const [customerId, setCustomerId] = useState(initialCustomerId ?? initialCustomers[0]?.id ?? "");
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
    if (!customerId) {
      haptic([50, 20, 50]);
      return toast.error("Select a customer");
    }
    if (!projectId) {
      haptic([50, 20, 50]);
      return toast.error("No project for this asset");
    }
    const price = Number(salePrice || suggestedPrice);
    if (!(price > 0)) {
      haptic([50, 20, 50]);
      return toast.error("Enter a valid sale price");
    }
    const payment = initialPayment ? Number(initialPayment) : undefined;
    if (payment != null && !(payment >= 0)) {
      haptic([50, 20, 50]);
      return toast.error("Invalid initial payment");
    }

    setSubmitting(true);
    haptic(10);
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
      haptic([10, 40, 80]);
      toast.success(`Booking ${data.saleNumber} created`);
      router.push("/m/sales");
      router.refresh();
    } catch (err) {
      haptic([50, 20, 50]);
      toast.error(err instanceof Error ? err.message : "An error occurred");
    } finally {
      setSubmitting(false);
    }
  }

  const priceValue = Number(salePrice || suggestedPrice) || 0;
  const gstValue = priceValue * (Number(gstRate) || 0) / 100;
  const totalValue = priceValue + gstValue;

  return (
    <div className="pb-32">
      <form className="flex flex-col gap-3">
        {/* ══════ SECTION: WHAT ══════ */}
        {/* ── Asset type ── */}
        <div>
          <p className="text-[0.5625rem] font-semibold mb-1.5" style={{ color: "var(--color-ink-500)" }}>
            Asset type <span style={{ color: "var(--color-stop)" }}>*</span>
          </p>
          <div className="grid grid-cols-2 gap-2">
            <button
              type="button"
              onClick={() => { setAssetType("BUILT_UNIT"); haptic(10); }}
              className="flex flex-col items-center gap-1.5 rounded-[0.5rem] border p-3 press"
              style={{
                borderColor: assetType === "BUILT_UNIT" ? "var(--color-ink-950)" : "var(--color-line)",
                backgroundColor: assetType === "BUILT_UNIT" ? "var(--color-concrete)" : "var(--color-paper)",
              }}
            >
              <Building2
                className="size-5"
                style={{ color: assetType === "BUILT_UNIT" ? "var(--color-ink-950)" : "var(--color-ink-400)" }}
              />
              <span
                className="text-[0.5625rem] font-bold"
                style={{ color: assetType === "BUILT_UNIT" ? "var(--color-ink-950)" : "var(--color-ink-500)" }}
              >
                Built Unit
              </span>
            </button>
            <button
              type="button"
              onClick={() => { setAssetType("LAND"); haptic(10); }}
              className="flex flex-col items-center gap-1.5 rounded-[0.5rem] border p-3 press"
              style={{
                borderColor: assetType === "LAND" ? "var(--color-ink-950)" : "var(--color-line)",
                backgroundColor: assetType === "LAND" ? "var(--color-concrete)" : "var(--color-paper)",
              }}
            >
              <MapPin
                className="size-5"
                style={{ color: assetType === "LAND" ? "var(--color-ink-950)" : "var(--color-ink-400)" }}
              />
              <span
                className="text-[0.5625rem] font-bold"
                style={{ color: assetType === "LAND" ? "var(--color-ink-950)" : "var(--color-ink-500)" }}
              >
                Land Parcel
              </span>
            </button>
          </div>
        </div>

        {/* ── Asset ── */}
        <FormField label={assetType === "BUILT_UNIT" ? "Unit" : "Parcel"} required>
          {assetOptions.length === 0 ? (
            <p
              className="rounded-[0.5rem] border px-3 py-2 text-[0.5625rem]"
              style={{ borderColor: "var(--color-line)", backgroundColor: "var(--color-concrete)", color: "var(--color-ink-500)" }}
            >
              No {assetType === "BUILT_UNIT" ? "available units" : "available parcels"}.
            </p>
          ) : (
            <select
              value={selectedAssetId}
              onChange={(e) => onAssetChange(e.target.value)}
              className={inputClass}
              style={inputStyle}
            >
              {assetOptions.map((a) => (
                <option key={a.id} value={a.id}>
                  {a.label}
                </option>
              ))}
            </select>
          )}
          {selectedAsset && (
            <p className="text-[0.5rem] mt-1.5" style={{ color: "var(--color-ink-500)" }}>
              {formatNumber(selectedAsset.area, 0)} {selectedAsset.areaUnit}
              {selectedAsset.askingPrice ? ` · asking ${formatCurrency(selectedAsset.askingPrice)}` : ""}
            </p>
          )}
        </FormField>

        {/* ── Customer ── */}
        <div>
          <div className="flex items-center justify-between mb-1">
            <label
              className="text-[0.5625rem] font-semibold"
              style={{ color: "var(--color-ink-500)" }}
            >
              Customer <span style={{ color: "var(--color-stop)" }}>*</span>
            </label>
            <MobileCreateCustomerButton
              existingPhones={existingPhones}
              onCreated={(c) => {
                setCustomers((prev) => [...prev, { id: c.id, name: c.name, phone: c.phone }]);
                setCustomerId(c.id);
              }}
            />
          </div>
          <select
            value={customerId}
            onChange={(e) => setCustomerId(e.target.value)}
            className={inputClass}
            style={inputStyle}
          >
            {customers.map((c) => (
              <option key={c.id} value={c.id}>
                {c.name}
                {c.phone ? ` · ${c.phone}` : ""}
              </option>
            ))}
          </select>
        </div>

        {/* ── Price ── */}
        <FormField label="Sale price" required>
          <div className="relative">
            <IndianRupee
              className="absolute left-2.5 top-1/2 -translate-y-1/2 size-3.5"
              style={{ color: "var(--color-ink-500)" }}
            />
            <input
              type="text"
              inputMode="decimal"
              min="0"
              step="0.01"
              value={salePrice}
              onChange={(e) => setSalePrice(e.target.value)}
              className={`${inputClass} pl-7 tabular-nums font-bold`}
              style={inputStyle}
              placeholder={suggestedPrice || "0.00"}
            />
          </div>
        </FormField>

        <div className="grid grid-cols-2 gap-2">
          <FormField label="GST rate (%)">
            <input
              type="text"
              inputMode="decimal"
              min="0"
              max="28"
              step="0.01"
              value={gstRate}
              onChange={(e) => setGstRate(e.target.value)}
              className={`${inputClass} tabular-nums`}
              style={inputStyle}
            />
          </FormField>
          {/* ── Cost summary ── */}
          <div
            className="flex flex-col justify-center rounded-[0.5rem] border px-2.5 py-1.5"
            style={{ borderColor: "color-mix(in srgb, var(--color-go) 30%, var(--color-line))", backgroundColor: "color-mix(in srgb, var(--color-go) 6%, var(--color-paper))" }}
          >
            <span className="text-[0.4375rem] font-semibold uppercase" style={{ color: "var(--color-ink-500)" }}>
              Total
            </span>
            <span className="text-[0.75rem] font-bold tabular-nums" style={{ color: "var(--color-go)" }}>
              {formatCurrency(totalValue)}
            </span>
          </div>
        </div>

        {/* ══════ SECTION: HOW ══════ */}
        {/* ── Initial payment (optional) ── */}
        <div
          className="rounded-[0.625rem] border p-3"
          style={{ borderColor: "var(--color-line)", backgroundColor: "var(--color-paper)" }}
        >
          <p className="text-[0.4375rem] font-bold uppercase tracking-wide mb-2" style={{ color: "var(--color-ink-500)" }}>
            Initial payment (optional)
          </p>
          <div className="flex flex-col gap-2.5">
            <FormField label="Amount">
              <div className="relative">
                <IndianRupee
                  className="absolute left-2.5 top-1/2 -translate-y-1/2 size-3.5"
                  style={{ color: "var(--color-ink-500)" }}
                />
                <input
                  type="text"
                  inputMode="decimal"
                  min="0"
                  step="0.01"
                  value={initialPayment}
                  onChange={(e) => setInitialPayment(e.target.value)}
                  className={`${inputClass} pl-7 tabular-nums`}
                  style={inputStyle}
                  placeholder="0.00"
                />
              </div>
            </FormField>
            <FormField label="Mode">
              <select
                value={initialPaymentMode}
                onChange={(e) => setInitialPaymentMode(e.target.value)}
                className={inputClass}
                style={inputStyle}
              >
                {PAYMENT_MODES.map((m) => (
                  <option key={m} value={m}>
                    {m.replace(/_/g, " ")}
                  </option>
                ))}
              </select>
            </FormField>
          </div>
        </div>

        {/* ── Notes ── */}
        <FormField label="Notes (optional)">
          <textarea
            rows={2}
            value={notes}
            onChange={(e) => setNotes(e.target.value)}
            placeholder="Sale notes"
            className={`${inputClass} resize-none`}
            style={inputStyle}
          />
        </FormField>
      </form>

      {/* ── Sticky bottom bar ── */}
      <div
        className="fixed left-0 right-0 z-30 border-t backdrop-blur-sm"
        style={{
          bottom: "calc(3.5rem + max(env(safe-area-inset-bottom), 0px))",
          backgroundColor: "color-mix(in srgb, var(--color-paper) 97%, transparent)",
          borderColor: "var(--color-line)",
        }}
      >
        <div className="max-w-md mx-auto px-3.5 py-2">
          <button
            type="button"
            onClick={submit}
            disabled={submitting}
            className="flex w-full items-center justify-center gap-1.5 rounded-[0.5rem] py-2.5 text-[0.75rem] font-bold press disabled:opacity-50"
            style={{ backgroundColor: "var(--color-ink-950)", color: "#fff" }}
          >
            {submitting ? (
              <Loader2 className="size-4 animate-spin" />
            ) : (
              <>
                <ShoppingCart className="size-3.5" />
                Create Sale
              </>
            )}
          </button>
        </div>
      </div>
    </div>
  );
}

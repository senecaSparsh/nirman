"use client";

import { useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import { Loader2, ShoppingCart, IndianRupee, Building2, MapPin, ShieldCheck } from "lucide-react";
import { toast } from "sonner";
import { formatCurrency, formatNumber } from "@/lib/utils";
import { haptic } from "@/lib/haptic";
import { MobileSelectWithCreate } from "@/components/mobile/MobileSelectWithCreate";
import { MobileNewCustomerDialog } from "@/app/m/sales/MobileNewCustomerDialog";

interface UnitOpt {
  id: string;
  label: string;
  projectId: string;
  projectReraNumber: string | null;
  askingPrice: number | null;
  area: number;
  areaUnit: string;
}
interface ParcelOpt {
  id: string;
  label: string;
  projectId: string | null;
  projectReraNumber: string | null;
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
  // Sale deed / ATS tracking
  const [isATS, setIsATS] = useState(true); // default: booking, registry deferred
  const [saleDeedNo, setSaleDeedNo] = useState("");
  const [expectedRegistryDate, setExpectedRegistryDate] = useState("");
  // Home loan tracking (optional)
  const [hasHomeLoan, setHasHomeLoan] = useState(false);
  const [homeLoanBank, setHomeLoanBank] = useState("");
  const [homeLoanAmount, setHomeLoanAmount] = useState("");
  const [homeLoanSanctionNo, setHomeLoanSanctionNo] = useState("");
  const [homeLoanSanctionDate, setHomeLoanSanctionDate] = useState("");
  // Deal terms
  const [dealMaturityMonths, setDealMaturityMonths] = useState("");
  const [dealSource, setDealSource] = useState<"SELF" | "BROKER">("SELF");
  const [brokerName, setBrokerName] = useState("");
  const [brokerPhone, setBrokerPhone] = useState("");
  const [commissionAmount, setCommissionAmount] = useState("");
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
          // Sale deed / ATS tracking
          saleDeedNo: !isATS && saleDeedNo.trim() ? saleDeedNo.trim() : null,
          expectedRegistryDate: isATS && expectedRegistryDate ? expectedRegistryDate : null,
          // Home loan tracking
          homeLoanBank: hasHomeLoan && homeLoanBank.trim() ? homeLoanBank.trim() : null,
          homeLoanAmount: hasHomeLoan && homeLoanAmount ? Number(homeLoanAmount) : null,
          homeLoanSanctionNo: hasHomeLoan && homeLoanSanctionNo.trim() ? homeLoanSanctionNo.trim() : null,
          homeLoanSanctionDate: hasHomeLoan && homeLoanSanctionDate ? homeLoanSanctionDate : null,
          // Deal terms
          dealMaturityMonths: dealMaturityMonths ? Number(dealMaturityMonths) : null,
          // Broker / deal source
          dealSource,
          brokerName: dealSource === "BROKER" && brokerName.trim() ? brokerName.trim() : null,
          brokerPhone: dealSource === "BROKER" && brokerPhone.trim() ? brokerPhone.trim() : null,
          commissionAmount: dealSource === "BROKER" && commissionAmount ? Number(commissionAmount) : null,
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

        {/* ── RERA warning (built unit without RERA) ── */}
        {assetType === "BUILT_UNIT" && selectedAsset && !selectedAsset.projectReraNumber && (
          <div
            className="flex items-start gap-2 rounded-[0.5rem] border p-2.5"
            style={{
              borderColor: "color-mix(in srgb, var(--color-stop) 30%, var(--color-line))",
              backgroundColor: "color-mix(in srgb, var(--color-stop) 6%, var(--color-paper))",
            }}
          >
            <ShieldCheck className="size-3.5 shrink-0 mt-0.5" style={{ color: "var(--color-stop)" }} />
            <div>
              <p className="text-[0.5625rem] font-bold" style={{ color: "var(--color-ink-950)" }}>RERA not registered</p>
              <p className="text-[0.5rem] mt-0.5" style={{ color: "var(--color-ink-500)" }}>
                This project has no RERA number. Selling units without RERA registration is illegal under RERA Act 2016.
              </p>
            </div>
          </div>
        )}

        {/* ── Customer ── */}
        <MobileSelectWithCreate
          label="Customer"
          required
          value={customerId}
          onChange={setCustomerId}
          options={customers.map((c) => ({
            value: c.id,
            label: c.phone ? `${c.name} · ${c.phone}` : c.name,
          }))}
          inputClass={inputClass}
          inputStyle={inputStyle}
          renderDialog={({ open, onClose, onCreated }) => (
            <MobileNewCustomerDialog
              open={open}
              onClose={onClose}
              onCreated={(c) => {
                setCustomers((prev) => [...prev, { id: c.id, name: c.name, phone: null }]);
                onCreated(c.id, c.name);
              }}
            />
          )}
        />

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

        {/* ── Sale Deed / ATS ── */}
        <div className="rounded-[0.5rem] border p-3 space-y-2.5" style={{ borderColor: "var(--color-line)" }}>
          <div>
            <div className="text-[0.6875rem] font-bold" style={{ color: "var(--color-ink-950)" }}>Sale Deed / Registry</div>
            <div className="text-[0.5625rem]" style={{ color: "var(--color-ink-500)" }}>
              Booking (ATS — registry deferred) or completed sale (sale deed registered)?
            </div>
          </div>
          <div className="grid grid-cols-2 gap-2">
            <button type="button" onClick={() => { setIsATS(true); haptic(10); }}
              className="h-9 rounded-[0.375rem] border-2 text-[0.5625rem] font-bold press"
              style={{
                borderColor: isATS ? "var(--color-ink-950)" : "var(--color-line)",
                backgroundColor: isATS ? "var(--color-ink-950)" : "var(--color-paper)",
                color: isATS ? "#fff" : "var(--color-ink-500)",
              }}>
              ATS (Booking)
            </button>
            <button type="button" onClick={() => { setIsATS(false); haptic(10); }}
              className="h-9 rounded-[0.375rem] border-2 text-[0.5625rem] font-bold press"
              style={{
                borderColor: !isATS ? "var(--color-ink-950)" : "var(--color-line)",
                backgroundColor: !isATS ? "var(--color-ink-950)" : "var(--color-paper)",
                color: !isATS ? "#fff" : "var(--color-ink-500)",
              }}>
              Sale Deed Done
            </button>
          </div>
          {isATS ? (
            <FormField label="Expected Registry Date">
              <input type="date" value={expectedRegistryDate}
                onChange={(e) => setExpectedRegistryDate(e.target.value)}
                className={inputClass} style={inputStyle} />
              <p className="text-[0.5rem] mt-1" style={{ color: "var(--color-ink-500)" }}>
                When the full sale deed registration is expected.
              </p>
            </FormField>
          ) : (
            <FormField label="Sale Deed / Registry No.">
              <input type="text" value={saleDeedNo}
                onChange={(e) => setSaleDeedNo(e.target.value)}
                placeholder="e.g. SR-1234/2025"
                className={inputClass} style={inputStyle} />
              <p className="text-[0.5rem] mt-1" style={{ color: "var(--color-ink-500)" }}>
                The registered sale deed number from the sub-registrar.
              </p>
            </FormField>
          )}
        </div>

        {/* ── Home Loan (optional) ── */}
        <div className="rounded-[0.5rem] border p-3 space-y-2.5" style={{ borderColor: "var(--color-line)" }}>
          <div className="flex items-center justify-between">
            <div>
              <div className="text-[0.6875rem] font-bold" style={{ color: "var(--color-ink-950)" }}>Home Loan</div>
              <div className="text-[0.5625rem]" style={{ color: "var(--color-ink-500)" }}>
                Is the buyer taking a home loan?
              </div>
            </div>
            <div className="grid grid-cols-2 gap-1.5">
              <button type="button" onClick={() => { setHasHomeLoan(false); haptic(10); }}
                className="h-7 rounded-[0.375rem] border-2 text-[0.5rem] font-bold press px-2.5"
                style={{
                  borderColor: !hasHomeLoan ? "var(--color-ink-950)" : "var(--color-line)",
                  backgroundColor: !hasHomeLoan ? "var(--color-ink-950)" : "var(--color-paper)",
                  color: !hasHomeLoan ? "#fff" : "var(--color-ink-500)",
                }}>
                No
              </button>
              <button type="button" onClick={() => { setHasHomeLoan(true); haptic(10); }}
                className="h-7 rounded-[0.375rem] border-2 text-[0.5rem] font-bold press px-2.5"
                style={{
                  borderColor: hasHomeLoan ? "var(--color-ink-950)" : "var(--color-line)",
                  backgroundColor: hasHomeLoan ? "var(--color-ink-950)" : "var(--color-paper)",
                  color: hasHomeLoan ? "#fff" : "var(--color-ink-500)",
                }}>
                Yes
              </button>
            </div>
          </div>
          {hasHomeLoan && (
            <div className="space-y-2.5 pt-1">
              <div className="grid grid-cols-2 gap-2">
                <FormField label="Bank / Institution">
                  <input type="text" value={homeLoanBank}
                    onChange={(e) => setHomeLoanBank(e.target.value)}
                    placeholder="e.g. HDFC, SBI"
                    className={inputClass} style={inputStyle} />
                </FormField>
                <FormField label="Loan Amount (₹)">
                  <input type="text" inputMode="decimal" value={homeLoanAmount}
                    onChange={(e) => setHomeLoanAmount(e.target.value)}
                    placeholder="0"
                    className={`${inputClass} tabular-nums`} style={inputStyle} />
                </FormField>
              </div>
              <div className="grid grid-cols-2 gap-2">
                <FormField label="Sanction Letter No.">
                  <input type="text" value={homeLoanSanctionNo}
                    onChange={(e) => setHomeLoanSanctionNo(e.target.value)}
                    placeholder="e.g. HDFC-2025-001"
                    className={inputClass} style={inputStyle} />
                </FormField>
                <FormField label="Sanction Date">
                  <input type="date" value={homeLoanSanctionDate}
                    onChange={(e) => setHomeLoanSanctionDate(e.target.value)}
                    className={inputClass} style={inputStyle} />
                </FormField>
              </div>
            </div>
          )}
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

        {/* ── Deal Terms ── */}
        <FormField label="Deal Maturity (months)">
          <input
            type="number"
            inputMode="numeric"
            min="0"
            value={dealMaturityMonths}
            onChange={(e) => setDealMaturityMonths(e.target.value)}
            placeholder="e.g. 4"
            className={`${inputClass} tabular-nums`}
            style={inputStyle}
          />
        </FormField>

        {/* ── Deal Source (Broker/Self) ── */}
        <FormField label="Deal Source">
          <div className="grid grid-cols-2 gap-2">
            <button
              type="button"
              onClick={() => setDealSource("SELF")}
              className="h-10 rounded-[0.5rem] border text-[0.75rem] font-medium transition-colors"
              style={{
                borderColor: dealSource === "SELF" ? "var(--color-ink-950)" : "var(--color-line)",
                backgroundColor: dealSource === "SELF" ? "var(--color-concrete)" : "var(--color-paper)",
                color: dealSource === "SELF" ? "var(--color-ink-950)" : "var(--color-ink-500)",
              }}
            >
              Self (Direct)
            </button>
            <button
              type="button"
              onClick={() => setDealSource("BROKER")}
              className="h-10 rounded-[0.5rem] border text-[0.75rem] font-medium transition-colors"
              style={{
                borderColor: dealSource === "BROKER" ? "var(--color-ink-950)" : "var(--color-line)",
                backgroundColor: dealSource === "BROKER" ? "var(--color-concrete)" : "var(--color-paper)",
                color: dealSource === "BROKER" ? "var(--color-ink-950)" : "var(--color-ink-500)",
              }}
            >
              Broker
            </button>
          </div>
        </FormField>

        {dealSource === "BROKER" && (
          <div className="space-y-2 rounded-lg border p-2" style={{ borderColor: "var(--color-line)" }}>
            <div className="grid grid-cols-2 gap-2">
              <FormField label="Broker Name">
                <input
                  type="text"
                  value={brokerName}
                  onChange={(e) => setBrokerName(e.target.value)}
                  placeholder="Name"
                  className={inputClass}
                  style={inputStyle}
                />
              </FormField>
              <FormField label="Broker Phone">
                <input
                  type="tel"
                  value={brokerPhone}
                  onChange={(e) => setBrokerPhone(e.target.value)}
                  placeholder="Phone"
                  className={inputClass}
                  style={inputStyle}
                />
              </FormField>
            </div>
            <FormField label="Commission Amount">
              <input
                type="number"
                inputMode="decimal"
                min="0"
                value={commissionAmount}
                onChange={(e) => setCommissionAmount(e.target.value)}
                placeholder="0"
                className={`${inputClass} tabular-nums`}
                style={inputStyle}
              />
            </FormField>
          </div>
        )}
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

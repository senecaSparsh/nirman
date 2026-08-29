"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { Loader2, Save, ChevronDown, ChevronUp } from "lucide-react";
import { toast } from "sonner";
import { BottomSheet } from "@/components/mobile/v2/bottom-sheet";
import { formatCurrency } from "@/lib/utils";

interface LandData {
  id: string;
  sellerName: string;
  sellerContact: string | null;
  purchaseDate: string;
  totalArea: number;
  areaUnit: string;
  totalCost: number;
  registryNo: string | null;
  location: string | null;
  documentUrl: string | null;
  // Land type & lease
  landType?: "FREEHOLD" | "LEASEHOLD" | null;
  leaseType?: "ONE_TIME" | "YEARLY" | null;
  leasePeriodYears?: number | null;
  leaseStartDate?: string | null;
  leaseEndDate?: string | null;
  // Cost breakup
  baseCost?: number;
  leaseRentPercent?: number | null;
  leaseRentAmount?: number | null;
  gstPercent?: number | null;
  gstAmount?: number | null;
  registrationPercent?: number | null;
  registrationAmount?: number | null;
  stampDutyPercent?: number | null;
  stampDutyAmount?: number | null;
  transferDutyPercent?: number | null;
  transferDutyAmount?: number | null;
  brokerageAmount?: number | null;
  legalFees?: number | null;
  otherCharges?: number | null;
}

const AREA_UNITS = ["SQFT", "SQM", "SQYD", "ACRE", "BIGHA", "KATHA", "HECTARE"] as const;

const AREA_UNIT_LABELS: Record<string, string> = {
  SQFT: "sqft", SQM: "sqm", SQYD: "sqyd", ACRE: "acre",
  BIGHA: "bigha", KATHA: "katha", HECTARE: "ha",
};

export function MobileLandEditForm({
  land,
  onClose,
}: {
  land: LandData;
  onClose: () => void;
}) {
  const router = useRouter();
  const [sellerName, setSellerName] = useState(land.sellerName);
  const [sellerContact, setSellerContact] = useState(land.sellerContact ?? "");
  const [purchaseDate, setPurchaseDate] = useState(land.purchaseDate ? land.purchaseDate.split("T")[0] : "");
  const [totalArea, setTotalArea] = useState(String(land.totalArea));
  const [areaUnit, setAreaUnit] = useState(land.areaUnit);
  const [totalCost, setTotalCost] = useState(String(land.totalCost));
  const [registryNo, setRegistryNo] = useState(land.registryNo ?? "");
  const [location, setLocation] = useState(land.location ?? "");
  const [documentUrl, setDocumentUrl] = useState(land.documentUrl ?? "");
  const [saving, setSaving] = useState(false);

  // Land type & lease
  const [landType, setLandType] = useState<"FREEHOLD" | "LEASEHOLD">(land.landType ?? "FREEHOLD");
  const [leaseType, setLeaseType] = useState<"ONE_TIME" | "YEARLY">(land.leaseType ?? "ONE_TIME");
  const [leasePeriodYears, setLeasePeriodYears] = useState(land.leasePeriodYears ? String(land.leasePeriodYears) : "");
  const [leaseStartDate, setLeaseStartDate] = useState(land.leaseStartDate ? land.leaseStartDate.split("T")[0] : "");
  const [leaseEndDate, setLeaseEndDate] = useState(land.leaseEndDate ? land.leaseEndDate.split("T")[0] : "");

  // Cost breakup
  const [baseCost, setBaseCost] = useState(land.baseCost != null ? String(land.baseCost) : "");
  const [leaseRentPercent, setLeaseRentPercent] = useState(land.leaseRentPercent != null ? String(land.leaseRentPercent) : "");
  const [gstPercent, setGstPercent] = useState(land.gstPercent != null ? String(land.gstPercent) : "");
  const [registrationPercent, setRegistrationPercent] = useState(land.registrationPercent != null ? String(land.registrationPercent) : "");
  const [stampDutyPercent, setStampDutyPercent] = useState(land.stampDutyPercent != null ? String(land.stampDutyPercent) : "");
  const [transferDutyPercent, setTransferDutyPercent] = useState(land.transferDutyPercent != null ? String(land.transferDutyPercent) : "");
  const [brokerageAmount, setBrokerageAmount] = useState(land.brokerageAmount != null ? String(land.brokerageAmount) : "");
  const [legalFees, setLegalFees] = useState(land.legalFees != null ? String(land.legalFees) : "");
  const [otherCharges, setOtherCharges] = useState(land.otherCharges != null ? String(land.otherCharges) : "");

  const [showCostBreakup, setShowCostBreakup] = useState(false);

  // Auto-calc cost breakup amounts
  const baseCostNum = Number(baseCost) || 0;
  const isLeasehold = landType === "LEASEHOLD";
  const isYearlyLease = isLeasehold && leaseType === "YEARLY";
  const leaseRentAmount = isLeasehold && baseCostNum > 0 && Number(leaseRentPercent) > 0
    ? (baseCostNum * Number(leaseRentPercent)) / 100 : 0;
  const gstAmount = isLeasehold && leaseRentAmount > 0 && Number(gstPercent) > 0
    ? (leaseRentAmount * Number(gstPercent)) / 100 : 0;
  const registrationAmount = baseCostNum > 0 && Number(registrationPercent) > 0
    ? (baseCostNum * Number(registrationPercent)) / 100 : 0;
  const stampDutyAmount = baseCostNum > 0 && Number(stampDutyPercent) > 0
    ? (baseCostNum * Number(stampDutyPercent)) / 100 : 0;
  const transferDutyAmount = baseCostNum > 0 && Number(transferDutyPercent) > 0
    ? (baseCostNum * Number(transferDutyPercent)) / 100 : 0;
  const brokerageNum = Number(brokerageAmount) || 0;
  const legalFeesNum = Number(legalFees) || 0;
  const otherChargesNum = Number(otherCharges) || 0;
  const calculatedTotal = baseCostNum + leaseRentAmount + gstAmount + registrationAmount + stampDutyAmount + transferDutyAmount + brokerageNum + legalFeesNum + otherChargesNum;

  const handleSave = async () => {
    if (!sellerName.trim()) {
      toast.error("Seller name is required");
      return;
    }
    if (!totalArea || Number(totalArea) <= 0) {
      toast.error("Total area must be > 0");
      return;
    }
    if (!totalCost || Number(totalCost) <= 0) {
      toast.error("Total cost must be > 0");
      return;
    }
    setSaving(true);
    try {
      const res = await fetch(`/api/land-purchases/${land.id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          sellerName: sellerName.trim(),
          sellerContact: sellerContact.trim() || null,
          purchaseDate: purchaseDate || null,
          totalArea: Number(totalArea),
          areaUnit,
          totalCost: Number(totalCost),
          registryNo: registryNo.trim() || null,
          location: location.trim() || null,
          documentUrl: documentUrl.trim() || null,
          // Land type & lease
          landType,
          leaseType: isLeasehold ? leaseType : null,
          leasePeriodYears: isLeasehold && leasePeriodYears ? Number(leasePeriodYears) : null,
          leaseStartDate: isLeasehold && leaseStartDate ? leaseStartDate : null,
          leaseEndDate: isLeasehold && leaseEndDate ? leaseEndDate : null,
          // Cost breakup
          baseCost: baseCostNum || null,
          leaseRentPercent: isLeasehold && leaseRentPercent ? Number(leaseRentPercent) : null,
          leaseRentAmount: isLeasehold && leaseRentAmount ? leaseRentAmount : null,
          gstPercent: isLeasehold && gstPercent ? Number(gstPercent) : null,
          gstAmount: isLeasehold && gstAmount ? gstAmount : null,
          registrationPercent: registrationPercent ? Number(registrationPercent) : null,
          registrationAmount: registrationAmount || null,
          stampDutyPercent: stampDutyPercent ? Number(stampDutyPercent) : null,
          stampDutyAmount: stampDutyAmount || null,
          transferDutyPercent: transferDutyPercent ? Number(transferDutyPercent) : null,
          transferDutyAmount: transferDutyAmount || null,
          brokerageAmount: brokerageNum || null,
          legalFees: legalFeesNum || null,
          otherCharges: otherChargesNum || null,
        }),
      });
      if (!res.ok) {
        const err = await res.json().catch(() => ({}));
        throw new Error(err.error ?? "Failed to update land purchase");
      }
      toast.success("Land purchase updated");
      router.refresh();
      onClose();
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Failed to update");
    } finally {
      setSaving(false);
    }
  };

  const inputClass =
    "w-full rounded-[0.375rem] border px-2.5 py-2 text-[0.75rem] font-medium outline-none";
  const labelClass = "block text-[0.5625rem] font-semibold mb-1";
  const labelStyle = { color: "var(--color-ink-500)" };
  const inputStyle = { borderColor: "var(--color-line)", backgroundColor: "var(--color-paper)", color: "var(--color-ink-950)" };

  return (
    <BottomSheet title="Edit Land Purchase" onClose={onClose}>
      <div className="space-y-3">
        {/* Seller Name */}
        <div>
          <label className={labelClass} style={labelStyle}>
            Seller Name <span style={{ color: "var(--color-stop)" }}>*</span>
          </label>
          <input
            type="text"
            value={sellerName}
            onChange={(e) => setSellerName(e.target.value)}
            className={inputClass}
            style={inputStyle}
            placeholder="Seller name"
          />
        </div>

        {/* Seller Contact */}
        <div>
          <label className={labelClass} style={labelStyle}>Seller Contact</label>
          <input
            type="tel"
            value={sellerContact}
            onChange={(e) => setSellerContact(e.target.value)}
            className={`${inputClass} font-mono`}
            style={inputStyle}
            placeholder="9876543210"
          />
        </div>

        {/* Purchase Date */}
        <div>
          <label className={labelClass} style={labelStyle}>Purchase Date</label>
          <input
            type="date"
            value={purchaseDate}
            onChange={(e) => setPurchaseDate(e.target.value)}
            className={inputClass}
            style={inputStyle}
          />
        </div>

        {/* Area + Unit */}
        <div className="grid grid-cols-2 gap-2">
          <div>
            <label className={labelClass} style={labelStyle}>
              Total Area <span style={{ color: "var(--color-stop)" }}>*</span>
            </label>
            <input
              type="text" inputMode="decimal"
              step="any"
              value={totalArea}
              onChange={(e) => setTotalArea(e.target.value)}
              className={`${inputClass} font-mono`}
              style={inputStyle}
              placeholder="0"
            />
          </div>
          <div>
            <label className={labelClass} style={labelStyle}>Unit</label>
            <select
              value={areaUnit}
              onChange={(e) => setAreaUnit(e.target.value)}
              className={inputClass}
              style={inputStyle}
            >
              {AREA_UNITS.map((u) => (
                <option key={u} value={u}>{AREA_UNIT_LABELS[u]}</option>
              ))}
            </select>
          </div>
        </div>

        {/* Total Cost */}
        <div>
          <label className={labelClass} style={labelStyle}>
            Total Cost <span style={{ color: "var(--color-stop)" }}>*</span>
          </label>
          <input
            type="text" inputMode="decimal"
            step="any"
            value={totalCost}
            onChange={(e) => setTotalCost(e.target.value)}
            className={`${inputClass} font-mono`}
            style={inputStyle}
            placeholder="0"
          />
        </div>

        {/* Registry No */}
        <div>
          <label className={labelClass} style={labelStyle}>Registry No</label>
          <input
            type="text"
            value={registryNo}
            onChange={(e) => setRegistryNo(e.target.value)}
            className={`${inputClass} font-mono`}
            style={inputStyle}
            placeholder="Registry document number"
          />
        </div>

        {/* Location */}
        <div>
          <label className={labelClass} style={labelStyle}>Location</label>
          <input
            type="text"
            value={location}
            onChange={(e) => setLocation(e.target.value)}
            className={inputClass}
            style={inputStyle}
            placeholder="Village, district, state"
          />
        </div>

        {/* Document URL */}
        <div>
          <label className={labelClass} style={labelStyle}>Document URL (optional)</label>
          <input
            type="text"
            value={documentUrl}
            onChange={(e) => setDocumentUrl(e.target.value)}
            className={inputClass}
            style={inputStyle}
            placeholder="https://..."
          />
        </div>

        {/* ── Land Type ── */}
        <div className="border-t pt-3" style={{ borderColor: "var(--color-line)" }}>
          <label className={labelClass} style={labelStyle}>Land Type</label>
          <div className="grid grid-cols-2 gap-2">
            <button
              type="button"
              onClick={() => setLandType("FREEHOLD")}
              className={`rounded-[0.375rem] border py-2 text-[0.6875rem] font-semibold press ${landType === "FREEHOLD" ? "border-ink-950 bg-ink-950 text-paper" : ""}`}
              style={landType === "FREEHOLD"
                ? { borderColor: "var(--color-ink-950)", backgroundColor: "var(--color-ink-950)", color: "var(--color-paper)" }
                : { borderColor: "var(--color-line)", backgroundColor: "var(--color-paper)", color: "var(--color-ink-700)" }}
            >
              Freehold
            </button>
            <button
              type="button"
              onClick={() => setLandType("LEASEHOLD")}
              className={`rounded-[0.375rem] border py-2 text-[0.6875rem] font-semibold press ${landType === "LEASEHOLD" ? "border-ink-950 bg-ink-950 text-paper" : ""}`}
              style={landType === "LEASEHOLD"
                ? { borderColor: "var(--color-ink-950)", backgroundColor: "var(--color-ink-950)", color: "var(--color-paper)" }
                : { borderColor: "var(--color-line)", backgroundColor: "var(--color-paper)", color: "var(--color-ink-700)" }}
            >
              Leasehold
            </button>
          </div>
        </div>

        {/* ── Lease details (leasehold only) ── */}
        {isLeasehold && (
          <div className="space-y-3">
            <div>
              <label className={labelClass} style={labelStyle}>Lease Type</label>
              <div className="grid grid-cols-2 gap-2">
                <button
                  type="button"
                  onClick={() => setLeaseType("ONE_TIME")}
                  className={`rounded-[0.375rem] border py-2 text-[0.6875rem] font-semibold press ${leaseType === "ONE_TIME" ? "border-ink-950 bg-ink-950 text-paper" : ""}`}
                  style={leaseType === "ONE_TIME"
                    ? { borderColor: "var(--color-ink-950)", backgroundColor: "var(--color-ink-950)", color: "var(--color-paper)" }
                    : { borderColor: "var(--color-line)", backgroundColor: "var(--color-paper)", color: "var(--color-ink-700)" }}
                >
                  One-time
                </button>
                <button
                  type="button"
                  onClick={() => setLeaseType("YEARLY")}
                  className={`rounded-[0.375rem] border py-2 text-[0.6875rem] font-semibold press ${leaseType === "YEARLY" ? "border-ink-950 bg-ink-950 text-paper" : ""}`}
                  style={leaseType === "YEARLY"
                    ? { borderColor: "var(--color-ink-950)", backgroundColor: "var(--color-ink-950)", color: "var(--color-paper)" }
                    : { borderColor: "var(--color-line)", backgroundColor: "var(--color-paper)", color: "var(--color-ink-700)" }}
                >
                  Yearly
                </button>
              </div>
            </div>
            <div className="grid grid-cols-2 gap-2">
              <div>
                <label className={labelClass} style={labelStyle}>Lease Period (years)</label>
                <input
                  type="text" inputMode="numeric"
                  value={leasePeriodYears}
                  onChange={(e) => setLeasePeriodYears(e.target.value)}
                  className={`${inputClass} font-mono`}
                  style={inputStyle}
                  placeholder="99"
                />
              </div>
              <div></div>
            </div>
            <div className="grid grid-cols-2 gap-2">
              <div>
                <label className={labelClass} style={labelStyle}>Lease Start</label>
                <input
                  type="date"
                  value={leaseStartDate}
                  onChange={(e) => setLeaseStartDate(e.target.value)}
                  className={inputClass}
                  style={inputStyle}
                />
              </div>
              <div>
                <label className={labelClass} style={labelStyle}>Lease End</label>
                <input
                  type="date"
                  value={leaseEndDate}
                  onChange={(e) => setLeaseEndDate(e.target.value)}
                  className={inputClass}
                  style={inputStyle}
                />
              </div>
            </div>
          </div>
        )}

        {/* ── Cost Breakup (collapsible) ── */}
        <div className="border-t pt-3" style={{ borderColor: "var(--color-line)" }}>
          <button
            type="button"
            onClick={() => setShowCostBreakup(!showCostBreakup)}
            className="flex w-full items-center justify-between text-[0.6875rem] font-bold press"
            style={{ color: "var(--color-ink-950)" }}
          >
            <span>Cost Breakup</span>
            {showCostBreakup ? <ChevronUp className="size-3.5" /> : <ChevronDown className="size-3.5" />}
          </button>

          {showCostBreakup && (
            <div className="mt-3 space-y-3">
              {/* Base Cost */}
              <div>
                <label className={labelClass} style={labelStyle}>Base Cost (₹) — land price</label>
                <input
                  type="text" inputMode="decimal"
                  step="any"
                  value={baseCost}
                  onChange={(e) => setBaseCost(e.target.value)}
                  className={`${inputClass} font-mono`}
                  style={inputStyle}
                  placeholder="e.g. 5000000"
                />
              </div>

              {/* Lease Rent (leasehold only) */}
              {isLeasehold && (
                <div className="grid grid-cols-2 gap-2">
                  <div>
                    <label className={labelClass} style={labelStyle}>Lease Rent (%)</label>
                    <input
                      type="text" inputMode="decimal"
                      step="any"
                      value={leaseRentPercent}
                      onChange={(e) => setLeaseRentPercent(e.target.value)}
                      className={`${inputClass} font-mono`}
                      style={inputStyle}
                      placeholder="10"
                    />
                  </div>
                  <div>
                    <label className={labelClass} style={labelStyle}>Rent Amount{isYearlyLease ? " /yr" : ""}</label>
                    <div className="flex h-[2.25rem] items-center rounded-[0.375rem] border px-2.5 text-[0.75rem] text-muted-foreground font-mono" style={inputStyle}>
                      {leaseRentAmount > 0 ? formatCurrency(leaseRentAmount) : "—"}
                    </div>
                  </div>
                </div>
              )}

              {/* GST (leasehold only) */}
              {isLeasehold && (
                <div className="grid grid-cols-2 gap-2">
                  <div>
                    <label className={labelClass} style={labelStyle}>GST on Rent (%)</label>
                    <input
                      type="text" inputMode="decimal"
                      step="any"
                      value={gstPercent}
                      onChange={(e) => setGstPercent(e.target.value)}
                      className={`${inputClass} font-mono`}
                      style={inputStyle}
                      placeholder="18"
                    />
                  </div>
                  <div>
                    <label className={labelClass} style={labelStyle}>GST Amount</label>
                    <div className="flex h-[2.25rem] items-center rounded-[0.375rem] border px-2.5 text-[0.75rem] text-muted-foreground font-mono" style={inputStyle}>
                      {gstAmount > 0 ? formatCurrency(gstAmount) : "—"}
                    </div>
                  </div>
                </div>
              )}

              {/* Registration */}
              <div className="grid grid-cols-2 gap-2">
                <div>
                  <label className={labelClass} style={labelStyle}>Registration (%)</label>
                  <input
                    type="text" inputMode="decimal"
                    step="any"
                    value={registrationPercent}
                    onChange={(e) => setRegistrationPercent(e.target.value)}
                    className={`${inputClass} font-mono`}
                    style={inputStyle}
                    placeholder="1"
                  />
                </div>
                <div>
                  <label className={labelClass} style={labelStyle}>Reg. Amount</label>
                  <div className="flex h-[2.25rem] items-center rounded-[0.375rem] border px-2.5 text-[0.75rem] text-muted-foreground font-mono" style={inputStyle}>
                    {registrationAmount > 0 ? formatCurrency(registrationAmount) : "—"}
                  </div>
                </div>
              </div>

              {/* Stamp Duty */}
              <div className="grid grid-cols-2 gap-2">
                <div>
                  <label className={labelClass} style={labelStyle}>Stamp Duty (%)</label>
                  <input
                    type="text" inputMode="decimal"
                    step="any"
                    value={stampDutyPercent}
                    onChange={(e) => setStampDutyPercent(e.target.value)}
                    className={`${inputClass} font-mono`}
                    style={inputStyle}
                    placeholder="5"
                  />
                </div>
                <div>
                  <label className={labelClass} style={labelStyle}>Stamp Amount</label>
                  <div className="flex h-[2.25rem] items-center rounded-[0.375rem] border px-2.5 text-[0.75rem] text-muted-foreground font-mono" style={inputStyle}>
                    {stampDutyAmount > 0 ? formatCurrency(stampDutyAmount) : "—"}
                  </div>
                </div>
              </div>

              {/* Transfer Duty */}
              <div className="grid grid-cols-2 gap-2">
                <div>
                  <label className={labelClass} style={labelStyle}>Transfer Duty (%)</label>
                  <input
                    type="text" inputMode="decimal"
                    step="any"
                    value={transferDutyPercent}
                    onChange={(e) => setTransferDutyPercent(e.target.value)}
                    className={`${inputClass} font-mono`}
                    style={inputStyle}
                    placeholder="0"
                  />
                </div>
                <div>
                  <label className={labelClass} style={labelStyle}>Transfer Amount</label>
                  <div className="flex h-[2.25rem] items-center rounded-[0.375rem] border px-2.5 text-[0.75rem] text-muted-foreground font-mono" style={inputStyle}>
                    {transferDutyAmount > 0 ? formatCurrency(transferDutyAmount) : "—"}
                  </div>
                </div>
              </div>

              {/* Additional costs */}
              <div>
                <label className={labelClass} style={labelStyle}>Brokerage (₹)</label>
                <input
                  type="text" inputMode="decimal"
                  step="any"
                  value={brokerageAmount}
                  onChange={(e) => setBrokerageAmount(e.target.value)}
                  className={`${inputClass} font-mono`}
                  style={inputStyle}
                  placeholder="0"
                />
              </div>
              <div>
                <label className={labelClass} style={labelStyle}>Legal Fees (₹)</label>
                <input
                  type="text" inputMode="decimal"
                  step="any"
                  value={legalFees}
                  onChange={(e) => setLegalFees(e.target.value)}
                  className={`${inputClass} font-mono`}
                  style={inputStyle}
                  placeholder="0"
                />
              </div>
              <div>
                <label className={labelClass} style={labelStyle}>Other Charges (₹)</label>
                <input
                  type="text" inputMode="decimal"
                  step="any"
                  value={otherCharges}
                  onChange={(e) => setOtherCharges(e.target.value)}
                  className={`${inputClass} font-mono`}
                  style={inputStyle}
                  placeholder="0"
                />
              </div>

              {/* Calculated total */}
              {calculatedTotal > 0 && (
                <div className="rounded-[0.375rem] border p-2 space-y-0.5" style={{ borderColor: "var(--color-line)", backgroundColor: "var(--color-concrete)" }}>
                  <div className="flex justify-between text-[0.5625rem] font-bold">
                    <span style={{ color: "var(--color-ink-500)" }}>Calculated Total:</span>
                    <strong style={{ color: "var(--color-ink-950)" }} className="tabular-nums">{formatCurrency(calculatedTotal)}</strong>
                  </div>
                  {calculatedTotal !== Number(totalCost) && (
                    <div className="text-[0.5rem]" style={{ color: "var(--color-signal)" }}>
                      Differs from total cost above — update total to match?
                    </div>
                  )}
                </div>
              )}
            </div>
          )}
        </div>

        {/* Save button */}
        <button
          onClick={handleSave}
          disabled={saving}
          className="w-full flex items-center justify-center gap-2 rounded-[0.625rem] py-3 text-[0.8125rem] font-bold press transition-transform active:scale-95 disabled:opacity-50"
          style={{ backgroundColor: "var(--color-ink-950)", color: "var(--color-paper)" }}
        >
          {saving ? (
            <>
              <Loader2 className="size-4 animate-spin" />
              <span>Saving...</span>
            </>
          ) : (
            <>
              <Save className="size-4" />
              <span>Save Changes</span>
            </>
          )}
        </button>
      </div>
    </BottomSheet>
  );
}

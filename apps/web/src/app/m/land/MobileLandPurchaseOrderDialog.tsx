"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { Loader2, Trash2, Plus, FolderOpen } from "lucide-react";
import { toast } from "sonner";
import { MobileChequeFields, EMPTY_MOBILE_CHEQUE, type MobileChequeState } from "../sales/MobileChequeFields";
import { MobileDocUploader } from "../MobileDocUploader";
import { formatCurrency } from "@/lib/utils";
import { MobileDialog } from "@/components/mobile/v2/dialog";
import { EnumSelect } from "@/components/mobile/v2/form-primitives";
import { MobileSelectWithCreate } from "@/components/mobile/MobileSelectWithCreate";
import { MobileProjectSelect } from "@/components/mobile/selectors";

const AREA_UNITS = ["SQFT", "SQM", "SQYD", "ACRE", "BIGHA", "KATHA", "HECTARE"] as const;
const PAYMENT_MODES = ["CASH", "BANK_TRANSFER", "CHEQUE", "UPI", "OTHER"] as const;

type SellerOption = { id: string; name: string; phone?: string | null };
type ProjectOption = { id: string; name: string };

/**
 * MobileLandPurchaseOrderDialog — book a land purchase with a token amount.
 *
 * Lifecycle: BOOKED → COMPLETED (when registry document is uploaded).
 * The full cost is recorded as an asset; the token is the first payment.
 * Balance is paid via subsequent payments; completion requires the registry doc.
 */
export function MobileLandPurchaseOrderDialog({
  open,
  onClose,
  projects,
  sellers,
}: {
  open: boolean;
  onClose: () => void;
  projects: ProjectOption[];
  sellers: SellerOption[];
}) {
  const router = useRouter();
  const [saving, setSaving] = useState(false);

  const [sellerId, setSellerId] = useState("");
  const [sellerName, setSellerName] = useState("");
  const [sellerContact, setSellerContact] = useState("");
  const [projectId, setProjectId] = useState("");
  const [purchaseDate, setPurchaseDate] = useState(new Date().toISOString().slice(0, 10));
  const [totalArea, setTotalArea] = useState("");
  const [areaUnit, setAreaUnit] = useState<(typeof AREA_UNITS)[number]>("SQFT");
  const [totalCost, setTotalCost] = useState("");
  const [registryNo, setRegistryNo] = useState("");
  const [location, setLocation] = useState("");

  // Token payment
  const [tokenAmount, setTokenAmount] = useState("");
  const [tokenPaymentMode, setTokenPaymentMode] = useState<(typeof PAYMENT_MODES)[number]>("BANK_TRANSFER");
  const [tokenCheque, setTokenCheque] = useState<MobileChequeState>(EMPTY_MOBILE_CHEQUE);

  // ATS document
  const [atsDocUrl, setAtsDocUrl] = useState("");
  const [atsDocName, setAtsDocName] = useState("");

  // Payment plan (optional at booking)
  const [showPlan, setShowPlan] = useState(false);
  const [planItems, setPlanItems] = useState<{ description: string; percentage: string; dueDate: string }[]>([]);
  // Partial registry allowed
  const [partialRegistry, setPartialRegistry] = useState(false);

  function reset() {
    setSellerId(""); setSellerName(""); setSellerContact(""); setProjectId("");
    setPurchaseDate(new Date().toISOString().slice(0, 10));
    setTotalArea(""); setAreaUnit("SQFT"); setTotalCost(""); setRegistryNo(""); setLocation("");
    setTokenAmount(""); setTokenPaymentMode("BANK_TRANSFER"); setTokenCheque(EMPTY_MOBILE_CHEQUE);
    setAtsDocUrl(""); setAtsDocName("");
    setShowPlan(false); setPlanItems([]);
    setPartialRegistry(false);
  }

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (!sellerName.trim()) { toast.error("Seller name is required"); return; }
    if (!totalArea || Number(totalArea) <= 0) { toast.error("Enter a valid area"); return; }
    if (!totalCost || Number(totalCost) <= 0) { toast.error("Enter a valid total cost"); return; }
    if (!tokenAmount || Number(tokenAmount) <= 0) { toast.error("Token amount is required to book"); return; }
    if (Number(tokenAmount) > Number(totalCost)) { toast.error("Token cannot exceed total cost"); return; }
    if (tokenPaymentMode === "CHEQUE" && !tokenCheque.chequeNo.trim()) { toast.error("Cheque number is required"); return; }

    setSaving(true);
    try {
      const res = await fetch("/api/land-purchases", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          mode: "BOOKED",
          sellerId: sellerId || undefined,
          sellerName: sellerName.trim(),
          sellerContact: sellerContact.trim() || undefined,
          projectId: projectId || undefined,
          purchaseDate,
          totalArea: Number(totalArea),
          areaUnit,
          totalCost: Number(totalCost),
          registryNo: registryNo.trim() || undefined,
          location: location.trim() || undefined,
          tokenAmount: Number(tokenAmount),
          tokenPaymentMode,
          ...(tokenPaymentMode === "CHEQUE" ? {
            tokenChequeNo: tokenCheque.chequeNo.trim() || undefined,
            tokenChequeDate: tokenCheque.chequeDate || undefined,
            tokenChequeBank: tokenCheque.chequeBank.trim() || undefined,
            tokenChequePhotoUrl: tokenCheque.chequePhotoUrl || undefined,
          } : {}),
          atsDocumentUrl: atsDocUrl || undefined,
          atsDocumentName: atsDocName || undefined,
          partialRegistryAllowed: partialRegistry || undefined,
        }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error ?? "Failed to book land purchase");

      // If payment plan items were entered, create the schedule
      if (showPlan && planItems.length > 0) {
        const totalPct = planItems.reduce((s, i) => s + (parseFloat(i.percentage) || 0), 0);
        if (Math.abs(totalPct - 100) > 0.01) {
          toast.warning("Payment plan percentages don't sum to 100% — plan not saved", {
            description: "You can edit the plan later from the land detail page.",
          });
        } else {
          const scheduleRes = await fetch(`/api/land-purchases/${data.id}/payment-schedule`, {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({
              items: planItems.map((it, i) => ({
                installmentNo: i + 1,
                description: it.description || `Installment ${i + 1}`,
                percentage: parseFloat(it.percentage) || 0,
                dueDate: it.dueDate || null,
              })),
            }),
          });
          if (!scheduleRes.ok) {
            toast.warning("Land booked but payment plan failed — you can add it later", {
              description: "Visit the land detail page to create a payment plan.",
            });
          }
        }
      }

      toast.success("Land purchase booked", {
        description: `Token of ${formatCurrency(Number(tokenAmount))} recorded. Complete with registry document later.`,
      });
      reset();
      onClose();
      router.refresh();
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Failed to book land purchase");
    } finally {
      setSaving(false);
    }
  }

  const inputClass = "w-full h-7 px-1 text-m-caption outline-none border-b focus:border-b-2 transition-colors";
  const inputStyle = { borderColor: "var(--color-line)", backgroundColor: "transparent", color: "var(--color-ink-950)" };
  const labelClass = "block text-m-caption font-bold mb-0";
  const labelStyle = { color: "var(--color-ink-700)" };
  const sectionBoxClass = "rounded-[0.625rem] border p-3 flex flex-col gap-3";
  const sectionBoxStyle = { borderColor: "var(--color-line)", backgroundColor: "var(--color-paper)" };
  const sectionHeadingClass = "text-m-section font-extrabold tracking-tight";
  const sectionHeadingStyle = { color: "var(--color-ink-950)" };

  return (
    <MobileDialog open={open} onClose={onClose} title="New Land Purchase Order">
      <form onSubmit={handleSubmit} className="space-y-3">
          {/* Info banner */}
          <p className="text-m-caption rounded-[0.375rem] px-2.5 py-1.5" style={{ backgroundColor: "color-mix(in srgb, var(--color-signal) 8%, var(--color-paper))", color: "var(--color-ink-700)" }}>
            Book land with a token payment. The purchase will be marked <strong>BOOKED</strong> — complete it later by uploading the registry document.
          </p>

          {/* Seller */}
          <div className={sectionBoxClass} style={sectionBoxStyle}>
            <p className={sectionHeadingClass} style={sectionHeadingStyle}>Seller</p>
            <div>
              <label className={labelClass} style={labelStyle}>Seller *</label>
              {sellers.length > 0 ? (
                <MobileSelectWithCreate
                  label="Seller"
                  required
                  value={sellerId}
                  onChange={(v) => {
                    setSellerId(v);
                    const s = sellers.find((s) => s.id === v);
                    if (s) { setSellerName(s.name); setSellerContact(s.phone ?? ""); }
                  }}
                  options={sellers.map((s) => ({ value: s.id, label: s.name }))}
                  placeholder="— Select seller —"
                />
              ) : null}
              <input
                type="text"
                value={sellerName}
                onChange={(e) => { setSellerName(e.target.value); setSellerId(""); }}
                placeholder="Seller name"
                className={`${inputClass} mt-1`}
                style={inputStyle}
                required
              />
            </div>
            <div>
              <label className={labelClass} style={labelStyle}>Seller Contact</label>
              <input
                type="text"
                value={sellerContact}
                onChange={(e) => setSellerContact(e.target.value)}
                placeholder="Phone / address"
                className={inputClass}
                style={inputStyle}
              />
            </div>
            {projects.length > 0 && (
              <div>
                <MobileProjectSelect
                  value={projectId}
                  onChange={setProjectId}
                  options={projects.map((p) => ({ value: p.id, label: p.name }))}
                  placeholder="— None —"
                  icon={FolderOpen}
                />
              </div>
            )}
          </div>

          {/* Purchase Details */}
          <div className={sectionBoxClass} style={sectionBoxStyle}>
            <p className={sectionHeadingClass} style={sectionHeadingStyle}>Purchase Details</p>
            <div>
              <label className={labelClass} style={labelStyle}>Purchase Date *</label>
              <input
                type="date"
                value={purchaseDate}
                onChange={(e) => setPurchaseDate(e.target.value)}
                className={inputClass}
                style={inputStyle}
                required
              />
            </div>
            <div className="grid grid-cols-3 gap-2">
              <div className="col-span-2">
                <label className={labelClass} style={labelStyle}>Total Area *</label>
                <input
                  type="number" inputMode="decimal" step="0.01" min="0"
                  value={totalArea}
                  onChange={(e) => setTotalArea(e.target.value)}
                  placeholder="0"
                  className={inputClass}
                  style={inputStyle}
                  required
                />
              </div>
              <div>
                <EnumSelect
                  label="Unit"
                  value={areaUnit}
                  onChange={(v) => setAreaUnit(v as (typeof AREA_UNITS)[number])}
                  options={AREA_UNITS.map((u) => ({ value: u, label: u }))}
                />
              </div>
            </div>
            <div className="grid grid-cols-2 gap-2 divide-x" style={{ borderColor: "var(--color-line)" }}>
              <div>
                <label className={labelClass} style={labelStyle}>Total Cost (₹) *</label>
                <input
                  type="number" inputMode="decimal" step="0.01" min="0"
                  value={totalCost}
                  onChange={(e) => setTotalCost(e.target.value)}
                  placeholder="0"
                  className={`${inputClass} font-bold tabular-nums`}
                  style={inputStyle}
                  required
                />
              </div>
              <div className="pl-2">
                <label className={labelClass} style={labelStyle}>Registry No.</label>
                <input
                  type="text"
                  value={registryNo}
                  onChange={(e) => setRegistryNo(e.target.value)}
                  placeholder="e.g. SR-1234/2025"
                  className={inputClass}
                  style={inputStyle}
                />
              </div>
            </div>
            <div>
              <label className={labelClass} style={labelStyle}>Location</label>
              <input
                type="text"
                value={location}
                onChange={(e) => setLocation(e.target.value)}
                placeholder="Village, city, district"
                className={inputClass}
                style={inputStyle}
              />
            </div>
          </div>

          {/* Token payment section */}
          <div className={sectionBoxClass} style={sectionBoxStyle}>
            <p className={sectionHeadingClass} style={sectionHeadingStyle}>Token Payment</p>
            <div>
              <label className={labelClass} style={labelStyle}>Token Amount (₹) *</label>
              <input
                type="number" inputMode="decimal" step="0.01" min="0"
                value={tokenAmount}
                onChange={(e) => setTokenAmount(e.target.value)}
                placeholder="0"
                className={`${inputClass} font-bold tabular-nums`}
                style={inputStyle}
                required
              />
              {totalCost && tokenAmount && Number(tokenAmount) > 0 && (
                <p className="text-m-caption mt-0.5" style={{ color: "var(--color-ink-500)" }}>
                  Balance after token: {formatCurrency(Number(totalCost) - Number(tokenAmount))}
                </p>
              )}
            </div>
            <div>
              <EnumSelect
                label="Payment Mode"
                value={tokenPaymentMode}
                onChange={(v) => setTokenPaymentMode(v as (typeof PAYMENT_MODES)[number])}
                options={PAYMENT_MODES.map((m) => ({ value: m, label: m.replace("_", " ") }))}
              />
            </div>
            {tokenPaymentMode === "CHEQUE" && (
              <MobileChequeFields value={tokenCheque} onChange={setTokenCheque} />
            )}
          </div>

          {/* Documents */}
          <div className={sectionBoxClass} style={sectionBoxStyle}>
            <p className={sectionHeadingClass} style={sectionHeadingStyle}>Documents</p>
            <div>
              <label className={labelClass} style={labelStyle}>Agreement to Sell (ATS) — optional</label>
              <MobileDocUploader
                url={atsDocUrl}
                fileName={atsDocName}
                label="Upload ATS"
                onUpload={(url, name) => { setAtsDocUrl(url); setAtsDocName(name); }}
                onRemove={() => { setAtsDocUrl(""); setAtsDocName(""); }}
              />
            </div>
            <label className="flex items-center gap-2" >
              <input
                type="checkbox"
                checked={partialRegistry}
                onChange={(e) => setPartialRegistry(e.target.checked)}
                className="size-3.5"
              />
              <span className="text-m-caption" style={{ color: "var(--color-ink-700)" }}>
                Allow registry before full payment
              </span>
            </label>
          </div>

          {/* Payment Plan (optional) */}
          <div className={sectionBoxClass} style={sectionBoxStyle}>
            <p className={sectionHeadingClass} style={sectionHeadingStyle}>Payment Plan</p>
            <div>
              <button
                type="button"
                onClick={() => setShowPlan(!showPlan)}
                className="w-full flex items-center justify-center gap-1.5 rounded-[0.5rem] border border-dashed py-2 text-m-label font-bold text-m-body press"
                style={{ borderColor: "var(--color-line)", color: "var(--color-ink-600)" }}
              >
                {showPlan ? "Hide Payment Plan" : "Add Payment Plan (optional)"}
              </button>
            </div>
            {showPlan && (
              <div className="space-y-2">
                {totalCost && tokenAmount && Number(totalCost) > Number(tokenAmount) && (
                  <p className="text-m-caption rounded-[0.375rem] px-2.5 py-1.5" style={{ backgroundColor: "var(--color-paper-2)", color: "var(--color-ink-600)" }}>
                    Balance to schedule: <span className="font-bold">{formatCurrency(Number(totalCost) - Number(tokenAmount))}</span>
                  </p>
                )}
                {planItems.map((item, idx) => {
                  const balance = Number(totalCost) - Number(tokenAmount || 0);
                  const amount = (balance * (parseFloat(item.percentage) || 0)) / 100;
                  return (
                    <div key={idx} className="rounded-[0.5rem] border p-2.5" style={{ borderColor: "var(--color-line)" }}>
                      <div className="flex items-center justify-between mb-1.5">
                        <span className="text-m-caption font-bold" style={{ color: "var(--color-steel)" }}>Installment {idx + 1}</span>
                        <button type="button" onClick={() => setPlanItems(planItems.filter((_, i) => i !== idx))} className="text-m-body press">
                          <Trash2 className="size-3" style={{ color: "var(--color-stop)" }} />
                        </button>
                      </div>
                      <input
                        type="text"
                        value={item.description}
                        onChange={(e) => setPlanItems(planItems.map((it, i) => i === idx ? { ...it, description: e.target.value } : it))}
                        placeholder="Description (e.g. On ATS, On Registry)"
                        className={`${inputClass} mb-1.5`}
                        style={inputStyle}
                      />
                      <div className="flex gap-2">
                        <div className="flex-1">
                          <label className={labelClass} style={labelStyle}>% of Balance</label>
                          <input
                            type="number"
                            value={item.percentage}
                            onChange={(e) => setPlanItems(planItems.map((it, i) => i === idx ? { ...it, percentage: e.target.value } : it))}
                            className={`${inputClass} tabular-nums`}
                            style={inputStyle}
                          />
                        </div>
                        <div className="flex-1">
                          <label className={labelClass} style={labelStyle}>Due Date</label>
                          <input
                            type="date"
                            value={item.dueDate}
                            onChange={(e) => setPlanItems(planItems.map((it, i) => i === idx ? { ...it, dueDate: e.target.value } : it))}
                            className={inputClass}
                            style={inputStyle}
                          />
                        </div>
                      </div>
                      <p className="text-m-caption mt-1 tabular-nums" style={{ color: "var(--color-ink-500)" }}>
                        = {formatCurrency(amount)}
                      </p>
                    </div>
                  );
                })}
                <button
                  type="button"
                  onClick={() => setPlanItems([...planItems, { description: "", percentage: "0", dueDate: "" }])}
                  className="w-full rounded-[0.375rem] border border-dashed py-1.5 text-m-caption font-bold text-m-body press"
                  style={{ borderColor: "var(--color-line)", color: "var(--color-ink-600)" }}
                >
                  <Plus className="size-3 inline" /> Add Installment
                </button>
                {planItems.length > 0 && (
                  <p className="text-m-caption text-center" style={{ color: "var(--color-ink-500)" }}>
                    Total: {planItems.reduce((s, i) => s + (parseFloat(i.percentage) || 0), 0).toFixed(0)}%
                    {Math.abs(planItems.reduce((s, i) => s + (parseFloat(i.percentage) || 0), 0) - 100) < 0.01 ? " ✓" : " (must be 100%)"}
                  </p>
                )}
              </div>
            )}
          </div>

          {/* ══════ STICKY BOTTOM ACTION BAR ══════ */}
          <div
            className="sticky bottom-0 left-0 right-0 z-20 border-t -mx-4 -mb-4 px-4 py-2"
            style={{
              backgroundColor: "var(--color-paper)",
              borderColor: "var(--color-line)",
            }}
          >
            <div className="flex flex-col gap-2">
              <button
                type="button"
                onClick={onClose}
                className="flex-1 rounded-[0.5rem] border py-2 text-m-body font-bold text-m-body press"
                style={{ borderColor: "var(--color-line)", backgroundColor: "var(--color-paper)", color: "var(--color-ink-950)" }}
              >
                Cancel
              </button>
              <button
                type="submit"
                disabled={saving}
                className="flex-1 rounded-[0.5rem] py-2 text-m-body font-bold text-m-body press disabled:opacity-50"
                style={{ backgroundColor: "var(--color-signal)", color: "var(--color-paper)" }}
              >
                {saving ? <Loader2 className="size-3.5 animate-spin mx-auto" /> : "Book Land"}
              </button>
            </div>
          </div>
        </form>
    </MobileDialog>
  );
}

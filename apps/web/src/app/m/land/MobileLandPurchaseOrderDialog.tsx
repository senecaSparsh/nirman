"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { X, Loader2, Trash2, Plus, CalendarClock } from "lucide-react";
import { toast } from "sonner";
import { MobileChequeFields, EMPTY_MOBILE_CHEQUE, type MobileChequeState } from "../sales/MobileChequeFields";
import { MobileDocUploader } from "../MobileDocUploader";
import { formatCurrency } from "@/lib/utils";

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

  if (!open) return null;

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

  const inputClass = "w-full rounded-[0.375rem] border px-2.5 py-2 text-[0.75rem] outline-none";
  const inputStyle = { borderColor: "var(--color-line)", backgroundColor: "var(--color-paper)" };
  const labelClass = "text-[0.5rem] font-semibold uppercase tracking-wide block mb-0.5";
  const labelStyle = { color: "var(--color-ink-500)" };

  return (
    <div
      className="fixed inset-0 z-50 flex items-end justify-center"
      style={{ backgroundColor: "color-mix(in srgb, var(--color-ink-950) 50%, transparent)" }}
      onClick={onClose}
    >
      <div
        className="w-full max-w-md rounded-t-[0.75rem] border p-4 pb-6 max-h-[90vh] overflow-y-auto"
        style={{ backgroundColor: "var(--color-paper)", borderColor: "var(--color-line)" }}
        onClick={(e) => e.stopPropagation()}
      >
        <div className="flex items-center justify-between mb-3">
          <p className="text-[0.75rem] font-bold" style={{ color: "var(--color-ink-950)" }}>Book Land Purchase</p>
          <button onClick={onClose} className="press">
            <X className="size-4" style={{ color: "var(--color-ink-500)" }} />
          </button>
        </div>

        <form onSubmit={handleSubmit} className="space-y-3">
          {/* Info banner */}
          <p className="text-[0.5625rem] rounded-[0.375rem] px-2.5 py-1.5" style={{ backgroundColor: "color-mix(in srgb, var(--color-signal) 8%, var(--color-paper))", color: "var(--color-ink-700)" }}>
            Book land with a token payment. The purchase will be marked <strong>BOOKED</strong> — complete it later by uploading the registry document.
          </p>

          {/* Seller */}
          <div>
            <label className={labelClass} style={labelStyle}>Seller *</label>
            {sellers.length > 0 ? (
              <select
                value={sellerId}
                onChange={(e) => {
                  setSellerId(e.target.value);
                  const s = sellers.find((s) => s.id === e.target.value);
                  if (s) { setSellerName(s.name); setSellerContact(s.phone ?? ""); }
                }}
                className={inputClass}
                style={inputStyle}
              >
                <option value="">— Select seller —</option>
                {sellers.map((s) => <option key={s.id} value={s.id}>{s.name}</option>)}
              </select>
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

          {/* Project */}
          {projects.length > 0 && (
            <div>
              <label className={labelClass} style={labelStyle}>Project</label>
              <select
                value={projectId}
                onChange={(e) => setProjectId(e.target.value)}
                className={inputClass}
                style={inputStyle}
              >
                <option value="">— None —</option>
                {projects.map((p) => <option key={p.id} value={p.id}>{p.name}</option>)}
              </select>
            </div>
          )}

          {/* Date */}
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

          {/* Area + Unit */}
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
              <label className={labelClass} style={labelStyle}>Unit</label>
              <select
                value={areaUnit}
                onChange={(e) => setAreaUnit(e.target.value as (typeof AREA_UNITS)[number])}
                className={inputClass}
                style={inputStyle}
              >
                {AREA_UNITS.map((u) => <option key={u} value={u}>{u}</option>)}
              </select>
            </div>
          </div>

          {/* Total cost */}
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

          {/* Location + Registry */}
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
          <div>
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

          {/* Token payment section */}
          <div
            className="rounded-[0.375rem] border p-2.5 space-y-2.5"
            style={{ borderColor: "color-mix(in srgb, var(--color-signal) 30%, var(--color-line))", backgroundColor: "color-mix(in srgb, var(--color-signal) 4%, var(--color-paper))" }}
          >
            <p className="text-[0.5rem] font-bold uppercase tracking-wide" style={{ color: "var(--color-signal)" }}>
              Token Payment
            </p>
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
                <p className="text-[0.4375rem] mt-0.5" style={{ color: "var(--color-ink-500)" }}>
                  Balance after token: {formatCurrency(Number(totalCost) - Number(tokenAmount))}
                </p>
              )}
            </div>
            <div>
              <label className={labelClass} style={labelStyle}>Payment Mode</label>
              <select
                value={tokenPaymentMode}
                onChange={(e) => setTokenPaymentMode(e.target.value as (typeof PAYMENT_MODES)[number])}
                className={inputClass}
                style={inputStyle}
              >
                {PAYMENT_MODES.map((m) => <option key={m} value={m}>{m.replace("_", " ")}</option>)}
              </select>
            </div>
            {tokenPaymentMode === "CHEQUE" && (
              <MobileChequeFields value={tokenCheque} onChange={setTokenCheque} />
            )}
          </div>

          {/* ATS document */}
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

          {/* Partial registry toggle */}
          <label className="flex items-center gap-2 rounded-[0.375rem] border px-2.5 py-2" style={{ borderColor: "var(--color-line)" }}>
            <input
              type="checkbox"
              checked={partialRegistry}
              onChange={(e) => setPartialRegistry(e.target.checked)}
              className="size-3.5"
            />
            <span className="text-[0.5625rem]" style={{ color: "var(--color-ink-700)" }}>
              Allow registry before full payment
            </span>
          </label>

          {/* Payment Plan (optional) */}
          <div>
            <button
              type="button"
              onClick={() => setShowPlan(!showPlan)}
              className="w-full flex items-center justify-center gap-1.5 rounded-[0.5rem] border border-dashed py-2 text-[0.625rem] font-bold press"
              style={{ borderColor: "var(--color-line)", color: "var(--color-ink-600)" }}
            >
              <CalendarClock className="size-3.5" />
              {showPlan ? "Hide Payment Plan" : "Add Payment Plan (optional)"}
            </button>
          </div>
          {showPlan && (
            <div className="space-y-2">
              {totalCost && tokenAmount && Number(totalCost) > Number(tokenAmount) && (
                <p className="text-[0.4375rem] rounded-[0.375rem] px-2.5 py-1.5" style={{ backgroundColor: "var(--color-paper-2)", color: "var(--color-ink-600)" }}>
                  Balance to schedule: <span className="font-bold">{formatCurrency(Number(totalCost) - Number(tokenAmount))}</span>
                </p>
              )}
              {planItems.map((item, idx) => {
                const balance = Number(totalCost) - Number(tokenAmount || 0);
                const amount = (balance * (parseFloat(item.percentage) || 0)) / 100;
                return (
                  <div key={idx} className="rounded-[0.5rem] border p-2.5" style={{ borderColor: "var(--color-line)" }}>
                    <div className="flex items-center justify-between mb-1.5">
                      <span className="text-[0.5rem] font-bold" style={{ color: "var(--color-steel)" }}>Installment {idx + 1}</span>
                      <button type="button" onClick={() => setPlanItems(planItems.filter((_, i) => i !== idx))} className="press">
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
                    <p className="text-[0.5rem] mt-1 tabular-nums" style={{ color: "var(--color-ink-500)" }}>
                      = {formatCurrency(amount)}
                    </p>
                  </div>
                );
              })}
              <button
                type="button"
                onClick={() => setPlanItems([...planItems, { description: "", percentage: "0", dueDate: "" }])}
                className="w-full rounded-[0.375rem] border border-dashed py-1.5 text-[0.5625rem] font-bold press"
                style={{ borderColor: "var(--color-line)", color: "var(--color-ink-600)" }}
              >
                <Plus className="size-3 inline" /> Add Installment
              </button>
              {planItems.length > 0 && (
                <p className="text-[0.5rem] text-center" style={{ color: "var(--color-ink-500)" }}>
                  Total: {planItems.reduce((s, i) => s + (parseFloat(i.percentage) || 0), 0).toFixed(0)}%
                  {Math.abs(planItems.reduce((s, i) => s + (parseFloat(i.percentage) || 0), 0) - 100) < 0.01 ? " ✓" : " (must be 100%)"}
                </p>
              )}
            </div>
          )}

          {/* Actions */}
          <div className="flex gap-2 pt-1">
            <button
              type="button"
              onClick={onClose}
              className="flex-1 rounded-[0.5rem] border py-2 text-[0.6875rem] font-bold press"
              style={{ borderColor: "var(--color-line)", backgroundColor: "var(--color-paper)", color: "var(--color-ink-950)" }}
            >
              Cancel
            </button>
            <button
              type="submit"
              disabled={saving}
              className="flex-1 rounded-[0.5rem] py-2 text-[0.6875rem] font-bold press disabled:opacity-50"
              style={{ backgroundColor: "var(--color-signal)", color: "#fff" }}
            >
              {saving ? <Loader2 className="size-3.5 animate-spin mx-auto" /> : "Book Land"}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}

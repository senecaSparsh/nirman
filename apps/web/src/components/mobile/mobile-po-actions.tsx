"use client";

import { useState, useEffect } from "react";
import { useRouter } from "next/navigation";
import { CheckCircle2, XCircle, Truck, Loader2, Plus, X, IndianRupee, RotateCcw } from "lucide-react";
import { toast } from "sonner";
import { cn, formatCurrencyCompact, formatCurrency } from "@/lib/utils";
import { haptic } from "@/lib/haptic";
import { useOptimisticAction } from "@/lib/use-optimistic-action";
import { ActionBar } from "@/components/mobile/v2/primitives";
import { MobileSelectWithCreate } from "@/components/mobile/MobileSelectWithCreate";
import { MobileNewMaterialDialog } from "@/app/m/materials/MobileNewMaterialDialog";
import { EnumSelect } from "@/components/mobile/v2/form-primitives";

interface PoPayload {
  id: string;
  poNumber: string;
  status: string;
  supplierName: string;
  createdById?: string | null;
}

/**
 * Inline action bar for a purchase order on mobile. Surfaces the actions
 * valid for the PO's current status and the user's permissions:
 *   DRAFT     → approve (if po.approve) / cancel (if procurement.manage)
 *   APPROVED  → order (if procurement.manage)
 *   ORDERED/PARTIAL → (receiving is a separate CTA above)
 *
 * Uses optimistic updates — the status pill changes the instant you tap,
 * before the server round-trip completes. If the server rejects, it
 * reverts and shows the error.
 */
export function MobilePoActions({
  po,
  canApprove,
  canManage,
  canManagePayments,
  supplierId,
  supplierName,
  balanceRemaining,
  currentUserId,
  backHref: _backHref,
}: {
  po: PoPayload;
  canApprove: boolean;
  canManage: boolean;
  canManagePayments?: boolean;
  supplierId?: string;
  supplierName?: string;
  balanceRemaining?: number;
  currentUserId?: string | null;
  backHref: string;
}) {
  const router = useRouter();
  // Track the visible status — updated optimistically, reverted on error.
  const [visibleStatus, setVisibleStatus] = useState(po.status);
  const [showAddLine, setShowAddLine] = useState(false);
  const [showPay, setShowPay] = useState(false);

  const approveAction = useOptimisticAction({
    endpoint: `/api/purchase-orders/${po.id}`,
    method: "PATCH",
    body: { action: "approve" },
    optimisticUpdate: () => setVisibleStatus("APPROVED"),
    revert: () => setVisibleStatus("DRAFT"),
    successMessage: `PO ${po.poNumber} approved`,
    hapticOnSuccess: [10, 30, 10],
  });

  const orderAction = useOptimisticAction({
    endpoint: `/api/purchase-orders/${po.id}`,
    method: "PATCH",
    body: { action: "order" },
    optimisticUpdate: () => setVisibleStatus("ORDERED"),
    revert: () => setVisibleStatus("APPROVED"),
    successMessage: `PO ${po.poNumber} ordered`,
    successDescription: "The supplier has been sent the order.",
    hapticOnSuccess: [10, 30, 10],
  });

  const cancelAction = useOptimisticAction({
    endpoint: `/api/purchase-orders/${po.id}`,
    method: "PATCH",
    body: { action: "cancel" },
    optimisticUpdate: () => setVisibleStatus("CANCELLED"),
    revert: () => setVisibleStatus("DRAFT"),
    successMessage: `PO ${po.poNumber} cancelled`,
    hapticOnSuccess: 30,
  });

  const resubmitAction = useOptimisticAction({
    endpoint: `/api/purchase-orders/${po.id}`,
    method: "PATCH",
    body: { action: "resubmit" },
    optimisticUpdate: () => setVisibleStatus("DRAFT"),
    revert: () => setVisibleStatus("REJECTED"),
    successMessage: `PO ${po.poNumber} resubmitted`,
    successDescription: "It's back in draft — edit if needed, then ask an approver to review.",
    hapticOnSuccess: 10,
  });

  // Use the optimistic status for button visibility so the action bar
  // updates immediately — no flash of the old buttons.
  // Self-approval prevention: the creator cannot approve their own PO.
  // The API enforces this server-side, but hiding the button avoids a
  // frustrating tap-then-error round-trip on mobile.
  const isOwnPo = !!currentUserId && po.createdById === currentUserId;
  const showApprove = visibleStatus === "DRAFT" && canApprove && !isOwnPo;
  const showOrder = visibleStatus === "APPROVED" && canManage;
  const showCancel = (visibleStatus === "DRAFT" || visibleStatus === "APPROVED") && canManage;
  const showResubmit = visibleStatus === "REJECTED" && canManage;
  const canAddLine =
    (visibleStatus === "ORDERED" || visibleStatus === "PARTIAL") && canManage;
  const canRecordPayment =
    !!canManagePayments &&
    !!supplierId &&
    (visibleStatus === "PARTIAL" || visibleStatus === "RECEIVED");

  if (!showApprove && !showOrder && !showCancel && !showResubmit && !canAddLine && !canRecordPayment) return null;

  return (
    <ActionBar>
      <div className="space-y-2">
        {showApprove && showCancel ? (
          <div className="flex gap-2">
            <ActionButton
              onClick={() => approveAction.execute()}
              busy={approveAction.isPending}
              icon={CheckCircle2}
              label="Approve"
              variant="primary"
              className="flex-1"
            />
            <ActionButton
              onClick={() => cancelAction.execute()}
              busy={cancelAction.isPending}
              icon={XCircle}
              label="Cancel PO"
              variant="outline"
              className="flex-1"
            />
          </div>
        ) : (
          <>
            {showApprove && (
              <ActionButton
                onClick={() => approveAction.execute()}
                busy={approveAction.isPending}
                icon={CheckCircle2}
                label="Approve"
                variant="primary"
              />
            )}
            {showOrder && (
              <ActionButton
                onClick={() => orderAction.execute()}
                busy={orderAction.isPending}
                icon={Truck}
                label="Mark as ordered"
                variant="primary"
              />
            )}
            {showCancel && (
              <ActionButton
                onClick={() => cancelAction.execute()}
                busy={cancelAction.isPending}
                icon={XCircle}
                label="Cancel PO"
                variant="outline"
              />
            )}
            {showResubmit && (
              <ActionButton
                onClick={() => resubmitAction.execute()}
                busy={resubmitAction.isPending}
                icon={RotateCcw}
                label="Resubmit"
                variant="primary"
              />
            )}
            {canAddLine && (
              <ActionButton
                onClick={() => {
                  haptic(10);
                  setShowAddLine(true);
                }}
                busy={false}
                icon={Plus}
                label="Add Line"
                variant="outline"
              />
            )}
            {canRecordPayment && (
              <ActionButton
                onClick={() => {
                  haptic(10);
                  setShowPay(true);
                }}
                busy={false}
                icon={IndianRupee}
                label="Record Payment"
                variant="primary"
              />
            )}
          </>
        )}
      </div>
      {showAddLine && (
        <MobileAddLineDialog
          poId={po.id}
          poNumber={po.poNumber}
          onClose={() => setShowAddLine(false)}
          onAdded={() => {
            setShowAddLine(false);
            router.refresh();
          }}
        />
      )}
      {showPay && supplierId && (
        <MobilePayDialog
          poId={po.id}
          poNumber={po.poNumber}
          supplierId={supplierId}
          supplierName={supplierName ?? ""}
          defaultAmount={balanceRemaining}
          onClose={() => setShowPay(false)}
          onPaid={() => {
            setShowPay(false);
            router.refresh();
          }}
        />
      )}
    </ActionBar>
  );
}

/* ═══════════════════════════════════════════════════════════
 * Mobile Record Payment dialog — bottom-sheet style
 * ═══════════════════════════════════════════════════════════ */
function MobilePayDialog({
  poId,
  poNumber,
  supplierId,
  supplierName,
  defaultAmount,
  onClose,
  onPaid,
}: {
  poId: string;
  poNumber: string;
  supplierId: string;
  supplierName: string;
  defaultAmount?: number;
  onClose: () => void;
  onPaid: () => void;
}) {
  const [amount, setAmount] = useState(defaultAmount ? String(defaultAmount) : "");
  const [tdsAmount, setTdsAmount] = useState("");
  const [tdsSection, setTdsSection] = useState("");
  const [paymentDate, setPaymentDate] = useState(new Date().toISOString().slice(0, 10));
  const [paymentMode, setPaymentMode] = useState("BANK");
  const [referenceNo, setReferenceNo] = useState("");
  const [notes, _setNotes] = useState("");
  const [submitting, setSubmitting] = useState(false);

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (Number(amount) <= 0) {
      toast.error("Enter a valid payment amount");
      return;
    }
    setSubmitting(true);
    try {
      const parsedTds = Number(tdsAmount) || 0;
      const res = await fetch("/api/supplier-payments", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          supplierId,
          purchaseOrderId: poId,
          amount: Number(amount),
          tdsAmount: parsedTds > 0 ? parsedTds : undefined,
          tdsSection: tdsSection || undefined,
          paymentDate,
          paymentMode,
          referenceNo: referenceNo || undefined,
          notes: notes || undefined,
        }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error ?? "Failed to record payment");
      toast.success(`Payment ${data.paymentNumber} recorded`);
      onPaid();
    } catch (err: unknown) {
      toast.error(err instanceof Error ? err.message : "Failed to record payment");
    } finally {
      setSubmitting(false);
    }
  }

  const inputClass =
    "w-full h-7 px-1 text-m-caption outline-none border-b focus:border-b-2 transition-colors";
  const inputStyle = {
    backgroundColor: "transparent",
  };
  const parsedAmount = Number(amount) || 0;
  const parsedTds = Number(tdsAmount) || 0;
  const netPaid = parsedAmount - parsedTds;

  return (
    <>
      <div className="fixed inset-0 z-50" style={{ backgroundColor: "color-mix(in srgb, var(--color-ink-950) 40%, transparent)" }} onClick={onClose} />
      <div
        className="fixed left-0 right-0 bottom-0 z-50 max-h-[90vh] overflow-y-auto rounded-t-[1rem] border-t"
        style={{
          backgroundColor: "var(--color-paper)",
          borderColor: "var(--color-line)",
          paddingBottom: "max(env(safe-area-inset-bottom), 1rem)",
        }}
      >
        <div className="flex justify-center pt-2 pb-1">
          <div className="w-10 h-1 rounded-full" style={{ backgroundColor: "var(--color-line)" }} />
        </div>

        <div
          className="flex items-center justify-between px-4 pb-2 border-b"
          style={{ borderColor: "var(--color-line)" }}
        >
          <div>
            <p className="text-m-section font-bold" style={{ color: "var(--color-ink-950)" }}>
              Record Payment
            </p>
            <p className="text-m-caption font-mono" style={{ color: "var(--color-ink-500)" }}>
              {poNumber} · {supplierName}
            </p>
          </div>
          <button
            onClick={onClose}
            aria-label="Close payment dialog"
            className="touch grid place-items-center rounded-[0.5rem] text-m-body press"
            style={{ color: "var(--color-ink-500)" }}
          >
            <X className="size-4" />
          </button>
        </div>

        <form onSubmit={handleSubmit} className="px-4 py-3 flex flex-col gap-3">
          {/* Payment Details */}
          <div className="rounded-[0.625rem] border p-3 flex flex-col gap-3" style={{ borderColor: "var(--color-line)", backgroundColor: "var(--color-paper)" }}>
            <p className="text-m-section font-extrabold tracking-tight" style={{ color: "var(--color-ink-950)" }}>
              Payment Details
            </p>
          <div>
            <label className="text-m-caption font-semibold block mb-1" style={{ color: "var(--color-ink-500)" }}>
              Amount (₹) *
            </label>
            <input
              type="number"
              step="0.01"
              min="0"
              value={amount}
              onChange={(e) => setAmount(e.target.value)}
              placeholder="0.00"
              className={inputClass}
              style={inputStyle}
              required
            />
            {defaultAmount && defaultAmount > 0 && (
              <button
                type="button"
                onClick={() => setAmount(String(defaultAmount))}
                className="mt-1 text-m-caption text-primary hover:underline"
              >
                Pay full balance: {formatCurrency(defaultAmount)}
              </button>
            )}
          </div>

          <div className="grid grid-cols-2 gap-2 divide-x" style={{ borderColor: "var(--color-line)" }}>
            <div>
              <label className="text-m-caption font-semibold block mb-1" style={{ color: "var(--color-ink-500)" }}>
                Payment Date *
              </label>
              <input
                type="date"
                value={paymentDate}
                onChange={(e) => setPaymentDate(e.target.value)}
                className={inputClass}
                style={inputStyle}
                required
              />
            </div>
            <div className="pl-2">
              <EnumSelect
                label="Mode"
                required
                value={paymentMode}
                onChange={(v) => setPaymentMode(v)}
                options={[
                  { value: "BANK", label: "Bank" },
                  { value: "NEFT", label: "NEFT" },
                  { value: "RTGS", label: "RTGS" },
                  { value: "UPI", label: "UPI" },
                  { value: "CHEQUE", label: "Cheque" },
                  { value: "CASH", label: "Cash" },
                ]}
              />
            </div>
          </div>

          <div>
            <label className="text-m-caption font-semibold block mb-1" style={{ color: "var(--color-ink-500)" }}>
              Reference No.
            </label>
            <input
              type="text"
              value={referenceNo}
              onChange={(e) => setReferenceNo(e.target.value)}
              placeholder="UTR / Cheque no"
              className={inputClass}
              style={inputStyle}
            />
          </div>
          </div>

          {/* TDS Deduction */}
          <div
            className="rounded-[0.625rem] border p-3 flex flex-col gap-3"
            style={{ borderColor: "var(--color-line)", backgroundColor: "var(--color-paper)" }}
          >
            <p className="text-m-section font-extrabold tracking-tight" style={{ color: "var(--color-ink-950)" }}>
              TDS Deduction (optional)
            </p>
            <div className="grid grid-cols-2 gap-2 divide-x" style={{ borderColor: "var(--color-line)" }}>
              <input
                type="number"
                step="0.01"
                min="0"
                value={tdsAmount}
                onChange={(e) => setTdsAmount(e.target.value)}
                placeholder="TDS amount"
                className={inputClass}
                style={inputStyle}
              />
              <EnumSelect
                label=""
                value={tdsSection}
                onChange={(v) => setTdsSection(v)}
                placeholder="Section…"
                options={[
                  { value: "194C", label: "194C — Contract" },
                  { value: "194I", label: "194I — Rent" },
                  { value: "194J", label: "194J — Professional" },
                  { value: "194Q", label: "194Q — Purchase" },
                  { value: "194H", label: "194H — Commission" },
                ]}
              />
            </div>
          </div>

          {parsedTds > 0 && (
            <div
              className="flex items-center justify-between rounded-[0.5rem] border px-3 py-2"
              style={{ borderColor: "var(--color-line)", backgroundColor: "var(--color-paper-2)" }}
            >
              <span className="text-m-caption" style={{ color: "var(--color-ink-500)" }}>
                Net paid
              </span>
              <span className="text-m-body font-bold tabular-nums" style={{ color: "var(--color-ink-950)" }}>
                {formatCurrencyCompact(netPaid)}
              </span>
            </div>
          )}

          <button
            type="submit"
            disabled={submitting}
            className="flex w-full items-center justify-center gap-1.5 rounded-[0.5rem] py-3 text-m-section font-bold text-m-body press disabled:opacity-50"
            style={{ backgroundColor: "var(--color-ink-950)", color: "var(--color-paper)" }}
          >
            {submitting ? <Loader2 className="size-4 animate-spin" /> : <IndianRupee className="size-3.5" />}
            {submitting ? "Recording…" : "Record Payment"}
          </button>
        </form>
      </div>
    </>
  );
}

/* ═══════════════════════════════════════════════════════════
 * Mobile Add Line dialog — bottom-sheet style
 * ═══════════════════════════════════════════════════════════ */
function MobileAddLineDialog({
  poId,
  poNumber,
  onClose,
  onAdded,
}: {
  poId: string;
  poNumber: string;
  onClose: () => void;
  onAdded: () => void;
}) {
  const [materials, setMaterials] = useState<{ id: string; name: string; code: string; unit: string }[]>([]);
  const [categories, setCategories] = useState<{ id: string; name: string; unit: string; hsnCode?: string | null; gstRate?: number | string | null }[]>([]);
  const [materialId, setMaterialId] = useState("");
  const [qty, setQty] = useState("");
  const [unitCost, setUnitCost] = useState("");
  const [submitting, setSubmitting] = useState(false);

  useEffect(() => {
    let cancelled = false;
    async function load() {
      try {
        const [matRes, catRes] = await Promise.all([
          fetch("/api/materials"),
          fetch("/api/material-categories"),
        ]);
        if (!cancelled && matRes.ok) {
          const data = await matRes.json();
          const rows = data?.rows ?? [];
          setMaterials(rows);
          if (rows.length > 0) setMaterialId(rows[0].id);
        }
        if (!cancelled && catRes.ok) {
          const cats = await catRes.json();
          setCategories(Array.isArray(cats) ? cats : []);
        }
      } catch {
        /* ignore */
      }
    }
    load();
    return () => { cancelled = true; };
  }, []);

  const lineTotal = (Number(qty) || 0) * (Number(unitCost) || 0);

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (!materialId || Number(qty) <= 0 || Number(unitCost) < 0) {
      toast.error("Select a material, enter quantity and unit cost");
      return;
    }
    setSubmitting(true);
    try {
      const res = await fetch(`/api/purchase-orders/${poId}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          action: "addLine",
          materialId,
          qtyOrdered: Number(qty),
          unitCost: Number(unitCost),
        }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error ?? "Failed to add line");
      toast.success("Line added to PO");
      onAdded();
    } catch (err: unknown) {
      toast.error(err instanceof Error ? err.message : "Unknown error");
    } finally {
      setSubmitting(false);
    }
  }

  const inputClass =
    "w-full h-7 px-1 text-m-caption outline-none border-b focus:border-b-2 transition-colors";
  const inputStyle = {
    backgroundColor: "transparent",
  };

  return (
    <>
      {/* Backdrop */}
      <div className="fixed inset-0 z-50" style={{ backgroundColor: "color-mix(in srgb, var(--color-ink-950) 40%, transparent)" }} onClick={onClose} />
      {/* Bottom sheet */}
      <div
        className="fixed left-0 right-0 bottom-0 z-50 max-h-[90vh] overflow-y-auto rounded-t-[1rem] border-t"
        style={{
          backgroundColor: "var(--color-paper)",
          borderColor: "var(--color-line)",
          paddingBottom: "max(env(safe-area-inset-bottom), 1rem)",
        }}
      >
        {/* Drag handle */}
        <div className="flex justify-center pt-2 pb-1">
          <div
            className="w-10 h-1 rounded-full"
            style={{ backgroundColor: "var(--color-line)" }}
          />
        </div>

        {/* Header */}
        <div
          className="flex items-center justify-between px-4 pb-2 border-b"
          style={{ borderColor: "var(--color-line)" }}
        >
          <div>
            <p
              className="text-m-section font-bold"
              style={{ color: "var(--color-ink-950)" }}
            >
              Add Line to PO
            </p>
            <p
              className="text-m-caption font-mono"
              style={{ color: "var(--color-ink-500)" }}
            >
              {poNumber}
            </p>
          </div>
          <button
            onClick={onClose}
            aria-label="Close add line dialog"
            className="touch grid place-items-center rounded-[0.5rem] text-m-body press"
            style={{ color: "var(--color-ink-500)" }}
          >
            <X className="size-4" />
          </button>
        </div>

        <form onSubmit={handleSubmit} className="px-4 py-3 flex flex-col gap-3">
          {/* Line Details */}
          <div className="rounded-[0.625rem] border p-3 flex flex-col gap-3" style={{ borderColor: "var(--color-line)", backgroundColor: "var(--color-paper)" }}>
            <p className="text-m-section font-extrabold tracking-tight" style={{ color: "var(--color-ink-950)" }}>
              Line Details
            </p>
          {/* Material */}
          <div>
            <MobileSelectWithCreate
              label="Material"
              required
              value={materialId}
              onChange={setMaterialId}
              options={materials.map((m) => ({ value: m.id, label: m.name, sub: m.code }))}
              placeholder={materials.length === 0 ? "Loading materials…" : "Select material…"}
              disabled={materials.length === 0}
              createLabel="material"
              renderDialog={({ open, onClose, onCreated }) => (
                <MobileNewMaterialDialog
                  open={open}
                  onClose={onClose}
                  onCreated={(m) => {
                    setMaterials((prev) => prev.find((x) => x.id === m.id) ? prev : [...prev, { id: m.id, name: m.name, code: m.code, unit: m.unit }]);
                    onCreated(m.id, m.name);
                  }}
                  categories={categories}
                  nested
                />
              )}
            />
          </div>

          {/* Quantity + Unit cost */}
          <div className="grid grid-cols-2 gap-2 divide-x" style={{ borderColor: "var(--color-line)" }}>
            <div>
              <label
                className="text-m-caption font-semibold block mb-1"
                style={{ color: "var(--color-ink-500)" }}
              >
                Quantity *
              </label>
              <input
                type="number"
                step="0.001"
                min="0"
                value={qty}
                onChange={(e) => setQty(e.target.value)}
                placeholder="0"
                className={inputClass}
                style={inputStyle}
                required
              />
            </div>
            <div className="pl-2">
              <label
                className="text-m-caption font-semibold block mb-1"
                style={{ color: "var(--color-ink-500)" }}
              >
                Unit cost (₹) *
              </label>
              <input
                type="number"
                step="0.01"
                min="0"
                value={unitCost}
                onChange={(e) => setUnitCost(e.target.value)}
                placeholder="0"
                className={inputClass}
                style={inputStyle}
                required
              />
            </div>
          </div>
          </div>

          {/* Line total */}
          {lineTotal > 0 && (
            <div
              className="flex items-center justify-between rounded-[0.5rem] border px-3 py-2"
              style={{ borderColor: "var(--color-line)", backgroundColor: "var(--color-paper-2)" }}
            >
              <span className="text-m-caption" style={{ color: "var(--color-ink-500)" }}>
                Line total
              </span>
              <span className="text-m-body font-bold tabular-nums" style={{ color: "var(--color-ink-950)" }}>
                {formatCurrencyCompact(lineTotal)}
              </span>
            </div>
          )}

          {/* Submit */}
          <button
            type="submit"
            disabled={submitting}
            className="flex w-full items-center justify-center gap-1.5 rounded-[0.5rem] py-3 text-m-section font-bold text-m-body press disabled:opacity-50"
            style={{
              backgroundColor: "var(--color-ink-950)",
              color: "var(--color-paper)",
            }}
          >
            {submitting ? (
              <Loader2 className="size-4 animate-spin" />
            ) : (
              <Plus className="size-3.5" />
            )}
            {submitting ? "Adding…" : "Add Line"}
          </button>
        </form>
      </div>
    </>
  );
}

function ActionButton({
  onClick,
  busy,
  icon: Icon,
  label,
  variant,
  className,
}: {
  onClick: () => void;
  busy: boolean;
  icon: typeof CheckCircle2;
  label: string;
  variant: "primary" | "outline";
  className?: string;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      disabled={busy}
      className={cn(
        "flex min-h-11 w-full items-center justify-center gap-2 rounded-[0.625rem] px-4 py-2.5 text-m-section font-semibold transition-colors active:scale-[0.99] disabled:opacity-60",
        variant === "primary"
          ? "bg-primary text-primary-foreground shadow-raised"
          : "border text-m-body",
        className,
      )}
      style={variant === "primary" ? undefined : { borderColor: "var(--color-line)", backgroundColor: "var(--color-paper)", color: "var(--color-ink-950)" }}
    >
      {busy ? <Loader2 className="size-4 animate-spin" /> : <Icon className="size-4" />}
      {label}
    </button>
  );
}

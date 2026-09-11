"use client";

import { useState, useMemo, useRef } from "react";
import { useRouter } from "next/navigation";
import Image from "next/image";
import { toast } from "sonner";
import { Loader2, Camera, X, Send, CheckCircle2, Eye, Plus } from "lucide-react";
import { formatCurrency } from "@/lib/utils";
import { useTodayDateState } from "@/lib/use-today-date";
import { useLongPressNav } from "@/lib/use-long-press-nav";
import { MobileNewSupplierForm } from "@/app/m/suppliers/MobileNewSupplierDialog";
import { SelectorModal, EnumSelect, UnderlineInput } from "@/components/mobile/v2/form-primitives";
import { MobileFabModal } from "@/components/mobile/v2/fab-modal";

type Supplier = { id: string; name: string; balanceOwed: string };
type PO = { id: string; poNumber: string; supplierId: string; total: string; status: string };
type Invoice = { id: string; invoiceNumber: string; supplierId: string; totalAmount: string; status: string };

const PAYMENT_MODES = [
  { value: "BANK_TRANSFER", label: "Bank Transfer" },
  { value: "CASH", label: "Cash" },
  { value: "CHEQUE", label: "Cheque" },
  { value: "UPI", label: "UPI" },
  { value: "NEFT", label: "NEFT" },
  { value: "RTGS", label: "RTGS" },
  { value: "OTHER", label: "Other" },
];

export function MobileNewSupplierPaymentClient({
  suppliers: initialSuppliers,
  purchaseOrders,
  invoices,
  onCreated,
}: {
  suppliers: Supplier[];
  purchaseOrders: PO[];
  invoices: Invoice[];
  onClose?: () => void;
  onCreated?: () => void;
}) {
  const router = useRouter();
  const [saving, setSaving] = useState(false);
  const [success, setSuccess] = useState<{ id: string; amount: number; supplierName: string } | null>(null);
  const [suppliers, setSuppliers] = useState<Supplier[]>(initialSuppliers);
  const [supplierId, setSupplierId] = useState("");
  const [purchaseOrderId, setPurchaseOrderId] = useState("");
  const [invoiceId, setInvoiceId] = useState("");
  const [amount, setAmount] = useState("");
  const [tdsAmount, setTdsAmount] = useState("");
  const [tdsSection, setTdsSection] = useState("");
  const [paymentDate, setPaymentDate] = useTodayDateState();
  const [paymentMode, setPaymentMode] = useState("BANK_TRANSFER");
  const [referenceNo, setReferenceNo] = useState("");
  const [notes, setNotes] = useState("");
  const [chequePhotoUrl, setChequePhotoUrl] = useState("");
  const [uploading, setUploading] = useState(false);
  const fileRef = useRef<HTMLInputElement>(null);
  const [modal, setModal] = useState<"supplier" | "po" | "invoice" | null>(null);
  const [showCreateSupplier, setShowCreateSupplier] = useState(false);
  const submitLongPress = useLongPressNav("/m/accounts?tab=payments", "Payments list");

  const selectedSupplier = suppliers.find((s) => s.id === supplierId);

  const supplierPos = useMemo(
    () => (supplierId ? purchaseOrders.filter((p) => p.supplierId === supplierId) : []),
    [supplierId, purchaseOrders],
  );
  const supplierInvoices = useMemo(
    () => (supplierId ? invoices.filter((i) => i.supplierId === supplierId) : []),
    [supplierId, invoices],
  );

  async function handleChequePhoto(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    if (!file) return;
    setUploading(true);
    try {
      const fd = new FormData();
      fd.append("file", file);
      const res = await fetch("/api/uploads", { method: "POST", body: fd });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error ?? "Upload failed");
      setChequePhotoUrl(data.url);
      toast.success("Cheque photo uploaded");
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Failed to upload cheque photo");
    } finally {
      setUploading(false);
      if (fileRef.current) fileRef.current.value = "";
    }
  }

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (!supplierId) {
      toast.error("Supplier is required");
      return;
    }
    if (!amount || Number(amount) <= 0) {
      toast.error("Amount must be greater than 0");
      return;
    }
    setSaving(true);
    try {
      const res = await fetch("/api/supplier-payments", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          supplierId,
          purchaseOrderId: purchaseOrderId || undefined,
          invoiceId: invoiceId || undefined,
          amount: Number(amount),
          tdsAmount: tdsAmount ? Number(tdsAmount) : undefined,
          tdsSection: tdsSection.trim() || undefined,
          paymentDate: paymentDate ? new Date(paymentDate).toISOString() : undefined,
          paymentMode,
          referenceNo: referenceNo.trim() || undefined,
          chequePhotoUrl: chequePhotoUrl || undefined,
          notes: notes.trim() || undefined,
        }),
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(data.error ?? "Failed to record payment");
      setSuccess({ id: data.id, amount: Number(amount), supplierName: selectedSupplier?.name ?? "Supplier" });
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Something went wrong");
    } finally {
      setSaving(false);
    }
  }

  const handleSelect = (id: string) => {
    if (modal === "supplier") {
      setSupplierId(id);
      setPurchaseOrderId("");
      setInvoiceId("");
    } else if (modal === "po") {
      setPurchaseOrderId(id);
    } else if (modal === "invoice") {
      setInvoiceId(id);
    }
    setModal(null);
  };

  const handleSupplierCreated = (s: { id: string; name: string }) => {
    setSuppliers((prev) => [...prev, { id: s.id, name: s.name, balanceOwed: "0" }]);
    setSupplierId(s.id);
    setShowCreateSupplier(false);
    setModal(null);
  };

  const netAmount = (Number(amount) || 0) - (Number(tdsAmount) || 0);

  if (success) {
    return (
      <div className="flex flex-col items-center justify-center py-12 px-4 text-center">
        <div className="grid place-items-center size-14 rounded-full mb-3" style={{ backgroundColor: "color-mix(in srgb, var(--color-go) 12%, transparent)" }}>
          <CheckCircle2 className="size-7" style={{ color: "var(--color-go)" }} />
        </div>
        <p className="text-m-section font-extrabold tracking-tight mb-1" style={{ color: "var(--color-ink-950)" }}>Payment Recorded</p>
        <p className="text-m-caption font-mono mb-1" style={{ color: "var(--color-ink-700)" }}>{formatCurrency(success.amount)}</p>
        <p className="text-m-caption mb-4" style={{ color: "var(--color-ink-500)" }}>{success.supplierName}</p>
        <div className="flex flex-col gap-3 w-full max-w-xs">
          <button onClick={() => { if (onCreated) onCreated(); else { router.push("/m/accounts?tab=payments"); router.refresh(); } }} className="rounded-[0.5rem] px-4 py-2.5 text-m-body font-bold press active:scale-95" style={{ backgroundColor: "var(--color-ink-950)", color: "var(--color-paper)" }}>
            <Eye className="size-4 inline mr-1" /> View Payments
          </button>
          <button onClick={() => { setSuccess(null); setSupplierId(""); setPurchaseOrderId(""); setInvoiceId(""); setAmount(""); setTdsAmount(""); setTdsSection(""); setReferenceNo(""); setNotes(""); setChequePhotoUrl(""); router.refresh(); }} className="rounded-[0.5rem] px-4 py-2.5 text-m-body font-bold border-2 press active:scale-95" style={{ borderColor: "var(--color-line)", color: "var(--color-ink-700)", backgroundColor: "var(--color-paper)" }}>
            <Plus className="size-4 inline mr-1" /> Record Another
          </button>
        </div>
      </div>
    );
  }

  return (
    <div className="pb-32">
      <form onSubmit={handleSubmit} className="flex flex-col gap-3">
        {/* ══════ SECTION: SUPPLIER ══════ */}
        <div
          className="rounded-[0.625rem] border p-3 flex flex-col gap-3"
          style={{ borderColor: "var(--color-line)", backgroundColor: "var(--color-paper)" }}
        >
          <p className="text-m-section font-extrabold tracking-tight" style={{ color: "var(--color-ink-950)" }}>
            Supplier
          </p>

          <SelectorCardInline
            label="Supplier"
            value={selectedSupplier?.name}
            required
            onClick={() => setModal("supplier")}
          />

          {/* Outstanding balance hint */}
          {selectedSupplier && Number(selectedSupplier.balanceOwed) > 0 && (
            <div
              className="rounded-[0.375rem] px-2.5 py-1.5 text-m-caption font-semibold"
              style={{ backgroundColor: "var(--color-concrete)", color: "var(--color-ink-700)" }}
            >
              Outstanding: {formatCurrency(Number(selectedSupplier.balanceOwed))}
            </div>
          )}
        </div>

        {/* ══════ SECTION: LINK TO (optional) ══════ */}
        {supplierId && (supplierPos.length > 0 || supplierInvoices.length > 0) && (
          <div
            className="rounded-[0.625rem] border p-3 flex flex-col gap-3"
            style={{ borderColor: "var(--color-line)", backgroundColor: "var(--color-paper)" }}
          >
            <p className="text-m-section font-extrabold tracking-tight" style={{ color: "var(--color-ink-950)" }}>
              Link to (optional)
            </p>

            {supplierPos.length > 0 && (
              <SelectorCardInline
                label="Purchase Order"
                value={purchaseOrderId ? supplierPos.find((p) => p.id === purchaseOrderId)?.poNumber : undefined}
                subvalue={purchaseOrderId ? `${formatCurrency(Number(supplierPos.find((p) => p.id === purchaseOrderId)?.total ?? 0))}` : undefined}
                onClick={() => setModal("po")}
              />
            )}

            {supplierInvoices.length > 0 && (
              <SelectorCardInline
                label="Invoice"
                value={invoiceId ? supplierInvoices.find((i) => i.id === invoiceId)?.invoiceNumber : undefined}
                subvalue={invoiceId ? `${formatCurrency(Number(supplierInvoices.find((i) => i.id === invoiceId)?.totalAmount ?? 0))}` : undefined}
                onClick={() => setModal("invoice")}
              />
            )}
          </div>
        )}

        {/* ══════ SECTION: PAYMENT DETAILS ══════ */}
        <div
          className="rounded-[0.625rem] border p-3 flex flex-col gap-3"
          style={{ borderColor: "var(--color-line)", backgroundColor: "var(--color-paper)" }}
        >
          <p className="text-m-section font-extrabold tracking-tight" style={{ color: "var(--color-ink-950)" }}>
            Payment Details
          </p>

          {/* Amount + Date (side by side) */}
          <div className="grid grid-cols-2 gap-2 divide-x" style={{ borderColor: "var(--color-line)" }}>
            <UnderlineInput
              label="Amount (₹)"
              required
              type="number"
              inputMode="decimal"
              value={amount}
              onChange={setAmount}
              placeholder="0"
              autoFocus
              mono
            />
            <div className="pl-2">
              <label className="block text-m-caption font-bold mb-0" style={{ color: "var(--color-ink-700)" }}>
                Date
              </label>
              <input
                type="date"
                value={paymentDate}
                onChange={(e) => setPaymentDate(e.target.value)}
                className="w-full h-7 px-1 text-m-caption outline-none border-b focus:border-b-2 transition-colors"
                style={{ borderColor: "var(--color-line)", backgroundColor: "transparent", color: "var(--color-ink-950)" }}
              />
            </div>
          </div>

          {/* Payment Mode */}
          <EnumSelect
            label="Payment Mode"
            value={paymentMode}
            onChange={setPaymentMode}
            options={PAYMENT_MODES}
          />

          {/* Reference No. */}
          <UnderlineInput
            label="Reference No."
            value={referenceNo}
            onChange={setReferenceNo}
            placeholder="UTR / cheque no."
            mono
          />

          {/* Cheque photo (only for CHEQUE mode) */}
          {paymentMode === "CHEQUE" && (
            <div>
              <label className="block text-m-caption font-bold mb-0" style={{ color: "var(--color-ink-700)" }}>
                Cheque Photo (front)
              </label>
              {chequePhotoUrl ? (
                <div className="relative h-28 rounded-[0.375rem] border overflow-hidden mt-1" style={{ borderColor: "var(--color-line)" }}>
                  <Image src={chequePhotoUrl} alt="Cheque" fill className="object-cover" sizes="(max-width: 768px) 100vw, 400px" />
                  <button
                    type="button"
                    onClick={() => setChequePhotoUrl("")}
                    aria-label="Close image preview"
                    className="absolute top-1 right-1 rounded-full p-1 text-m-body press"
                    style={{ backgroundColor: "color-mix(in srgb, var(--color-ink-950) 70%, transparent)" }}
                  >
                    <X className="size-3.5" style={{ color: "var(--color-paper)" }} />
                  </button>
                </div>
              ) : (
                <button
                  type="button"
                  onClick={() => fileRef.current?.click()}
                  disabled={uploading}
                  className="flex items-center justify-center gap-1.5 w-full rounded-[0.375rem] border border-dashed py-3 text-m-body press disabled:opacity-50 mt-1"
                  style={{ borderColor: "var(--color-line)", backgroundColor: "var(--color-paper-2)" }}
                >
                  {uploading ? (
                    <Loader2 className="size-4 animate-spin" style={{ color: "var(--color-ink-500)" }} />
                  ) : (
                    <Camera className="size-4" style={{ color: "var(--color-ink-500)" }} />
                  )}
                  <span className="text-m-caption font-bold" style={{ color: "var(--color-ink-500)" }}>
                    {uploading ? "Uploading…" : "Upload Cheque Photo"}
                  </span>
                </button>
              )}
              <input
                ref={fileRef}
                type="file"
                accept="image/*,application/pdf"
                capture="environment"
                onChange={handleChequePhoto}
                className="hidden"
              />
            </div>
          )}

          {/* TDS Amount + Section (side by side) */}
          <div className="grid grid-cols-2 gap-2 divide-x" style={{ borderColor: "var(--color-line)" }}>
            <UnderlineInput
              label="TDS Amount"
              type="number"
              inputMode="decimal"
              value={tdsAmount}
              onChange={setTdsAmount}
              placeholder="0"
              mono
            />
            <UnderlineInput
              label="TDS Section"
              value={tdsSection}
              onChange={setTdsSection}
              placeholder="e.g. 194C"
              mono
            />
          </div>

          {/* Notes */}
          <div>
            <label className="block text-m-caption font-bold mb-0" style={{ color: "var(--color-ink-700)" }}>
              Notes
            </label>
            <textarea
              value={notes}
              onChange={(e) => setNotes(e.target.value)}
              rows={2}
              placeholder="Additional context…"
              className="w-full h-7 px-1 text-m-caption outline-none border-b focus:border-b-2 transition-colors resize-none"
              style={{ borderColor: "var(--color-line)", backgroundColor: "transparent", color: "var(--color-ink-950)" }}
            />
          </div>
        </div>
      </form>

      {/* ══════ STICKY BOTTOM BAR ══════ */}
      <div
        className="sticky bottom-0 left-0 right-0 z-30 border-t"
        style={{
          backgroundColor: "var(--color-paper)",
          borderColor: "var(--color-line)",
        }}
      >
        <div className="px-3 py-2 flex items-center justify-between gap-2">
          <div className="shrink-0 flex flex-col gap-0.5">
            {netAmount > 0 ? (
              <>
                <span className="text-m-body font-bold tabular-nums" style={{ color: "var(--color-ink-950)" }}>
                  {formatCurrency(netAmount)}
                </span>
                <span className="text-m-caption" style={{ color: "var(--color-ink-500)" }}>
                  Net payment
                </span>
              </>
            ) : (
              <span className="text-m-caption" style={{ color: "var(--color-ink-300)" }}>
                Enter amount
              </span>
            )}
          </div>

          <button
            type="button"
            onClick={(e) => { if (submitLongPress.wasLongPress()) return; handleSubmit(e as unknown as React.FormEvent); }}
            disabled={saving}
            {...submitLongPress.longPressProps}
            className="flex-1 flex items-center justify-center gap-1.5 rounded-[0.5rem] py-2.5 text-m-body font-bold text-m-body press disabled:opacity-50 select-none"
            style={{ backgroundColor: "var(--color-ink-950)", color: "var(--color-paper)", touchAction: "none" }}
          >
            {saving ? (
              <Loader2 className="size-4 animate-spin" />
            ) : (
              <>
                <Send className="size-3.5" />
                <span>Record Payment</span>
              </>
            )}
          </button>
        </div>
      </div>

      {/* ══════ SELECTOR MODALS ══════ */}
      {modal === "supplier" ? (
        <SelectorModal
          title="Select Supplier"
          items={suppliers.map((s) => ({
            id: s.id,
            label: s.name,
            sub: Number(s.balanceOwed) > 0 ? `Owes ${formatCurrency(Number(s.balanceOwed))}` : undefined,
          }))}
          selectedId={supplierId}
          onSelect={handleSelect}
          onClose={() => setModal(null)}
          onCreate={() => setShowCreateSupplier(true)}
        />
      ) : null}

      {modal === "po" ? (
        <SelectorModal
          title="Select Purchase Order"
          items={[
            { id: "", label: "No PO linkage", sub: undefined as string | undefined },
            ...supplierPos.map((p) => ({
              id: p.id,
              label: p.poNumber,
              sub: `${formatCurrency(Number(p.total))} · ${p.status}`,
            })),
          ]}
          selectedId={purchaseOrderId}
          onSelect={handleSelect}
          onClose={() => setModal(null)}
        />
      ) : null}

      {modal === "invoice" ? (
        <SelectorModal
          title="Select Invoice"
          items={[
            { id: "", label: "No invoice linkage", sub: undefined as string | undefined },
            ...supplierInvoices.map((i) => ({
              id: i.id,
              label: i.invoiceNumber,
              sub: `${formatCurrency(Number(i.totalAmount))} · ${i.status}`,
            })),
          ]}
          selectedId={invoiceId}
          onSelect={handleSelect}
          onClose={() => setModal(null)}
        />
      ) : null}

      {/* ══════ INLINE CREATE SUPPLIER DIALOG ══════ */}
      {showCreateSupplier ? (
        <MobileFabModal
          open
          onClose={() => setShowCreateSupplier(false)}
          title="New Supplier"
          nested
        >
          <MobileNewSupplierForm
            onClose={() => setShowCreateSupplier(false)}
            onCreated={handleSupplierCreated}
          />
        </MobileFabModal>
      ) : null}
    </div>
  );
}

/* ═══════════════════════════════════════════════════════════
 * Inline selector card — tappable underline-style selector
 * matching the new form style (like supplier-returns)
 * ═══════════════════════════════════════════════════════════ */
function SelectorCardInline({
  onClick,
  label,
  value,
  subvalue,
  required,
}: {
  onClick: () => void;
  label: string;
  value?: string;
  subvalue?: string;
  required?: boolean;
}) {
  const hasValue = !!value;
  return (
    <div>
      <label className="block text-m-caption font-bold mb-0" style={{ color: "var(--color-ink-700)" }}>
        {label}{required ? <span style={{ color: "var(--color-stop)" }}> *</span> : null}
      </label>
      <button
        type="button"
        onClick={onClick}
        className="w-full h-7 px-1 text-m-caption outline-none border-b focus:border-b-2 transition-colors text-left press"
        style={{
          borderColor: "var(--color-line)",
          backgroundColor: "transparent",
          color: hasValue ? "var(--color-ink-950)" : "var(--color-ink-500)",
        }}
      >
        {hasValue ? (
          <span className="truncate block">
            {value}{subvalue ? <span className="font-normal" style={{ color: "var(--color-ink-700)" }}> · {subvalue}</span> : null}
          </span>
        ) : (
          <span>— Select —</span>
        )}
      </button>
    </div>
  );
}

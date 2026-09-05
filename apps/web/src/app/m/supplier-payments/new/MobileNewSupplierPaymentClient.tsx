"use client";

import { useState, useMemo } from "react";
import { useRouter } from "next/navigation";
import { toast } from "sonner";
import { Loader2, Save, IndianRupee } from "lucide-react";
import { formatCurrency } from "@/lib/utils";
import { useTodayDateState } from "@/lib/use-today-date";

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
  suppliers,
  purchaseOrders,
  invoices,
}: {
  suppliers: Supplier[];
  purchaseOrders: PO[];
  invoices: Invoice[];
}) {
  const router = useRouter();
  const [saving, setSaving] = useState(false);
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

  const selectedSupplier = suppliers.find((s) => s.id === supplierId);

  const supplierPos = useMemo(
    () => (supplierId ? purchaseOrders.filter((p) => p.supplierId === supplierId) : []),
    [supplierId, purchaseOrders],
  );
  const supplierInvoices = useMemo(
    () => (supplierId ? invoices.filter((i) => i.supplierId === supplierId) : []),
    [supplierId, invoices],
  );

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
          notes: notes.trim() || undefined,
        }),
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(data.error ?? "Failed to record payment");
      toast.success("Supplier payment recorded");
      router.push("/m/supplier-payments");
      router.refresh();
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Something went wrong");
    } finally {
      setSaving(false);
    }
  }

  const inputClass =
    "w-full h-9 px-2 text-m-body outline-none border rounded-[0.375rem] focus:border-b-2 transition-colors";
  const inputStyle = {
    borderColor: "var(--color-line)",
    backgroundColor: "var(--color-paper)",
    color: "var(--color-ink-950)",
  };
  const labelClass = "block text-m-caption font-bold mb-1";
  const labelStyle = { color: "var(--color-ink-700)" };

  return (
    <div className="pb-24">
      <div className="mb-4">
        <h1 className="text-m-section font-bold flex items-center gap-2" style={{ color: "var(--color-ink-950)" }}>
          <IndianRupee className="size-5" /> Record Supplier Payment
        </h1>
        <p className="mt-1 text-m-caption" style={{ color: "var(--color-ink-500)" }}>
          Pay a supplier against an open PO or invoice.
        </p>
      </div>

      <form onSubmit={handleSubmit} className="flex flex-col gap-3">
        {/* Supplier */}
        <div className="rounded-[0.625rem] border p-3 flex flex-col gap-3" style={{ borderColor: "var(--color-line)", backgroundColor: "var(--color-paper)" }}>
          <div>
            <label className={labelClass} style={labelStyle}>
              Supplier <span style={{ color: "var(--color-stop)" }}>*</span>
            </label>
            <select
              value={supplierId}
              onChange={(e) => {
                setSupplierId(e.target.value);
                setPurchaseOrderId("");
                setInvoiceId("");
              }}
              className={inputClass}
              style={inputStyle}
            >
              <option value="">— Select supplier —</option>
              {suppliers.map((s) => (
                <option key={s.id} value={s.id}>
                  {s.name}
                  {Number(s.balanceOwed) > 0 ? ` (owes ${formatCurrency(Number(s.balanceOwed))})` : ""}
                </option>
              ))}
            </select>
          </div>

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

        {/* Linked PO / Invoice (optional) */}
        {supplierId && (supplierPos.length > 0 || supplierInvoices.length > 0) && (
          <div className="rounded-[0.625rem] border p-3 flex flex-col gap-3" style={{ borderColor: "var(--color-line)", backgroundColor: "var(--color-paper)" }}>
            <p className="text-m-section font-extrabold" style={{ color: "var(--color-ink-950)" }}>
              Link to (optional)
            </p>

            {supplierPos.length > 0 && (
              <div>
                <label className={labelClass} style={labelStyle}>Purchase Order</label>
                <select
                  value={purchaseOrderId}
                  onChange={(e) => setPurchaseOrderId(e.target.value)}
                  className={inputClass}
                  style={inputStyle}
                >
                  <option value="">— None —</option>
                  {supplierPos.map((p) => (
                    <option key={p.id} value={p.id}>
                      {p.poNumber} · {formatCurrency(Number(p.total))} · {p.status}
                    </option>
                  ))}
                </select>
              </div>
            )}

            {supplierInvoices.length > 0 && (
              <div>
                <label className={labelClass} style={labelStyle}>Invoice</label>
                <select
                  value={invoiceId}
                  onChange={(e) => setInvoiceId(e.target.value)}
                  className={inputClass}
                  style={inputStyle}
                >
                  <option value="">— None —</option>
                  {supplierInvoices.map((i) => (
                    <option key={i.id} value={i.id}>
                      {i.invoiceNumber} · {formatCurrency(Number(i.totalAmount))} · {i.status}
                    </option>
                  ))}
                </select>
              </div>
            )}
          </div>
        )}

        {/* Payment details */}
        <div className="rounded-[0.625rem] border p-3 flex flex-col gap-3" style={{ borderColor: "var(--color-line)", backgroundColor: "var(--color-paper)" }}>
          <p className="text-m-section font-extrabold" style={{ color: "var(--color-ink-950)" }}>
            Payment Details
          </p>

          <div className="grid grid-cols-2 gap-2">
            <div>
              <label className={labelClass} style={labelStyle}>
                Amount (₹) <span style={{ color: "var(--color-stop)" }}>*</span>
              </label>
              <input
                type="number"
                min={0.01}
                step="any"
                value={amount}
                onChange={(e) => setAmount(e.target.value)}
                placeholder="0"
                inputMode="decimal"
                autoFocus
                className={inputClass}
                style={inputStyle}
              />
            </div>
            <div>
              <label className={labelClass} style={labelStyle}>Date</label>
              <input
                type="date"
                value={paymentDate}
                onChange={(e) => setPaymentDate(e.target.value)}
                className={inputClass}
                style={inputStyle}
              />
            </div>
          </div>

          <div>
            <label className={labelClass} style={labelStyle}>Payment Mode</label>
            <select
              value={paymentMode}
              onChange={(e) => setPaymentMode(e.target.value)}
              className={inputClass}
              style={inputStyle}
            >
              {PAYMENT_MODES.map((m) => (
                <option key={m.value} value={m.value}>{m.label}</option>
              ))}
            </select>
          </div>

          <div>
            <label className={labelClass} style={labelStyle}>Reference No. (optional)</label>
            <input
              type="text"
              value={referenceNo}
              onChange={(e) => setReferenceNo(e.target.value)}
              placeholder="UTR / cheque no."
              className={inputClass}
              style={inputStyle}
            />
          </div>

          <div className="grid grid-cols-2 gap-2">
            <div>
              <label className={labelClass} style={labelStyle}>TDS Amount (optional)</label>
              <input
                type="number"
                min={0}
                step="any"
                value={tdsAmount}
                onChange={(e) => setTdsAmount(e.target.value)}
                placeholder="0"
                inputMode="decimal"
                className={inputClass}
                style={inputStyle}
              />
            </div>
            <div>
              <label className={labelClass} style={labelStyle}>TDS Section</label>
              <input
                type="text"
                value={tdsSection}
                onChange={(e) => setTdsSection(e.target.value)}
                placeholder="e.g. 194C"
                className={inputClass}
                style={inputStyle}
              />
            </div>
          </div>

          <div>
            <label className={labelClass} style={labelStyle}>Notes (optional)</label>
            <textarea
              value={notes}
              onChange={(e) => setNotes(e.target.value)}
              rows={2}
              placeholder="Additional context…"
              className="w-full px-2 py-1.5 text-m-body outline-none border rounded-[0.375rem] resize-none"
              style={inputStyle}
            />
          </div>
        </div>

        {/* Submit */}
        <button
          type="submit"
          disabled={saving}
          className="fixed bottom-20 left-4 right-4 z-30 flex items-center justify-center gap-2 rounded-[0.625rem] py-3 text-m-body font-bold shadow-lg press"
          style={{ backgroundColor: "var(--color-ink-950)", color: "var(--color-paper)" }}
        >
          {saving ? <Loader2 className="size-4 animate-spin" /> : <Save className="size-4" />}
          Record Payment
        </button>
      </form>
    </div>
  );
}

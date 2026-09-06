"use client";

import { useState, useMemo, useRef } from "react";
import { useRouter } from "next/navigation";
import Image from "next/image";
import { toast } from "sonner";
import { Loader2, Save, IndianRupee, Camera, X } from "lucide-react";
import { formatCurrency } from "@/lib/utils";
import { useTodayDateState } from "@/lib/use-today-date";
import { MobileSelectWithCreate } from "@/components/mobile/MobileSelectWithCreate";
import { EnumSelect } from "@/components/mobile/v2/form-primitives";

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
  const [chequePhotoUrl, setChequePhotoUrl] = useState("");
  const [uploading, setUploading] = useState(false);
  const fileRef = useRef<HTMLInputElement>(null);

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
            <MobileSelectWithCreate
              label="Supplier"
              required
              value={supplierId}
              onChange={(v) => {
                setSupplierId(v);
                setPurchaseOrderId("");
                setInvoiceId("");
              }}
              placeholder="— Select supplier —"
              options={suppliers.map((s) => ({
                value: s.id,
                label: s.name,
                sub: Number(s.balanceOwed) > 0 ? `Owes ${formatCurrency(Number(s.balanceOwed))}` : undefined,
              }))}
              inputClass={inputClass}
              inputStyle={inputStyle}
            />
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
                <MobileSelectWithCreate
                  label="Purchase Order"
                  value={purchaseOrderId}
                  onChange={setPurchaseOrderId}
                  placeholder="— None —"
                  options={supplierPos.map((p) => ({
                    value: p.id,
                    label: p.poNumber,
                    sub: `${formatCurrency(Number(p.total))} · ${p.status}`,
                  }))}
                  inputClass={inputClass}
                  inputStyle={inputStyle}
                />
              </div>
            )}

            {supplierInvoices.length > 0 && (
              <div>
                <label className={labelClass} style={labelStyle}>Invoice</label>
                <MobileSelectWithCreate
                  label="Invoice"
                  value={invoiceId}
                  onChange={setInvoiceId}
                  placeholder="— None —"
                  options={supplierInvoices.map((i) => ({
                    value: i.id,
                    label: i.invoiceNumber,
                    sub: `${formatCurrency(Number(i.totalAmount))} · ${i.status}`,
                  }))}
                  inputClass={inputClass}
                  inputStyle={inputStyle}
                />
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
            <EnumSelect
              label="Payment Mode"
              value={paymentMode}
              onChange={(v) => setPaymentMode(v)}
              options={PAYMENT_MODES}
            />
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

          {paymentMode === "CHEQUE" && (
            <div>
              <label className={labelClass} style={labelStyle}>Cheque Photo (front)</label>
              {chequePhotoUrl ? (
                <div className="relative h-28 rounded-[0.375rem] border overflow-hidden" style={{ borderColor: "var(--color-line)" }}>
                  <Image src={chequePhotoUrl} alt="Cheque" fill className="object-cover" sizes="(max-width: 768px) 100vw, 400px" />
                  <button
                    type="button"
                    onClick={() => setChequePhotoUrl("")}
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
                  className="flex items-center justify-center gap-1.5 w-full rounded-[0.375rem] border border-dashed py-3 text-m-body press disabled:opacity-50"
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

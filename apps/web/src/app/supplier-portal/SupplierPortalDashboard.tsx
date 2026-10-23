"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import type { PortalSupplier } from "@/lib/supplier-portal-auth";

type OrderLine = { id: string; materialName: string; unit: string | null; qtyOrdered: number; qtyReceived: number; unitCost: number };
type Order = { id: string; poNumber: string; status: string; orderDate: string; expectedDate: string | null; projectName: string | null; total: number; lines: OrderLine[] };
type Invoice = { id: string; invoiceNumber: string; invoiceDate: string; dueDate: string | null; poNumber: string | null; totalAmount: number; status: string; matchStatus: string | null; paid: number; outstanding: number };
type Payment = { id: string; paymentNumber: string; amount: number; tdsAmount: number; tdsSection: string | null; netPaidAmount: number; paymentDate: string; paymentMode: string; referenceNo: string | null; status: string; poNumber: string | null; invoiceNumber: string | null };

const inr = (n: number) =>
  new Intl.NumberFormat("en-IN", { style: "currency", currency: "INR", maximumFractionDigits: 0 }).format(n);
const fdate = (iso: string | null) => (iso ? new Date(iso).toLocaleDateString("en-IN", { day: "numeric", month: "short", year: "numeric" }) : "—");

const statusColors: Record<string, string> = {
  ORDERED: "bg-blue-50 text-blue-700",
  RECEIVED: "bg-green-50 text-green-700",
  APPROVED: "bg-green-50 text-green-700",
  PAID: "bg-green-50 text-green-700",
  DRAFT: "bg-slate-100 text-slate-600",
  PENDING: "bg-amber-50 text-amber-700",
  MATCHED: "bg-blue-50 text-blue-700",
  DISPUTED: "bg-red-50 text-red-700",
  ACTIVE: "bg-green-50 text-green-700",
  VOID: "bg-red-50 text-red-700",
};

export function SupplierPortalDashboard({ supplier }: { supplier: PortalSupplier }) {
  const router = useRouter();
  const [tab, setTab] = useState<"orders" | "invoices" | "payments">("orders");
  const [orders, setOrders] = useState<Order[] | null>(null);
  const [invoices, setInvoices] = useState<Invoice[] | null>(null);
  const [payments, setPayments] = useState<Payment[] | null>(null);
  const [showSubmit, setShowSubmit] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [submitError, setSubmitError] = useState("");
  const [submitOk, setSubmitOk] = useState("");
  const [form, setForm] = useState({ invoiceNumber: "", invoiceDate: "", dueDate: "", subtotal: "", gstAmount: "", totalAmount: "", purchaseOrderId: "", hsnCode: "" });
  const [error, setError] = useState("");

  useEffect(() => {
    fetch("/api/supplier-portal/purchase-orders")
      .then((r) => (r.ok ? r.json() : Promise.reject(new Error("Failed to load"))))
      .then((d) => setOrders(d.orders))
      .catch(() => setError("Couldn't load your orders"));
    fetch("/api/supplier-portal/invoices")
      .then((r) => (r.ok ? r.json() : Promise.reject(new Error("Failed"))))
      .then((d) => setInvoices(d.invoices))
      .catch(() => {});
    fetch("/api/supplier-portal/payments")
      .then((r) => (r.ok ? r.json() : Promise.reject(new Error("Failed"))))
      .then((d) => setPayments(d.payments))
      .catch(() => {});
  }, []);

  async function submitInvoice() {
    setSubmitError("");
    setSubmitOk("");
    const subtotal = Number(form.subtotal);
    const totalAmount = Number(form.totalAmount);
    if (!form.invoiceNumber.trim()) return setSubmitError("Invoice number is required.");
    if (!form.invoiceDate) return setSubmitError("Invoice date is required.");
    if (!isFinite(subtotal) || !isFinite(totalAmount)) return setSubmitError("Subtotal and total must be numbers.");
    setSubmitting(true);
    try {
      const res = await fetch("/api/supplier-portal/invoices", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          invoiceNumber: form.invoiceNumber,
          invoiceDate: form.invoiceDate,
          dueDate: form.dueDate || undefined,
          subtotal,
          gstAmount: form.gstAmount ? Number(form.gstAmount) : undefined,
          totalAmount,
          purchaseOrderId: form.purchaseOrderId || undefined,
          hsnCode: form.hsnCode || undefined,
        }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error ?? "Submit failed");
      setSubmitOk(`Invoice ${data.invoice.invoiceNumber} submitted — ${data.invoice.status === "MATCHED" ? "matched and sent for approval" : "received, under review"}.`);
      setForm({ invoiceNumber: "", invoiceDate: "", dueDate: "", subtotal: "", gstAmount: "", totalAmount: "", purchaseOrderId: "", hsnCode: "" });
      setShowSubmit(false);
      // Refresh the invoice list
      fetch("/api/supplier-portal/invoices").then((r) => r.ok ? r.json() : null).then((d) => d && setInvoices(d.invoices)).catch(() => {});
    } catch (e) {
      setSubmitError(e instanceof Error ? e.message : "Submit failed");
    } finally {
      setSubmitting(false);
    }
  }

  async function logout() {
    await fetch("/api/supplier-portal/auth/logout", { method: "POST" });
    router.push("/supplier-portal/login");
    router.refresh();
  }

  const badge = (s: string) => (
    <span className={`rounded-full px-2 py-0.5 text-[11px] font-semibold ${statusColors[s] ?? "bg-slate-100 text-slate-600"}`}>
      {s}
    </span>
  );

  return (
    <div className="mx-auto max-w-3xl px-4 py-6">
      <div className="mb-6 flex items-center justify-between">
        <div>
          <h1 className="text-xl font-bold text-slate-900">{supplier.name}</h1>
          <p className="text-sm text-slate-500">{supplier.companyName}{supplier.gstin ? ` · GSTIN ${supplier.gstin}` : ""}</p>
        </div>
        <button onClick={logout} className="rounded-lg border border-slate-200 px-3 py-1.5 text-sm text-slate-600 hover:bg-white">
          Logout
        </button>
      </div>

      {error && <div className="mb-4 rounded-lg bg-red-50 px-3 py-2 text-sm text-red-700">{error}</div>}

      {submitOk && <div className="mb-4 rounded-lg bg-green-50 px-3 py-2 text-sm text-green-700">{submitOk}</div>}

      {/* Submit invoice */}
      <div className="portal-card mb-4">
        <div className="flex items-center justify-between">
          <p className="text-sm font-medium text-slate-900">Sent us a bill?</p>
          <button onClick={() => setShowSubmit((v) => !v)} className="rounded-lg bg-slate-900 px-3 py-1.5 text-sm text-white hover:bg-slate-700">
            {showSubmit ? "Cancel" : "Submit an invoice"}
          </button>
        </div>
        {showSubmit && (
          <div className="mt-4 space-y-3 border-t border-slate-100 pt-4">
            {submitError && <div className="rounded-lg bg-red-50 px-3 py-2 text-sm text-red-700">{submitError}</div>}
            <div className="grid grid-cols-2 gap-3">
              <input className="portal-input" placeholder="Invoice number *" value={form.invoiceNumber} onChange={(e) => setForm({ ...form, invoiceNumber: e.target.value })} />
              <input className="portal-input" type="date" value={form.invoiceDate} onChange={(e) => setForm({ ...form, invoiceDate: e.target.value })} />
            </div>
            <div className="grid grid-cols-2 gap-3">
              <input className="portal-input" type="date" placeholder="Due date" value={form.dueDate} onChange={(e) => setForm({ ...form, dueDate: e.target.value })} />
              <select aria-label="Against a PO (optional)" className="portal-input" value={form.purchaseOrderId} onChange={(e) => setForm({ ...form, purchaseOrderId: e.target.value })}>
                <option value="">Against a PO? (optional)</option>
                {orders?.filter((o) => o.status === "ORDERED" || o.status === "PARTIAL" || o.status === "RECEIVED").map((o) => (
                  <option key={o.id} value={o.id}>{o.poNumber} · {inr(o.total)}</option>
                ))}
              </select>
            </div>
            <div className="grid grid-cols-3 gap-3">
              <input className="portal-input" type="number" placeholder="Subtotal ₹ *" value={form.subtotal} onChange={(e) => setForm({ ...form, subtotal: e.target.value })} />
              <input className="portal-input" type="number" placeholder="GST ₹" value={form.gstAmount} onChange={(e) => setForm({ ...form, gstAmount: e.target.value })} />
              <input className="portal-input" type="number" placeholder="Total ₹ *" value={form.totalAmount} onChange={(e) => setForm({ ...form, totalAmount: e.target.value })} />
            </div>
            <input className="portal-input" placeholder="HSN/SAC code (optional)" value={form.hsnCode} onChange={(e) => setForm({ ...form, hsnCode: e.target.value })} />
            <p className="text-xs text-slate-500">Total should equal subtotal + GST. We run the PO match at submission — a matched bill goes straight to approval.</p>
            <button onClick={submitInvoice} disabled={submitting} className="portal-btn portal-btn-primary w-full">
              {submitting ? "Submitting…" : "Submit invoice"}
            </button>
          </div>
        )}
      </div>

      {/* Tabs */}
      <div className="mb-4 flex gap-1 rounded-xl bg-slate-100 p-1">
        {([["orders", "Orders"], ["invoices", "Invoices"], ["payments", "Payments"]] as const).map(([key, label]) => (
          <button
            key={key}
            onClick={() => setTab(key)}
            className={`flex-1 rounded-lg px-3 py-2 text-sm font-medium transition-colors ${tab === key ? "bg-white text-slate-900 shadow-sm" : "text-slate-600 hover:text-slate-900"}`}
          >
            {label}
          </button>
        ))}
      </div>

      {tab === "orders" && (
        <div className="space-y-3">
          {orders == null ? <p className="text-sm text-slate-500">Loading…</p> : orders.length === 0 ? (
            <p className="portal-card text-sm text-slate-500">No purchase orders yet.</p>
          ) : orders.map((o) => (
            <div key={o.id} className="portal-card">
              <div className="mb-2 flex items-center justify-between">
                <div>
                  <p className="font-semibold text-slate-900">{o.poNumber}</p>
                  <p className="text-xs text-slate-500">
                    {fdate(o.orderDate)}{o.projectName ? ` · ${o.projectName}` : ""}
                    {o.expectedDate ? ` · expected ${fdate(o.expectedDate)}` : ""}
                  </p>
                </div>
                <div className="text-right">
                  <p className="font-bold text-slate-900">{inr(o.total)}</p>
                  {badge(o.status)}
                </div>
              </div>
              <table className="w-full text-sm">
                <tbody>
                  {o.lines.map((l) => (
                    <tr key={l.id} className="border-t border-slate-100">
                      <td className="py-1.5 pr-2 text-slate-700">{l.materialName}</td>
                      <td className="py-1.5 text-right text-slate-500">
                        {l.qtyOrdered}{l.unit ? ` ${l.unit.toLowerCase()}` : ""}
                        {l.qtyReceived > 0 && ` · rcvd ${l.qtyReceived}`}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          ))}
        </div>
      )}

      {tab === "invoices" && (
        <div className="space-y-3">
          {invoices == null ? <p className="text-sm text-slate-500">Loading…</p> : invoices.length === 0 ? (
            <p className="portal-card text-sm text-slate-500">No invoices on record.</p>
          ) : invoices.map((i) => (
            <div key={i.id} className="portal-card flex items-center justify-between">
              <div>
                <p className="font-semibold text-slate-900">Invoice {i.invoiceNumber}</p>
                <p className="text-xs text-slate-500">
                  {fdate(i.invoiceDate)}{i.poNumber ? ` · ${i.poNumber}` : ""}
                  {i.dueDate ? ` · due ${fdate(i.dueDate)}` : ""}
                  {i.matchStatus ? ` · ${i.matchStatus.replace(/_/g, " ").toLowerCase()}` : ""}
                </p>
              </div>
              <div className="text-right">
                <p className="font-bold text-slate-900">{inr(i.totalAmount)}</p>
                <p className="text-xs text-slate-500">
                  {i.outstanding > 0 ? `due ${inr(i.outstanding)}` : "fully paid"} · {badge(i.status)}
                </p>
              </div>
            </div>
          ))}
        </div>
      )}

      {tab === "payments" && (
        <div className="space-y-3">
          {payments == null ? <p className="text-sm text-slate-500">Loading…</p> : payments.length === 0 ? (
            <p className="portal-card text-sm text-slate-500">No payments yet.</p>
          ) : payments.map((p) => (
            <div key={p.id} className="portal-card flex items-center justify-between">
              <div>
                <p className="font-semibold text-slate-900">{p.paymentNumber}</p>
                <p className="text-xs text-slate-500">
                  {fdate(p.paymentDate)} · {p.paymentMode}{p.referenceNo ? ` · ${p.referenceNo}` : ""}
                  {p.invoiceNumber ? ` · inv ${p.invoiceNumber}` : ""}
                  {p.poNumber ? ` · ${p.poNumber}` : ""}
                </p>
                {p.tdsAmount > 0 && (
                  <p className="mt-0.5 text-xs text-amber-700">
                    TDS {p.tdsSection ? `${p.tdsSection} ` : ""}{inr(p.tdsAmount)} — claim in Form 26AS
                  </p>
                )}
              </div>
              <div className="text-right">
                <p className="font-bold text-slate-900">{inr(p.netPaidAmount || p.amount)}</p>
                {badge(p.status)}
              </div>
            </div>
          ))}
        </div>
      )}

      <p className="mt-8 text-center text-xs text-slate-400">
        Your orders, invoices and payments — as recorded by {supplier.companyName}
      </p>
    </div>
  );
}

"use client";

import { useEffect, useState, useMemo } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import {
  Plus, Trash2, Loader2, ChevronLeft, CheckCircle2, IndianRupee,
  Search, X, ChevronRight, User, MapPin, Package, Building2,
  Wallet, Send,
} from "lucide-react";
import { formatCurrency } from "@/lib/utils";
import { toast } from "sonner";

interface CustomerItem { id: string; name: string; phone?: string | null; }
interface LocationItem { id: string; name: string; type: string; }
interface MaterialItem { id: string; name: string; code: string; unit: string; gstRate: number; }
interface ProjectItem { id: string; name: string; }

interface SaleLine {
  materialId: string;
  locationId: string;
  qty: string;
  unitPrice: string;
}

const PAYMENT_MODES = ["CASH", "BANK", "UPI", "CHEQUE"] as const;
type PaymentMode = typeof PAYMENT_MODES[number];
type PaymentType = "credit" | "paid";

interface PaymentSplit {
  id: string;
  amount: string;
  mode: PaymentMode;
}

export default function MobileNewMaterialSaleClient() {
  const router = useRouter();
  const [customers, setCustomers] = useState<CustomerItem[]>([]);
  const [locations, setLocations] = useState<LocationItem[]>([]);
  const [materials, setMaterials] = useState<MaterialItem[]>([]);
  const [projects, setProjects] = useState<ProjectItem[]>([]);

  const [loading, setLoading] = useState(true);
  const [submitting, setSubmitting] = useState(false);

  const [customerId, setCustomerId] = useState("");
  const [projectId, setProjectId] = useState("");
  const [paymentType, setPaymentType] = useState<PaymentType>("credit");
  const [paymentSplits, setPaymentSplits] = useState<PaymentSplit[]>([
    { id: crypto.randomUUID(), amount: "", mode: "CASH" },
  ]);
  const [notes, setNotes] = useState("");
  const [lines, setLines] = useState<SaleLine[]>([{ materialId: "", locationId: "", qty: "", unitPrice: "" }]);

  const [success, setSuccess] = useState<{ saleNumber: string; totalAmount: number; amountPaid?: number } | null>(null);

  useEffect(() => {
    let cancelled = false;
    async function loadData() {
      try {
        const [custRes, locRes, matRes, projRes] = await Promise.all([
          fetch("/api/customers").then((r) => (r.ok ? r.json() : [])),
          fetch("/api/stock-locations").then((r) => (r.ok ? r.json() : [])),
          fetch("/api/materials").then((r) => (r.ok ? r.json() : [])),
          fetch("/api/projects").then((r) => (r.ok ? r.json() : [])),
        ]);
        if (cancelled) return;
        if (Array.isArray(custRes)) {
          setCustomers(custRes);
          if (custRes.length > 0) setCustomerId(custRes[0].id);
        }
        if (Array.isArray(locRes)) {
          setLocations(locRes);
          if (locRes.length > 0 && Array.isArray(matRes) && matRes.length > 0) {
            setLines([{ materialId: matRes[0].id, locationId: locRes[0].id, qty: "", unitPrice: "" }]);
          }
        }
        if (Array.isArray(matRes)) setMaterials(matRes);
        if (Array.isArray(projRes)) setProjects(projRes);
      } catch (err) {
        console.error("Failed to load form options:", err);
      } finally {
        if (!cancelled) setLoading(false);
      }
    }
    loadData();
    return () => { cancelled = true; };
  }, []);

  const handleAddLine = () => {
    const defaultMatId = materials.length > 0 ? materials[0]!.id : "";
    const defaultLocId = locations.length > 0 ? locations[0]!.id : "";
    setLines([...lines, { materialId: defaultMatId, locationId: defaultLocId, qty: "", unitPrice: "" }]);
  };

  const handleRemoveLine = (index: number) => {
    if (lines.length === 1) return;
    setLines(lines.filter((_, i) => i !== index));
  };

  const handleLineChange = (index: number, field: keyof SaleLine, val: string) => {
    const updated = [...lines];
    updated[index] = { ...updated[index]!, [field]: val };
    setLines(updated);
  };

  const subtotal = lines.reduce((s, l) => s + (Number(l.qty) || 0) * (Number(l.unitPrice) || 0), 0);
  const gstTotal = lines.reduce((s, l) => {
    const mat = materials.find((m) => m.id === l.materialId);
    const rate = mat?.gstRate ?? 0;
    return s + (Number(l.qty) || 0) * (Number(l.unitPrice) || 0) * rate / 100;
  }, 0);
  const total = subtotal + gstTotal;

  const selectedCustomer = customers.find((c) => c.id === customerId);
  const selectedProject = projects.find((p) => p.id === projectId);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!customerId) { toast.error("Please select a customer"); return; }
    const validLines = lines.filter((l) => l.materialId && l.locationId && Number(l.qty) > 0 && Number(l.unitPrice) > 0);
    if (validLines.length === 0) { toast.error("Add at least one line item with qty and price"); return; }

    // Validate payment splits
    const validSplits = paymentType === "paid"
      ? paymentSplits.filter((s) => Number(s.amount) > 0)
      : [];
    const totalPaid = validSplits.reduce((s, sp) => s + (Number(sp.amount) || 0), 0);

    if (paymentType === "paid") {
      if (validSplits.length === 0) {
        toast.error("Add at least one payment with an amount");
        return;
      }
      if (totalPaid > total + 0.01) {
        toast.error(`Total payments (${formatCurrency(totalPaid)}) exceed sale total (${formatCurrency(total)})`);
        return;
      }
    }

    setSubmitting(true);
    try {
      // 1. Create the sale
      const res = await fetch("/api/material-sales", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          customerId,
          projectId: projectId || null,
          paymentMode: paymentType === "credit" ? null : validSplits[0]?.mode ?? null,
          notes: notes || null,
          lines: validLines.map((l) => {
            const mat = materials.find((m) => m.id === l.materialId);
            return {
              materialId: l.materialId, locationId: l.locationId,
              qty: Number(l.qty), unitPrice: Number(l.unitPrice),
              gstRate: mat?.gstRate ?? 0,
            };
          }),
        }),
      });
      if (!res.ok) {
        const err = await res.json().catch(() => ({}));
        throw new Error(err.error ?? "Failed to create sale");
      }
      const data = await res.json();
      const saleId = data.id;

      // 2. Record each payment split sequentially
      //    Backend tracks previouslyPaid and prevents overpayment
      let paymentFailed = false;
      for (const split of validSplits) {
        const payRes = await fetch(`/api/material-sales/${saleId}/payments`, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            amount: Number(split.amount),
            paymentMode: split.mode,
          }),
        });
        if (!payRes.ok) {
          const err = await payRes.json().catch(() => ({}));
          toast.warning(`Payment of ${formatCurrency(Number(split.amount))} via ${split.mode} failed: ${err.error ?? "unknown"}`);
          paymentFailed = true;
          break;
        }
      }

      setSuccess({
        saleNumber: data.saleNumber,
        totalAmount: total,
        amountPaid: paymentFailed ? undefined : totalPaid,
      });
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Failed to create sale");
    } finally {
      setSubmitting(false);
    }
  };

  /* ── Success state ── */
  if (success) {
    const isPaid = success.amountPaid !== undefined && success.amountPaid >= success.totalAmount - 0.01;
    const isPartial = success.amountPaid !== undefined && success.amountPaid < success.totalAmount - 0.01;
    return (
      <div className="flex flex-col items-center justify-center py-12 px-4 text-center">
        <div
          className="grid place-items-center size-14 rounded-full mb-3"
          style={{ backgroundColor: "color-mix(in srgb, var(--color-go) 12%, transparent)" }}
        >
          <CheckCircle2 className="size-7" style={{ color: "var(--color-go)" }} />
        </div>
        <p className="text-[0.875rem] font-bold mb-1" style={{ color: "var(--color-ink-950)" }}>Sale Created</p>
        <p className="text-[0.6875rem] font-mono mb-3" style={{ color: "var(--color-ink-500)" }}>{success.saleNumber}</p>
        <p className="text-[1rem] font-bold tabular-nums mb-1" style={{ color: "var(--color-go)" }}>
          {formatCurrency(success.totalAmount)}
        </p>
        {/* Payment status badge */}
        {isPaid ? (
          <p className="text-[0.5625rem] font-bold uppercase mb-4" style={{ color: "var(--color-go)" }}>
            Fully Paid
          </p>
        ) : isPartial ? (
          <p className="text-[0.5625rem] font-bold uppercase mb-4" style={{ color: "var(--color-signal)" }}>
            Partial · {formatCurrency(success.totalAmount - (success.amountPaid ?? 0))} Due
          </p>
        ) : (
          <p className="text-[0.5625rem] font-bold uppercase mb-4" style={{ color: "var(--color-signal)" }}>
            Unpaid · Credit
          </p>
        )}
        <div className="flex gap-2">
          <button
            onClick={() => {
              router.refresh();
              router.push("/m/material-sales");
            }}
            className="rounded-[0.5rem] px-4 py-2 text-[0.6875rem] font-bold press"
            style={{ backgroundColor: "var(--color-ink-950)", color: "#fff" }}
          >
            View All Sales
          </button>
          <button
            onClick={() => {
              setSuccess(null);
              setLines([{ materialId: materials[0]?.id ?? "", locationId: locations[0]?.id ?? "", qty: "", unitPrice: "" }]);
              setPaymentSplits([{ id: crypto.randomUUID(), amount: "", mode: "CASH" }]);
              setNotes("");
            }}
            className="rounded-[0.5rem] px-4 py-2 text-[0.6875rem] font-bold border press"
            style={{ borderColor: "var(--color-line)", backgroundColor: "var(--color-paper)", color: "var(--color-ink-950)" }}
          >
            Add Another
          </button>
        </div>
      </div>
    );
  }

  /* ── Loading state ── */
  if (loading) {
    return (
      <div className="flex flex-col items-center justify-center py-12">
        <Loader2 className="size-6 animate-spin" style={{ color: "var(--color-ink-500)" }} />
        <p className="text-[0.6875rem] mt-2" style={{ color: "var(--color-ink-500)" }}>Loading form…</p>
      </div>
    );
  }

  return (
    <SaleForm
      customers={customers}
      locations={locations}
      materials={materials}
      projects={projects}
      customerId={customerId}
      setCustomerId={setCustomerId}
      projectId={projectId}
      setProjectId={setProjectId}
      paymentType={paymentType}
      setPaymentType={setPaymentType}
      paymentSplits={paymentSplits}
      setPaymentSplits={setPaymentSplits}
      notes={notes}
      setNotes={setNotes}
      lines={lines}
      setLines={setLines}
      onAddLine={handleAddLine}
      onRemoveLine={handleRemoveLine}
      onLineChange={handleLineChange}
      onSubmit={handleSubmit}
      submitting={submitting}
      subtotal={subtotal}
      gstTotal={gstTotal}
      total={total}
      selectedCustomer={selectedCustomer}
      selectedProject={selectedProject}
    />
  );
}

/* ═══════════════════════════════════════════════════════════
 * Main form component — holds the selector modal state
 * ═══════════════════════════════════════════════════════════ */
function SaleForm({
  customers, locations, materials, projects,
  customerId, setCustomerId,
  projectId, setProjectId,
  paymentType, setPaymentType,
  paymentSplits, setPaymentSplits,
  notes, setNotes,
  lines, setLines: _setLines,
  onAddLine, onRemoveLine, onLineChange,
  onSubmit, submitting,
  subtotal: _subtotal, gstTotal: _gstTotal, total,
  selectedCustomer, selectedProject,
}: {
  customers: CustomerItem[];
  locations: LocationItem[];
  materials: MaterialItem[];
  projects: ProjectItem[];
  customerId: string;
  setCustomerId: (v: string) => void;
  projectId: string;
  setProjectId: (v: string) => void;
  paymentType: PaymentType;
  setPaymentType: (v: PaymentType) => void;
  paymentSplits: PaymentSplit[];
  setPaymentSplits: React.Dispatch<React.SetStateAction<PaymentSplit[]>>;
  notes: string;
  setNotes: (v: string) => void;
  lines: SaleLine[];
  setLines: React.Dispatch<React.SetStateAction<SaleLine[]>>;
  onAddLine: () => void;
  onRemoveLine: (i: number) => void;
  onLineChange: (i: number, field: keyof SaleLine, val: string) => void;
  onSubmit: (e: React.FormEvent) => void;
  submitting: boolean;
  subtotal: number;
  gstTotal: number;
  total: number;
  selectedCustomer?: CustomerItem;
  selectedProject?: ProjectItem;
}) {
  // Selector modal state
  const [modal, setModal] = useState<{
    type: "customer" | "project" | "material" | "location";
    lineIndex?: number;
  } | null>(null);

  const closeModal = () => setModal(null);

  const handleSelect = (id: string) => {
    if (!modal) return;
    if (modal.type === "customer") setCustomerId(id);
    else if (modal.type === "project") setProjectId(id);
    else if (modal.type === "material" && modal.lineIndex !== undefined) {
      onLineChange(modal.lineIndex, "materialId", id);
    } else if (modal.type === "location" && modal.lineIndex !== undefined) {
      onLineChange(modal.lineIndex, "locationId", id);
    }
    closeModal();
  };

  return (
    <div className="pb-32">
      {/* ── Header ── */}
      <div className="flex items-center gap-2 mb-3">
        <Link href="/m/material-sales" className="shrink-0">
          <ChevronLeft className="size-5" style={{ color: "var(--color-ink-700)" }} />
        </Link>
        <div className="flex-1 min-w-0">
          <p className="text-[0.875rem] font-bold" style={{ color: "var(--color-ink-950)" }}>
            New Material Sale
          </p>
        </div>
        <span
          className="flex items-center gap-0.5 text-[0.5rem] font-bold uppercase tracking-wide px-2 py-0.5 rounded-full shrink-0"
          style={{ color: "var(--color-go)", backgroundColor: "color-mix(in srgb, var(--color-go) 12%, transparent)" }}
        >
          <IndianRupee className="size-2.5" />
          Sale
        </span>
      </div>

      <form onSubmit={onSubmit} className="flex flex-col gap-3">
        {/* ══════ SECTION: WHO ══════ */}
        <SectionHeader icon={User} label="Customer" />

        {/* Customer selector card */}
        <SelectorCard
          onClick={() => setModal({ type: "customer" })}
          icon={User}
          label="Customer"
          value={selectedCustomer?.name}
          subvalue={selectedCustomer?.phone}
          required
        />

        {/* Project selector card (optional) */}
        <SelectorCard
          onClick={() => setModal({ type: "project" })}
          icon={Building2}
          label="Project (optional)"
          value={projectId ? selectedProject?.name : undefined}
          placeholder="No project linkage"
        />

        {/* ══════ SECTION: WHAT ══════ */}
        <SectionHeader icon={Package} label="Line Items" />

        <div className={lines.length > 1 ? "grid grid-cols-2 gap-2" : "flex flex-col gap-2"}>
          {lines.map((line, idx) => {
            const mat = materials.find((m) => m.id === line.materialId);
            const loc = locations.find((l) => l.id === line.locationId);
            const lineTotal = (Number(line.qty) || 0) * (Number(line.unitPrice) || 0);
            return (
              <div
                key={idx}
                className="rounded-[0.625rem] border overflow-hidden flex flex-col"
                style={{ borderColor: "var(--color-line)", backgroundColor: "var(--color-paper)" }}
              >
                {/* Line header with number + remove */}
                <div
                  className="flex items-center justify-between px-2 py-1"
                  style={{ backgroundColor: "var(--color-paper-2)", borderBottom: "1px solid var(--color-line)" }}
                >
                  <span className="text-[0.4375rem] font-bold uppercase tracking-wide" style={{ color: "var(--color-ink-500)" }}>
                    Item {idx + 1}
                  </span>
                  {lines.length > 1 ? (
                    <button
                      type="button"
                      onClick={() => onRemoveLine(idx)}
                      className="flex items-center gap-0.5 text-[0.4375rem] font-semibold press"
                      style={{ color: "var(--color-stop)" }}
                    >
                      <Trash2 className="size-2.5" />
                    </button>
                  ) : null}
                </div>

                <div className="p-1.5 flex flex-col gap-1.5 flex-1">
                  {/* Material selector */}
                  <SelectorRow
                    onClick={() => setModal({ type: "material", lineIndex: idx })}
                    icon={Package}
                    label="Material"
                    value={mat ? mat.name : undefined}
                    subvalue={mat ? `${mat.code} · ${mat.unit}` : undefined}
                    required
                    compact
                  />

                  {/* Location selector */}
                  <SelectorRow
                    onClick={() => setModal({ type: "location", lineIndex: idx })}
                    icon={MapPin}
                    label="From"
                    value={loc?.name}
                    compact
                  />

                  {/* Qty + Price inputs */}
                  <div className="grid grid-cols-2 gap-1.5 mt-0.5">
                    <div>
                      <label className="text-[0.375rem] font-semibold uppercase block mb-0.5" style={{ color: "var(--color-ink-500)" }}>
                        Qty{mat ? ` (${mat.unit})` : ""}
                      </label>
                      <input
                        type="number"
                        step="any"
                        min="0"
                        value={line.qty}
                        onChange={(e) => onLineChange(idx, "qty", e.target.value)}
                        placeholder="0"
                        className="w-full rounded-[0.375rem] border px-2 py-1.5 text-[0.6875rem] font-bold tabular-nums outline-none"
                        style={{ borderColor: "var(--color-line)", backgroundColor: "var(--color-paper)", color: "var(--color-ink-950)" }}
                      />
                    </div>
                    <div>
                      <label className="text-[0.375rem] font-semibold uppercase block mb-0.5" style={{ color: "var(--color-ink-500)" }}>
                        Price
                      </label>
                      <input
                        type="number"
                        step="any"
                        min="0"
                        value={line.unitPrice}
                        onChange={(e) => onLineChange(idx, "unitPrice", e.target.value)}
                        placeholder="0"
                        className="w-full rounded-[0.375rem] border px-2 py-1.5 text-[0.6875rem] font-bold tabular-nums outline-none"
                        style={{ borderColor: "var(--color-line)", backgroundColor: "var(--color-paper)", color: "var(--color-ink-950)" }}
                      />
                    </div>
                  </div>

                  {/* Line total — pinned to bottom */}
                  <div
                    className="flex items-center justify-between rounded-[0.375rem] px-1.5 py-1 mt-auto"
                    style={{ backgroundColor: "color-mix(in srgb, var(--color-go) 6%, transparent)" }}
                  >
                    <span className="text-[0.4375rem] font-semibold uppercase" style={{ color: "var(--color-ink-500)" }}>
                      Total
                    </span>
                    <div className="flex items-center gap-1">
                      <span className="text-[0.625rem] font-bold tabular-nums" style={{ color: "var(--color-ink-950)" }}>
                        {formatCurrency(lineTotal)}
                      </span>
                      {mat && mat.gstRate > 0 ? (
                        <span className="text-[0.375rem] font-semibold" style={{ color: "var(--color-ink-500)" }}>
                          +{mat.gstRate}%
                        </span>
                      ) : null}
                    </div>
                  </div>
                </div>
              </div>
            );
          })}
        </div>

        {/* Add line button */}
        <button
          type="button"
          onClick={onAddLine}
          className="flex items-center justify-center gap-1 w-full rounded-[0.5rem] border border-dashed py-2.5 press"
          style={{ borderColor: "var(--color-line)", color: "var(--color-ink-700)" }}
        >
          <Plus className="size-3.5" />
          <span className="text-[0.6875rem] font-bold">Add another item</span>
        </button>

        {/* ══════ SECTION: HOW ══════ */}
        <SectionHeader icon={Wallet} label="Payment" />

        {/* Payment type selector — 2 options */}
        <div className="grid grid-cols-2 gap-1.5">
          <PaymentTypeCard
            active={paymentType === "credit"}
            onClick={() => setPaymentType("credit")}
            label="Credit"
            sublabel="Pay later"
          />
          <PaymentTypeCard
            active={paymentType === "paid"}
            onClick={() => {
              setPaymentType("paid");
              // Pre-fill first split with full amount if empty
              setPaymentSplits((prev) => {
                if (prev.length === 1 && !prev[0]!.amount) {
                  return [{ ...prev[0]!, amount: String(total) }];
                }
                return prev;
              });
            }}
            label="Pay Now"
            sublabel={formatCurrency(total)}
          />
        </div>

        {/* Payment splits (only for "paid") */}
        {paymentType === "paid" ? (
          <div className="flex flex-col gap-2">
            {paymentSplits.map((split, idx) => {
              return (
                <div
                  key={split.id}
                  className="rounded-[0.5rem] border p-2"
                  style={{ borderColor: "var(--color-line)", backgroundColor: "var(--color-paper)" }}
                >
                  {/* Split header */}
                  <div className="flex items-center justify-between mb-1.5">
                    <span className="text-[0.4375rem] font-bold uppercase tracking-wide" style={{ color: "var(--color-ink-500)" }}>
                      Payment {idx + 1}
                    </span>
                    {paymentSplits.length > 1 ? (
                      <button
                        type="button"
                        onClick={() => setPaymentSplits((prev) => prev.filter((s) => s.id !== split.id))}
                        className="flex items-center gap-0.5 text-[0.4375rem] font-semibold press"
                        style={{ color: "var(--color-stop)" }}
                      >
                        <Trash2 className="size-2.5" />
                      </button>
                    ) : null}
                  </div>

                  {/* Amount + mode row */}
                  <div className="flex gap-1.5">
                    {/* Amount */}
                    <div className="relative flex-1">
                      <IndianRupee
                        className="absolute left-2 top-1/2 -translate-y-1/2 size-3"
                        style={{ color: "var(--color-ink-500)" }}
                      />
                      <input
                        type="number"
                        step="any"
                        min="0"
                        value={split.amount}
                        onChange={(e) =>
                          setPaymentSplits((prev) =>
                            prev.map((s) => s.id === split.id ? { ...s, amount: e.target.value } : s),
                          )
                        }
                        placeholder="0"
                        className="w-full rounded-[0.375rem] border pl-6 pr-2 py-1.5 text-[0.6875rem] font-bold tabular-nums outline-none"
                        style={{ borderColor: "var(--color-line)", backgroundColor: "var(--color-paper)", color: "var(--color-ink-950)" }}
                      />
                    </div>
                  </div>

                  {/* Mode chips */}
                  <div className="grid grid-cols-4 gap-1 mt-1.5">
                    {PAYMENT_MODES.map((mode) => {
                      const active = split.mode === mode;
                      return (
                        <button
                          key={mode}
                          type="button"
                          onClick={() =>
                            setPaymentSplits((prev) =>
                              prev.map((s) => s.id === split.id ? { ...s, mode } : s),
                            )
                          }
                          className="rounded-[0.375rem] py-1 text-[0.5rem] font-bold transition-colors press"
                          style={
                            active
                              ? { backgroundColor: "var(--color-ink-950)", color: "#fff" }
                              : { backgroundColor: "var(--color-paper-2)", color: "var(--color-ink-700)", border: "1px solid var(--color-line)" }
                          }
                        >
                          {mode}
                        </button>
                      );
                    })}
                  </div>
                </div>
              );
            })}

            {/* Add split button */}
            <button
              type="button"
              onClick={() =>
                setPaymentSplits((prev) => [
                  ...prev,
                  { id: crypto.randomUUID(), amount: "", mode: "CASH" },
                ])
              }
              className="flex items-center justify-center gap-1 w-full rounded-[0.375rem] border border-dashed py-1.5 press"
              style={{ borderColor: "var(--color-line)", color: "var(--color-ink-700)" }}
            >
              <Plus className="size-3" />
              <span className="text-[0.5625rem] font-semibold">Add another payment</span>
            </button>

            {/* Payment summary */}
            {(() => {
              const totalPaid = paymentSplits.reduce((s, sp) => s + (Number(sp.amount) || 0), 0);
              const balance = total - totalPaid;
              const overpaid = totalPaid > total + 0.01;
              return (
                <div
                  className="rounded-[0.375rem] px-2.5 py-1.5 flex flex-col gap-0.5"
                  style={{
                    backgroundColor: overpaid
                      ? "color-mix(in srgb, var(--color-stop) 8%, transparent)"
                      : balance < -0.01
                        ? "color-mix(in srgb, var(--color-go) 6%, transparent)"
                        : "color-mix(in srgb, var(--color-go) 6%, transparent)",
                  }}
                >
                  <div className="flex items-center justify-between text-[0.5625rem]">
                    <span style={{ color: "var(--color-ink-500)" }}>Total paying</span>
                    <span className="font-bold tabular-nums" style={{ color: "var(--color-ink-950)" }}>
                      {formatCurrency(totalPaid)}
                    </span>
                  </div>
                  <div className="flex items-center justify-between text-[0.5625rem]">
                    <span style={{ color: "var(--color-ink-500)" }}>
                      {overpaid ? "Overpaid by" : balance > 0.01 ? "Balance due" : "Status"}
                    </span>
                    <span
                      className="font-bold tabular-nums"
                      style={{
                        color: overpaid
                          ? "var(--color-stop)"
                          : balance > 0.01
                            ? "var(--color-signal)"
                            : "var(--color-go)",
                      }}
                    >
                      {overpaid
                        ? formatCurrency(totalPaid - total)
                        : balance > 0.01
                          ? formatCurrency(balance)
                          : "Fully paid"}
                    </span>
                  </div>
                </div>
              );
            })()}
          </div>
        ) : (
          /* Credit info banner */
          <div
            className="flex items-center gap-2 rounded-[0.5rem] border px-3 py-2"
            style={{
              borderColor: "color-mix(in srgb, var(--color-signal) 30%, var(--color-line))",
              backgroundColor: "color-mix(in srgb, var(--color-signal) 6%, var(--color-paper))",
            }}
          >
            <span className="text-[0.5625rem]" style={{ color: "var(--color-ink-700)" }}>
              Sale will be created as <span className="font-bold" style={{ color: "var(--color-signal)" }}>unpaid</span>.
              Record payment later from the sale detail page.
            </span>
          </div>
        )}

        {/* Notes */}
        <div>
          <label className="text-[0.5625rem] font-semibold block mb-1" style={{ color: "var(--color-ink-500)" }}>
            Notes (optional)
          </label>
          <textarea
            value={notes}
            onChange={(e) => setNotes(e.target.value)}
            placeholder="e.g. Surplus cement sold to local contractor"
            rows={2}
            className="w-full rounded-[0.375rem] border px-2.5 py-2 text-[0.75rem] font-medium outline-none resize-none"
            style={{ borderColor: "var(--color-line)", backgroundColor: "var(--color-paper)", color: "var(--color-ink-950)" }}
          />
        </div>
      </form>

      {/* ══════ STICKY BOTTOM BAR: total + submit ══════ */}
      {/* Positioned above the mobile shell's bottom nav (56px + safe area) */}
      <div
        className="fixed left-0 right-0 z-30 border-t backdrop-blur-sm"
        style={{
          bottom: "calc(3.5rem + max(env(safe-area-inset-bottom), 0px))",
          backgroundColor: "color-mix(in srgb, var(--color-paper) 97%, transparent)",
          borderColor: "var(--color-line)",
        }}
      >
        <div className="max-w-md mx-auto px-3.5 py-2 flex items-center gap-3">
          {/* Total + payment status */}
          <div className="shrink-0">
            <p className="text-[0.4375rem] font-semibold uppercase tracking-wide" style={{ color: "var(--color-ink-500)" }}>
              {paymentType === "paid"
                ? `${formatCurrency(total)} · ${paymentSplits.length} ${paymentSplits.length === 1 ? "payment" : "payments"}`
                : `${formatCurrency(total)} · Credit`}
            </p>
            <p className="text-[0.875rem] font-bold tabular-nums" style={{ color: "var(--color-go)" }}>
              {paymentType === "paid"
                ? formatCurrency(paymentSplits.reduce((s, sp) => s + (Number(sp.amount) || 0), 0))
                : formatCurrency(total)
              }
            </p>
            {paymentType === "paid" ? (
              <p className="text-[0.4375rem]" style={{ color: "var(--color-ink-500)" }}>
                {(() => {
                  const paid = paymentSplits.reduce((s, sp) => s + (Number(sp.amount) || 0), 0);
                  const bal = total - paid;
                  if (paid > total + 0.01) return `overpaid ${formatCurrency(paid - total)}`;
                  if (bal > 0.01) return `${formatCurrency(bal)} on credit`;
                  return "fully paid";
                })()}
              </p>
            ) : null}
          </div>

          {/* Submit */}
          <button
            type="button"
            onClick={(e) => onSubmit(e as unknown as React.FormEvent)}
            disabled={submitting}
            className="flex-1 flex items-center justify-center gap-1.5 rounded-[0.5rem] py-2.5 text-[0.75rem] font-bold press disabled:opacity-50"
            style={{ backgroundColor: "var(--color-ink-950)", color: "#fff" }}
          >
            {submitting ? (
              <Loader2 className="size-4 animate-spin" />
            ) : (
              <>
                <Send className="size-3.5" />
                <span>Create Sale</span>
              </>
            )}
          </button>
        </div>
      </div>

      {/* ══════ SELECTOR MODAL ══════ */}
      {modal ? (
        <SelectorModal
          type={modal.type}
          title={
            modal.type === "customer" ? "Select Customer" :
            modal.type === "project" ? "Select Project" :
            modal.type === "material" ? "Select Material" :
            "Select Location"
          }
          items={
            modal.type === "customer" ? customers.map((c) => ({ id: c.id, label: c.name, sub: c.phone ?? undefined })) :
            modal.type === "project" ? [{ id: "", label: "No project linkage", sub: undefined }, ...projects.map((p) => ({ id: p.id, label: p.name }))] :
            modal.type === "material" ? materials.map((m) => ({ id: m.id, label: m.name, sub: `${m.code} · ${m.unit} · ${m.gstRate}% GST` })) :
            locations.map((l) => ({ id: l.id, label: l.name, sub: l.type.replace(/_/g, " ").toLowerCase() }))
          }
          selectedId={
            modal.type === "customer" ? customerId :
            modal.type === "project" ? projectId :
            modal.type === "material" ? (lines[modal.lineIndex ?? 0]?.materialId ?? "") :
            (lines[modal.lineIndex ?? 0]?.locationId ?? "")
          }
          onSelect={handleSelect}
          onClose={closeModal}
        />
      ) : null}
    </div>
  );
}

/* ═══════════════════════════════════════════════════════════
 * Section header — divides the form into purpose-driven sections
 * ═══════════════════════════════════════════════════════════ */
function SectionHeader({ icon: Icon, label }: { icon: React.ComponentType<{ className?: string; style?: React.CSSProperties }>; label: string }) {
  return (
    <div className="flex items-center gap-1.5 mt-1">
      <Icon className="size-3" style={{ color: "var(--color-steel)" }} />
      <span className="text-[0.5625rem] font-bold uppercase tracking-wide" style={{ color: "var(--color-steel)" }}>
        {label}
      </span>
      <div className="flex-1 h-px" style={{ backgroundColor: "var(--color-line)" }} />
    </div>
  );
}

/* ═══════════════════════════════════════════════════════════
 * Payment type card — 3-way selector (Credit / Full / Partial)
 * ═══════════════════════════════════════════════════════════ */
function PaymentTypeCard({
  active, onClick, label, sublabel,
}: {
  active: boolean;
  onClick: () => void;
  label: string;
  sublabel?: string;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      className="rounded-[0.5rem] border py-2 px-2 flex flex-col items-center press transition-colors"
      style={
        active
          ? { borderColor: "var(--color-ink-950)", backgroundColor: "var(--color-ink-950)", color: "#fff" }
          : { borderColor: "var(--color-line)", backgroundColor: "var(--color-paper)", color: "var(--color-ink-700)" }
      }
    >
      <span className="text-[0.6875rem] font-bold">{label}</span>
      {sublabel ? (
        <span
          className="text-[0.4375rem] font-semibold truncate w-full text-center"
          style={active ? { color: "color-mix(in srgb, #fff 70%, transparent)" } : { color: "var(--color-ink-500)" }}
        >
          {sublabel}
        </span>
      ) : null}
    </button>
  );
}

/* ═══════════════════════════════════════════════════════════
 * Selector card — prominent tappable card for customer/project
 * ═══════════════════════════════════════════════════════════ */
function SelectorCard({
  onClick, icon: Icon, label, value, subvalue, placeholder, required,
}: {
  onClick: () => void;
  icon: React.ComponentType<{ className?: string; style?: React.CSSProperties }>;
  label: string;
  value?: string;
  subvalue?: string | null;
  placeholder?: string;
  required?: boolean;
}) {
  const hasValue = !!value;
  return (
    <button
      type="button"
      onClick={onClick}
      className="w-full flex items-center gap-2.5 rounded-[0.625rem] border p-2.5 press text-left"
      style={{
        borderColor: hasValue ? "var(--color-line)" : "color-mix(in srgb, var(--color-signal) 30%, var(--color-line))",
        backgroundColor: "var(--color-paper)",
      }}
    >
      <span
        className="grid place-items-center size-8 rounded-[0.5rem] shrink-0"
        style={{ backgroundColor: hasValue ? "var(--color-paper-2)" : "color-mix(in srgb, var(--color-signal) 8%, transparent)" }}
      >
        <Icon
          className="size-4"
          style={{ color: hasValue ? "var(--color-ink-700)" : "var(--color-signal)" }}
        />
      </span>
      <div className="min-w-0 flex-1">
        <p className="text-[0.4375rem] font-semibold uppercase tracking-wide" style={{ color: "var(--color-ink-500)" }}>
          {label}{required ? <span style={{ color: "var(--color-stop)" }}> *</span> : null}
        </p>
        {hasValue ? (
          <>
            <p className="text-[0.75rem] font-bold truncate" style={{ color: "var(--color-ink-950)" }}>
              {value}
            </p>
            {subvalue ? (
              <p className="text-[0.5625rem] truncate" style={{ color: "var(--color-ink-500)" }}>
                {subvalue}
              </p>
            ) : null}
          </>
        ) : (
          <p className="text-[0.75rem] font-medium" style={{ color: "var(--color-ink-500)" }}>
            {placeholder ?? "Tap to select…"}
          </p>
        )}
      </div>
      <ChevronRight className="size-4 shrink-0" style={{ color: "var(--color-ink-500)" }} />
    </button>
  );
}

/* ═══════════════════════════════════════════════════════════
 * Selector row — compact tappable row for line item selectors
 * ═══════════════════════════════════════════════════════════ */
function SelectorRow({
  onClick, icon: Icon, label, value, subvalue, required, compact,
}: {
  onClick: () => void;
  icon: React.ComponentType<{ className?: string; style?: React.CSSProperties }>;
  label: string;
  value?: string;
  subvalue?: string;
  required?: boolean;
  compact?: boolean;
}) {
  const hasValue = !!value;
  return (
    <button
      type="button"
      onClick={onClick}
      className={`w-full flex items-center gap-1.5 rounded-[0.375rem] border press text-left ${compact ? "px-1.5 py-1" : "px-2 py-1.5"}`}
      style={{
        borderColor: hasValue ? "var(--color-line)" : "color-mix(in srgb, var(--color-signal) 30%, var(--color-line))",
        backgroundColor: hasValue ? "var(--color-paper)" : "color-mix(in srgb, var(--color-signal) 4%, var(--color-paper))",
      }}
    >
      <Icon className={`shrink-0 ${compact ? "size-2.5" : "size-3"}`} style={{ color: hasValue ? "var(--color-ink-700)" : "var(--color-signal)" }} />
      <div className="min-w-0 flex-1">
        <span className={`font-semibold uppercase ${compact ? "text-[0.375rem]" : "text-[0.4375rem]"}`} style={{ color: "var(--color-ink-500)" }}>
          {label}{required ? <span style={{ color: "var(--color-stop)" }}> *</span> : null}
        </span>
        {hasValue ? (
          <p className={`font-bold truncate ${compact ? "text-[0.5625rem]" : "text-[0.6875rem]"}`} style={{ color: "var(--color-ink-950)" }}>
            {value}{subvalue ? <span className="font-normal" style={{ color: "var(--color-ink-500)" }}> · {subvalue}</span> : null}
          </p>
        ) : (
          <p className={`text-[0.5625rem]`} style={{ color: "var(--color-ink-500)" }}>Tap to select…</p>
        )}
      </div>
      <ChevronRight className={`shrink-0 ${compact ? "size-2.5" : "size-3"}`} style={{ color: "var(--color-ink-500)" }} />
    </button>
  );
}

/* ═══════════════════════════════════════════════════════════
 * Selector modal — bottom-sheet with searchable list
 * ═══════════════════════════════════════════════════════════ */
function SelectorModal({
  title, items, selectedId, onSelect, onClose,
}: {
  type: "customer" | "project" | "material" | "location";
  title: string;
  items: { id: string; label: string; sub?: string }[];
  selectedId: string;
  onSelect: (id: string) => void;
  onClose: () => void;
}) {
  const [query, setQuery] = useState("");

  const filtered = useMemo(() => {
    if (!query.trim()) return items;
    const q = query.toLowerCase();
    return items.filter(
      (item) =>
        item.label.toLowerCase().includes(q) ||
        (item.sub?.toLowerCase().includes(q) ?? false),
    );
  }, [items, query]);

  return (
    <div
      className="fixed inset-0 z-50 flex items-end justify-center"
      style={{ backgroundColor: "color-mix(in srgb, var(--color-ink-950) 50%, transparent)" }}
      onClick={onClose}
    >
      <div
        className="w-full max-w-md rounded-t-[0.75rem] flex flex-col"
        style={{ backgroundColor: "var(--color-paper)", maxHeight: "80vh" }}
        onClick={(e) => e.stopPropagation()}
      >
        {/* Header */}
        <div className="flex items-center justify-between p-3 border-b" style={{ borderColor: "var(--color-line)" }}>
          <p className="text-[0.75rem] font-bold" style={{ color: "var(--color-ink-950)" }}>{title}</p>
          <button onClick={onClose} className="press">
            <X className="size-4" style={{ color: "var(--color-ink-500)" }} />
          </button>
        </div>

        {/* Search */}
        <div className="p-2 border-b" style={{ borderColor: "var(--color-line)" }}>
          <div className="relative">
            <Search
              className="absolute left-2.5 top-1/2 -translate-y-1/2 size-3.5"
              style={{ color: "var(--color-ink-500)" }}
            />
            <input
              type="search"
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              placeholder="Search…"
              autoFocus
              className="w-full h-9 rounded-[0.5rem] border pl-8 pr-2 text-[0.75rem] outline-none"
              style={{ borderColor: "var(--color-line)", backgroundColor: "var(--color-paper-2)", color: "var(--color-ink-950)" }}
            />
          </div>
        </div>

        {/* List */}
        <div className="flex-1 overflow-y-auto overscroll-contain">
          {filtered.length === 0 ? (
            <div className="flex flex-col items-center justify-center py-8 text-center">
              <Search className="size-5 mb-1.5" style={{ color: "var(--color-ink-300)" }} />
              <p className="text-[0.6875rem] font-semibold" style={{ color: "var(--color-ink-500)" }}>No results</p>
            </div>
          ) : (
            filtered.map((item, i) => {
              const isSelected = item.id === selectedId;
              return (
                <button
                  key={item.id || i}
                  onClick={() => onSelect(item.id)}
                  className="w-full flex items-center gap-2 px-3 py-2.5 press text-left"
                  style={{
                    backgroundColor: isSelected ? "color-mix(in srgb, var(--color-ink-950) 5%, transparent)" : "transparent",
                    borderBottom: "1px solid var(--color-line)",
                  }}
                >
                  <div className="min-w-0 flex-1">
                    <p
                      className="text-[0.75rem] font-bold truncate"
                      style={{ color: isSelected ? "var(--color-ink-950)" : "var(--color-ink-900)" }}
                    >
                      {item.label}
                    </p>
                    {item.sub ? (
                      <p className="text-[0.5625rem] truncate" style={{ color: "var(--color-ink-500)" }}>
                        {item.sub}
                      </p>
                    ) : null}
                  </div>
                  {isSelected ? (
                    <CheckCircle2 className="size-4 shrink-0" style={{ color: "var(--color-go)" }} />
                  ) : null}
                </button>
              );
            })
          )}
        </div>
      </div>
    </div>
  );
}

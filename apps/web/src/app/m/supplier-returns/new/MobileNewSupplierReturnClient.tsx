"use client";

import { useState, useMemo } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import {
  Plus, Trash2, Loader2, ChevronLeft, CheckCircle2,
  Search, X, ChevronRight, Truck, Package, MapPin, FileText, Send, WifiOff,
} from "lucide-react";
import { formatCurrency } from "@/lib/utils";
import { toast } from "sonner";
import { useOfflineQueue } from "@/lib/offline/use-offline-queue";

interface SupplierItem { id: string; name: string; }
interface LocationItem { id: string; name: string; type: string; }
interface MaterialItem { id: string; name: string; code: string; unit: string; }
interface PurchaseOrderItem { id: string; poNumber: string; supplierId: string; }

interface ReturnLine {
  materialId: string;
  qty: string;
  unitCost: string;
  reason: string;
}

const REASONS = ["Defective", "Excess", "Wrong item", "Damaged", "Other"] as const;

export default function MobileNewSupplierReturnClient({
  suppliers,
  locations,
  materials,
  purchaseOrders,
}: {
  suppliers: SupplierItem[];
  locations: LocationItem[];
  materials: MaterialItem[];
  purchaseOrders: PurchaseOrderItem[];
}) {
  const router = useRouter();
  const { online, enqueue } = useOfflineQueue();
  const [submitting, setSubmitting] = useState(false);

  const [supplierId, setSupplierId] = useState("");
  const [locationId, setLocationId] = useState("");
  const [purchaseOrderId, setPurchaseOrderId] = useState("");
  const [notes, setNotes] = useState("");
  const [lines, setLines] = useState<ReturnLine[]>(
    [{ materialId: materials[0]?.id ?? "", qty: "", unitCost: "", reason: "" }],
  );

  const [success, setSuccess] = useState<{ returnNumber: string; total: number } | null>(null);

  // POs filtered to the selected supplier
  const availablePOs = useMemo(() => {
    if (!supplierId) return [];
    return purchaseOrders.filter((p) => p.supplierId === supplierId);
  }, [purchaseOrders, supplierId]);

  const handleAddLine = () => {
    setLines([...lines, { materialId: materials[0]?.id ?? "", qty: "", unitCost: "", reason: "" }]);
  };

  const handleRemoveLine = (index: number) => {
    if (lines.length === 1) return;
    setLines(lines.filter((_, i) => i !== index));
  };

  const handleLineChange = (index: number, field: keyof ReturnLine, val: string) => {
    const updated = [...lines];
    updated[index] = { ...updated[index]!, [field]: val };
    setLines(updated);
  };

  const total = lines.reduce((s, l) => s + (Number(l.qty) || 0) * (Number(l.unitCost) || 0), 0);

  const selectedSupplier = suppliers.find((s) => s.id === supplierId);
  const selectedLocation = locations.find((l) => l.id === locationId);
  const selectedPO = availablePOs.find((p) => p.id === purchaseOrderId);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!supplierId) { toast.error("Please select a supplier"); return; }
    if (!locationId) { toast.error("Please select a source location"); return; }
    const validLines = lines.filter((l) => l.materialId && Number(l.qty) > 0 && Number(l.unitCost) >= 0);
    if (validLines.length === 0) { toast.error("Add at least one line item with qty and cost"); return; }

    setSubmitting(true);
    try {
      const payload = {
        supplierId,
        purchaseOrderId: purchaseOrderId || null,
        locationId,
        notes: notes || null,
        lines: validLines.map((l) => ({
          materialId: l.materialId,
          qty: Number(l.qty),
          unitCost: Number(l.unitCost),
          reason: l.reason || null,
        })),
      };

      // Offline: queue for later sync
      if (!online) {
        await enqueue("supplier-return", payload);
        if (typeof navigator !== "undefined" && navigator.vibrate) {
          navigator.vibrate(10);
        }
        toast.success("Supplier return queued offline", {
          description: "Will sync when back online",
        });
        setSuccess({ returnNumber: "QUEUED", total });
        return;
      }

      const res = await fetch("/api/supplier-returns", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(payload),
      });
      if (!res.ok) {
        const err = await res.json().catch(() => ({}));
        throw new Error(err.error ?? "Failed to create supplier return");
      }
      const data = await res.json();
      setSuccess({ returnNumber: data.returnNumber, total });
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Failed to create supplier return");
    } finally {
      setSubmitting(false);
    }
  };

  /* ── Success state ── */
  if (success) {
    const isQueued = success.returnNumber === "QUEUED";
    return (
      <div className="flex flex-col items-center justify-center py-12 px-4 text-center">
        <div
          className="grid place-items-center size-14 rounded-full mb-3"
          style={{
            backgroundColor: isQueued
              ? "color-mix(in srgb, var(--color-signal) 12%, transparent)"
              : "color-mix(in srgb, var(--color-go) 12%, transparent)",
          }}
        >
          {isQueued ? (
            <WifiOff className="size-7" style={{ color: "var(--color-signal)" }} />
          ) : (
            <CheckCircle2 className="size-7" style={{ color: "var(--color-go)" }} />
          )}
        </div>
        <p className="text-[0.875rem] font-bold mb-1" style={{ color: "var(--color-ink-950)" }}>
          {isQueued ? "Return Queued" : "Return Created"}
        </p>
        {isQueued ? (
          <p className="text-[0.6875rem] mb-4" style={{ color: "var(--color-ink-500)" }}>
            Will sync when back online
          </p>
        ) : (
          <>
            <p className="text-[0.6875rem] font-mono mb-3" style={{ color: "var(--color-ink-500)" }}>{success.returnNumber}</p>
            <p className="text-[1rem] font-bold tabular-nums mb-4" style={{ color: "var(--color-go)" }}>
              {formatCurrency(success.total)}
            </p>
            <p className="text-[0.5625rem] mb-4" style={{ color: "var(--color-ink-500)" }}>
              Return is in <span className="font-bold" style={{ color: "var(--color-ink-700)" }}>DRAFT</span>. Submit for processing from the detail page.
            </p>
          </>
        )}
        <div className="flex gap-2">
          {!isQueued && (
            <button
              onClick={() => {
                router.refresh();
                router.push("/m/supplier-returns");
              }}
              className="rounded-[0.5rem] px-4 py-2 text-[0.6875rem] font-bold press"
              style={{ backgroundColor: "var(--color-ink-950)", color: "#fff" }}
            >
              View All Returns
            </button>
          )}
          <button
            onClick={() => {
              setSuccess(null);
              setLines([{ materialId: materials[0]?.id ?? "", qty: "", unitCost: "", reason: "" }]);
              setNotes("");
              setPurchaseOrderId("");
            }}
            className="rounded-[0.5rem] px-4 py-2 text-[0.6875rem] font-bold border press"
            style={{ borderColor: "var(--color-line)", backgroundColor: "var(--color-paper)", color: "var(--color-ink-950)" }}
          >
            Create Another
          </button>
        </div>
      </div>
    );
  }

  /* ── Empty-data guard — with action buttons to create prerequisites ── */
  if (suppliers.length === 0 || materials.length === 0 || locations.length === 0) {
    return (
      <div className="flex flex-col items-center justify-center py-12 px-4 text-center">
        <p className="text-[0.875rem] font-bold mb-1" style={{ color: "var(--color-ink-950)" }}>Missing master data</p>
        <p className="text-[0.6875rem] mb-4" style={{ color: "var(--color-ink-500)" }}>
          You need these before creating a supplier return:
        </p>
        <div className="flex flex-col gap-2 w-full max-w-xs">
          {suppliers.length === 0 && (
            <Link href="/m/suppliers/new" className="flex items-center justify-center gap-1.5 rounded-[0.5rem] border-2 border-dashed py-2.5 text-[0.6875rem] font-bold press" style={{ borderColor: "var(--color-signal)", color: "var(--color-signal-dark)" }}>
              <Plus className="size-3.5" /> Add a Supplier
            </Link>
          )}
          {materials.length === 0 && (
            <Link href="/m/materials/new" className="flex items-center justify-center gap-1.5 rounded-[0.5rem] border-2 border-dashed py-2.5 text-[0.6875rem] font-bold press" style={{ borderColor: "var(--color-signal)", color: "var(--color-signal-dark)" }}>
              <Plus className="size-3.5" /> Add a Material
            </Link>
          )}
          {locations.length === 0 && (
            <Link href="/m/stock-locations/new" className="flex items-center justify-center gap-1.5 rounded-[0.5rem] border-2 border-dashed py-2.5 text-[0.6875rem] font-bold press" style={{ borderColor: "var(--color-signal)", color: "var(--color-signal-dark)" }}>
              <Plus className="size-3.5" /> Add a Stock Location
            </Link>
          )}
        </div>
        <Link href="/m/supplier-returns" className="mt-4 text-[0.6875rem] font-semibold press" style={{ color: "var(--color-ink-500)" }}>
          Back to Returns
        </Link>
      </div>
    );
  }

  return (
    <ReturnForm
      suppliers={suppliers}
      locations={locations}
      materials={materials}
      availablePOs={availablePOs}
      supplierId={supplierId}
      setSupplierId={setSupplierId}
      locationId={locationId}
      setLocationId={setLocationId}
      purchaseOrderId={purchaseOrderId}
      setPurchaseOrderId={setPurchaseOrderId}
      notes={notes}
      setNotes={setNotes}
      lines={lines}
      onAddLine={handleAddLine}
      onRemoveLine={handleRemoveLine}
      onLineChange={handleLineChange}
      onSubmit={handleSubmit}
      submitting={submitting}
      online={online}
      total={total}
      selectedSupplier={selectedSupplier}
      selectedLocation={selectedLocation}
      selectedPO={selectedPO}
    />
  );
}

/* ═══════════════════════════════════════════════════════════
 * Main form component
 * ═══════════════════════════════════════════════════════════ */
function ReturnForm({
  suppliers, locations, materials, availablePOs,
  supplierId, setSupplierId,
  locationId, setLocationId,
  purchaseOrderId, setPurchaseOrderId,
  notes, setNotes,
  lines,
  onAddLine, onRemoveLine, onLineChange,
  onSubmit, submitting,
  online,
  total,
  selectedSupplier, selectedLocation, selectedPO,
}: {
  suppliers: SupplierItem[];
  locations: LocationItem[];
  materials: MaterialItem[];
  availablePOs: PurchaseOrderItem[];
  supplierId: string;
  setSupplierId: (v: string) => void;
  locationId: string;
  setLocationId: (v: string) => void;
  purchaseOrderId: string;
  setPurchaseOrderId: (v: string) => void;
  notes: string;
  setNotes: (v: string) => void;
  lines: ReturnLine[];
  onAddLine: () => void;
  onRemoveLine: (i: number) => void;
  onLineChange: (i: number, field: keyof ReturnLine, val: string) => void;
  onSubmit: (e: React.FormEvent) => void;
  submitting: boolean;
  online: boolean;
  total: number;
  selectedSupplier?: SupplierItem;
  selectedLocation?: LocationItem;
  selectedPO?: PurchaseOrderItem;
}) {
  const [modal, setModal] = useState<{
    type: "supplier" | "location" | "po" | "material";
    lineIndex?: number;
  } | null>(null);

  const closeModal = () => setModal(null);

  const handleSelect = (id: string) => {
    if (!modal) return;
    if (modal.type === "supplier") {
      setSupplierId(id);
      setPurchaseOrderId(""); // reset PO when supplier changes
    } else if (modal.type === "location") {
      setLocationId(id);
    } else if (modal.type === "po") {
      setPurchaseOrderId(id);
    } else if (modal.type === "material" && modal.lineIndex !== undefined) {
      onLineChange(modal.lineIndex, "materialId", id);
    }
    closeModal();
  };

  return (
    <div className="pb-32">
      {/* ── Header ── */}
      <div className="flex items-center gap-2 mb-3">
        <Link href="/m/supplier-returns" className="shrink-0">
          <ChevronLeft className="size-5" style={{ color: "var(--color-ink-700)" }} />
        </Link>
        <div className="flex-1 min-w-0">
          <p className="text-[0.875rem] font-bold" style={{ color: "var(--color-ink-950)" }}>
            New Supplier Return
          </p>
        </div>
        <span
          className="flex items-center gap-0.5 text-[0.5rem] font-bold uppercase tracking-wide px-2 py-0.5 rounded-full shrink-0"
          style={{ color: "var(--color-stop)", backgroundColor: "color-mix(in srgb, var(--color-stop) 12%, transparent)" }}
        >
          <Truck className="size-2.5" />
          Return
        </span>
      </div>

      <form onSubmit={onSubmit} className="flex flex-col gap-3">
        {/* ══════ SECTION: WHO ══════ */}
        <SectionHeader icon={Truck} label="Supplier" />

        <SelectorCard
          onClick={() => setModal({ type: "supplier" })}
          icon={Truck}
          label="Supplier"
          value={selectedSupplier?.name}
          required
        />

        {/* Optional PO linkage */}
        {supplierId && availablePOs.length > 0 ? (
          <SelectorCard
            onClick={() => setModal({ type: "po" })}
            icon={FileText}
            label="Original PO (optional)"
            value={purchaseOrderId ? selectedPO?.poNumber : undefined}
            placeholder="Return without PO linkage"
          />
        ) : null}

        {/* ══════ SECTION: FROM ══════ */}
        <SectionHeader icon={MapPin} label="Source Location" />

        <SelectorCard
          onClick={() => setModal({ type: "location" })}
          icon={MapPin}
          label="From Location"
          value={selectedLocation?.name}
          subvalue={selectedLocation?.type.replace(/_/g, " ").toLowerCase()}
          required
        />

        {/* ══════ SECTION: WHAT ══════ */}
        <SectionHeader icon={Package} label="Return Items" />

        <div className="flex flex-col gap-2">
          {lines.map((line, idx) => {
            const mat = materials.find((m) => m.id === line.materialId);
            const lineTotal = (Number(line.qty) || 0) * (Number(line.unitCost) || 0);
            return (
              <div
                key={idx}
                className="rounded-[0.625rem] border overflow-hidden flex flex-col"
                style={{ borderColor: "var(--color-line)", backgroundColor: "var(--color-paper)" }}
              >
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

                <div className="p-1.5 flex flex-col gap-1.5">
                  <SelectorRow
                    onClick={() => setModal({ type: "material", lineIndex: idx })}
                    icon={Package}
                    label="Material"
                    value={mat ? mat.name : undefined}
                    subvalue={mat ? `${mat.code} · ${mat.unit}` : undefined}
                    required
                    compact
                  />

                  <div className="grid grid-cols-2 gap-1.5 mt-0.5">
                    <div>
                      <label className="text-[0.375rem] font-semibold uppercase block mb-0.5" style={{ color: "var(--color-ink-500)" }}>
                        Qty{mat ? ` (${mat.unit})` : ""}
                      </label>
                      <input
                        type="text" inputMode="decimal"
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
                        Unit Cost
                      </label>
                      <input
                        type="text" inputMode="decimal"
                        step="any"
                        min="0"
                        value={line.unitCost}
                        onChange={(e) => onLineChange(idx, "unitCost", e.target.value)}
                        placeholder="0"
                        className="w-full rounded-[0.375rem] border px-2 py-1.5 text-[0.6875rem] font-bold tabular-nums outline-none"
                        style={{ borderColor: "var(--color-line)", backgroundColor: "var(--color-paper)", color: "var(--color-ink-950)" }}
                      />
                    </div>
                  </div>

                  {/* Reason selector */}
                  <div>
                    <label className="text-[0.375rem] font-semibold uppercase block mb-0.5" style={{ color: "var(--color-ink-500)" }}>
                      Reason
                    </label>
                    <div className="flex flex-wrap gap-1">
                      {REASONS.map((r) => {
                        const active = line.reason === r;
                        return (
                          <button
                            key={r}
                            type="button"
                            onClick={() => onLineChange(idx, "reason", active ? "" : r)}
                            className="rounded-[0.375rem] px-1.5 py-0.5 text-[0.4375rem] font-semibold press transition-colors"
                            style={
                              active
                                ? { backgroundColor: "var(--color-ink-950)", color: "#fff" }
                                : { backgroundColor: "var(--color-paper-2)", color: "var(--color-ink-700)", border: "1px solid var(--color-line)" }
                            }
                          >
                            {r}
                          </button>
                        );
                      })}
                    </div>
                  </div>

                  <div
                    className="flex items-center justify-between rounded-[0.375rem] px-1.5 py-1 mt-0.5"
                    style={{ backgroundColor: "color-mix(in srgb, var(--color-stop) 6%, transparent)" }}
                  >
                    <span className="text-[0.4375rem] font-semibold uppercase" style={{ color: "var(--color-ink-500)" }}>
                      Credit
                    </span>
                    <span className="text-[0.625rem] font-bold tabular-nums" style={{ color: "var(--color-ink-950)" }}>
                      {formatCurrency(lineTotal)}
                    </span>
                  </div>
                </div>
              </div>
            );
          })}
        </div>

        <button
          type="button"
          onClick={onAddLine}
          className="flex items-center justify-center gap-1 w-full rounded-[0.5rem] border border-dashed py-2.5 press"
          style={{ borderColor: "var(--color-line)", color: "var(--color-ink-700)" }}
        >
          <Plus className="size-3.5" />
          <span className="text-[0.6875rem] font-bold">Add another item</span>
        </button>

        {/* Notes */}
        <div>
          <label className="text-[0.5625rem] font-semibold block mb-1" style={{ color: "var(--color-ink-500)" }}>
            Notes (optional)
          </label>
          <textarea
            value={notes}
            onChange={(e) => setNotes(e.target.value)}
            placeholder="e.g. Goods damaged in transit"
            rows={2}
            className="w-full rounded-[0.375rem] border px-2.5 py-2 text-[0.75rem] font-medium outline-none resize-none"
            style={{ borderColor: "var(--color-line)", backgroundColor: "var(--color-paper)", color: "var(--color-ink-950)" }}
          />
        </div>
      </form>

      {/* ══════ STICKY BOTTOM BAR ══════ */}
      <div
        className="fixed left-0 right-0 z-30 border-t backdrop-blur-sm"
        style={{
          bottom: "calc(3.5rem + max(env(safe-area-inset-bottom), 0px))",
          backgroundColor: "color-mix(in srgb, var(--color-paper) 97%, transparent)",
          borderColor: "var(--color-line)",
        }}
      >
        <div className="max-w-md mx-auto px-3.5 py-2 flex items-center gap-3">
          <div className="shrink-0">
            <p className="text-[0.4375rem] font-semibold uppercase tracking-wide" style={{ color: "var(--color-ink-500)" }}>
              Total Credit
            </p>
            <p className="text-[0.875rem] font-bold tabular-nums" style={{ color: "var(--color-stop)" }}>
              {formatCurrency(total)}
            </p>
          </div>
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
                {online ? <Send className="size-3.5" /> : <WifiOff className="size-3.5" />}
                <span>{online ? "Create Return (Draft)" : "Queue Return (Offline)"}</span>
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
            modal.type === "supplier" ? "Select Supplier" :
            modal.type === "location" ? "Select Location" :
            modal.type === "po" ? "Select Purchase Order" :
            "Select Material"
          }
          items={
            modal.type === "supplier" ? suppliers.map((s) => ({ id: s.id, label: s.name })) :
            modal.type === "location" ? locations.map((l) => ({ id: l.id, label: l.name, sub: l.type.replace(/_/g, " ").toLowerCase() })) :
            modal.type === "po" ? [{ id: "", label: "No PO linkage", sub: undefined }, ...availablePOs.map((p) => ({ id: p.id, label: p.poNumber }))] :
            materials.map((m) => ({ id: m.id, label: m.name, sub: `${m.code} · ${m.unit}` }))
          }
          selectedId={
            modal.type === "supplier" ? supplierId :
            modal.type === "location" ? locationId :
            modal.type === "po" ? purchaseOrderId :
            (lines[modal.lineIndex ?? 0]?.materialId ?? "")
          }
          onSelect={handleSelect}
          onClose={closeModal}
        />
      ) : null}
    </div>
  );
}

/* ═══════════════════════════════════════════════════════════
 * Section header
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
 * Selector card
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
        <Icon className="size-4" style={{ color: hasValue ? "var(--color-ink-700)" : "var(--color-signal)" }} />
      </span>
      <div className="min-w-0 flex-1">
        <p className="text-[0.4375rem] font-semibold uppercase tracking-wide" style={{ color: "var(--color-ink-500)" }}>
          {label}{required ? <span style={{ color: "var(--color-stop)" }}> *</span> : null}
        </p>
        {hasValue ? (
          <>
            <p className="text-[0.75rem] font-bold truncate" style={{ color: "var(--color-ink-950)" }}>{value}</p>
            {subvalue ? <p className="text-[0.5625rem] truncate" style={{ color: "var(--color-ink-500)" }}>{subvalue}</p> : null}
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
 * Selector row
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
 * Selector modal
 * ═══════════════════════════════════════════════════════════ */
function SelectorModal({
  type: _type, title, items, selectedId, onSelect, onClose,
}: {
  type: "supplier" | "location" | "po" | "material";
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
        <div className="flex items-center justify-between p-3 border-b" style={{ borderColor: "var(--color-line)" }}>
          <p className="text-[0.75rem] font-bold" style={{ color: "var(--color-ink-950)" }}>{title}</p>
          <button onClick={onClose} className="press">
            <X className="size-4" style={{ color: "var(--color-ink-500)" }} />
          </button>
        </div>

        <div className="p-2 border-b" style={{ borderColor: "var(--color-line)" }}>
          <div className="relative">
            <Search className="absolute left-2.5 top-1/2 -translate-y-1/2 size-3.5" style={{ color: "var(--color-ink-500)" }} />
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
                    <p className="text-[0.75rem] font-bold truncate" style={{ color: isSelected ? "var(--color-ink-950)" : "var(--color-ink-900)" }}>
                      {item.label}
                    </p>
                    {item.sub ? <p className="text-[0.5625rem] truncate" style={{ color: "var(--color-ink-500)" }}>{item.sub}</p> : null}
                  </div>
                  {isSelected ? <CheckCircle2 className="size-4 shrink-0" style={{ color: "var(--color-go)" }} /> : null}
                </button>
              );
            })
          )}
        </div>
      </div>
    </div>
  );
}

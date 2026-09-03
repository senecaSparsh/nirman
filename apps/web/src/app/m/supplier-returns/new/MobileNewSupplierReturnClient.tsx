"use client";

import { useState, useMemo, useEffect } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import {
  Plus, Trash2, Loader2, CheckCircle2,
  Search, X, ChevronRight, Truck, Package, MapPin, FileText, Send, WifiOff,
} from "lucide-react";
import { formatCurrency } from "@/lib/utils";
import { toast } from "sonner";
import { useLongPressNav } from "@/lib/use-long-press-nav";
import { useOfflineQueue } from "@/lib/offline/use-offline-queue";
import { useDrafts } from "@/lib/offline/use-drafts";
import { DraftBanner } from "@/components/mobile/draft-banner";
import { MobileNewSupplierDialog } from "@/app/m/suppliers/MobileNewSupplierDialog";
import { MobileNewMaterialDialog } from "@/app/m/materials/MobileNewMaterialDialog";
import { MobileNewStockLocationDialog } from "@/app/m/stock-locations/MobileNewStockLocationDialog";
import { VehicleCapture, type VehicleData } from "@/components/mobile/vehicle-capture";

interface SupplierItem { id: string; name: string; }
interface LocationItem { id: string; name: string; type: string; }
interface MaterialItem { id: string; name: string; code: string; unit: string; }
interface PurchaseOrderItem { id: string; poNumber: string; supplierId: string; }
interface CategoryItem { id: string; name: string; unit: string; }

interface ReturnLine {
  materialId: string;
  qty: string;
  unitCost: string;
  reason: string;
}

const REASONS = ["Defective", "Excess", "Wrong item", "Damaged", "Other"] as const;

interface SupplierReturnDraft {
  supplierId: string;
  locationId: string;
  purchaseOrderId: string;
  notes: string;
  lines: { materialId: string; qty: string; unitCost: string; reason: string }[];
}

export default function MobileNewSupplierReturnClient({
  suppliers: initialSuppliers,
  locations: initialLocations,
  materials: initialMaterials,
  purchaseOrders,
  categories,
  onClose,
  onCreated,
}: {
  suppliers: SupplierItem[];
  locations: LocationItem[];
  materials: MaterialItem[];
  purchaseOrders: PurchaseOrderItem[];
  categories: CategoryItem[];
  onClose?: () => void;
  onCreated?: (id: string) => void;
}) {
  const router = useRouter();
  const { online, enqueue } = useOfflineQueue();
  const [submitting, setSubmitting] = useState(false);
  const { draft, hasDraft, draftUpdatedAt, saveDraft, clearDraft } = useDrafts<SupplierReturnDraft>("supplier-return", "supplier-return-new");
  const [draftRestored, setDraftRestored] = useState(false);

  // Mutable copies so inline-created entities appear without a full reload
  const [suppliers, setSuppliers] = useState<SupplierItem[]>(initialSuppliers);
  const [locations, setLocations] = useState<LocationItem[]>(initialLocations);
  const [materials, setMaterials] = useState<MaterialItem[]>(initialMaterials);
  const [guardDialog, setGuardDialog] = useState<"supplier" | "material" | "location" | null>(null);

  const [supplierId, setSupplierId] = useState("");
  const [locationId, setLocationId] = useState("");
  const [purchaseOrderId, setPurchaseOrderId] = useState("");
  const [notes, setNotes] = useState("");
  const [lines, setLines] = useState<ReturnLine[]>(
    [{ materialId: materials[0]?.id ?? "", qty: "", unitCost: "", reason: "" }],
  );
  // Vehicle — how returned goods are transported back to supplier
  const [vehicle, setVehicle] = useState<VehicleData>({ vehicleNumber: "", vehicleType: "" });

  const [success, setSuccess] = useState<{ returnId?: string; returnNumber: string; total: number } | null>(null);

  // ── Draft auto-save (IndexedDB) ──
  useEffect(() => {
    if (success) return;
    saveDraft({ supplierId, locationId, purchaseOrderId, notes, lines });
  }, [supplierId, locationId, purchaseOrderId, notes, lines, success, saveDraft]);

  // ── Restore draft on mount ──
  useEffect(() => {
    if (draft && !draftRestored && hasDraft) {
      if (draft.supplierId) setSupplierId(draft.supplierId);
      if (draft.locationId) setLocationId(draft.locationId);
      if (draft.purchaseOrderId) setPurchaseOrderId(draft.purchaseOrderId);
      if (draft.notes) setNotes(draft.notes);
      if (draft.lines?.length > 0) setLines(draft.lines);
      setDraftRestored(true);
    }
  }, [draft, hasDraft, draftRestored]);

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
        // Vehicle / transport — how returned goods are sent back
        vehicleNumber: vehicle.vehicleNumber.trim() || undefined,
        vehicleType: vehicle.vehicleType || undefined,
        vehiclePhotoUrl: vehicle.photoUrl,
        driverName: vehicle.driverName?.trim() || undefined,
        driverPhone: vehicle.driverPhone?.trim() || undefined,
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
        setSuccess({ returnId: "", returnNumber: "QUEUED", total });
        clearDraft();
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
      setSuccess({ returnId: data.id, returnNumber: data.returnNumber, total });
      clearDraft();
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
        <p className="text-m-section font-bold mb-1" style={{ color: "var(--color-ink-950)" }}>
          {isQueued ? "Return Queued" : "Return Created"}
        </p>
        {isQueued ? (
          <p className="text-m-body mb-4" style={{ color: "var(--color-ink-700)" }}>
            Will sync when back online
          </p>
        ) : (
          <>
            <p className="text-m-caption font-mono mb-3" style={{ color: "var(--color-ink-700)" }}>{success.returnNumber}</p>
            <p className="text-m-section font-bold tabular-nums mb-4" style={{ color: "var(--color-go)" }}>
              {formatCurrency(success.total)}
            </p>
            <p className="text-m-caption mb-4" style={{ color: "var(--color-ink-700)" }}>
              Return is in <span className="font-bold" style={{ color: "var(--color-ink-700)" }}>DRAFT</span>. Submit for processing from the detail page.
            </p>
          </>
        )}
        <div className="flex flex-col gap-3">
          {!isQueued && success.returnId ? (
            <button
              onClick={() => {
                if (onCreated) {
                  onCreated(success.returnId ?? "");
                } else {
                  router.push(`/m/supplier-returns/${success.returnId}`);
                }
              }}
              className="rounded-[0.5rem] px-4 py-2 text-m-body font-bold text-m-body press"
              style={{ backgroundColor: "var(--color-ink-950)", color: "var(--color-paper)" }}
            >
              View {success.returnNumber}
            </button>
          ) : null}
          <button
            onClick={() => {
              if (onCreated) {
                onCreated("");
              } else {
                router.refresh();
                router.push("/m/procurement?tab=returns");
              }
            }}
            className="rounded-[0.5rem] px-4 py-2 text-m-body font-bold text-m-body press"
            style={{ backgroundColor: "var(--color-ink-950)", color: "var(--color-paper)" }}
          >
            View All Returns
          </button>
          <button
            onClick={() => {
              setSuccess(null);
              setLines([{ materialId: materials[0]?.id ?? "", qty: "", unitCost: "", reason: "" }]);
              setNotes("");
              setPurchaseOrderId("");
              setVehicle({ vehicleNumber: "", vehicleType: "" });
            }}
            className="rounded-[0.5rem] px-4 py-2 text-m-body font-bold border text-m-body press"
            style={{ borderColor: "var(--color-line)", backgroundColor: "transparent", color: "var(--color-ink-950)" }}
          >
            Create Another
          </button>
        </div>
      </div>
    );
  }

  /* ── Empty-data guard — with inline dialogs to create prerequisites ── */
  if (suppliers.length === 0 || materials.length === 0 || locations.length === 0) {
    return (
      <div className="flex flex-col items-center justify-center py-12 px-4 text-center">
        <p className="text-m-section font-bold mb-1" style={{ color: "var(--color-ink-950)" }}>Missing master data</p>
        <p className="text-m-body mb-4" style={{ color: "var(--color-ink-700)" }}>
          You need these before creating a supplier return:
        </p>
        <div className="flex flex-col gap-3 w-full max-w-xs">
          {suppliers.length === 0 && (
            <button
              onClick={() => setGuardDialog("supplier")}
              className="flex items-center justify-center gap-1.5 rounded-[0.5rem] border-2 border-dashed py-2.5 text-m-body font-bold text-m-body press"
              style={{ borderColor: "var(--color-signal)", color: "var(--color-signal-dark)" }}
            >
              <Plus className="size-3.5" /> Add a Supplier
            </button>
          )}
          {materials.length === 0 && (
            <button
              onClick={() => setGuardDialog("material")}
              className="flex items-center justify-center gap-1.5 rounded-[0.5rem] border-2 border-dashed py-2.5 text-m-body font-bold text-m-body press"
              style={{ borderColor: "var(--color-signal)", color: "var(--color-signal-dark)" }}
            >
              <Plus className="size-3.5" /> Add a Material
            </button>
          )}
          {locations.length === 0 && (
            <button
              onClick={() => setGuardDialog("location")}
              className="flex items-center justify-center gap-1.5 rounded-[0.5rem] border-2 border-dashed py-2.5 text-m-body font-bold text-m-body press"
              style={{ borderColor: "var(--color-signal)", color: "var(--color-signal-dark)" }}
            >
              <Plus className="size-3.5" /> Add a Stock Location
            </button>
          )}
        </div>
        <Link href="/m/procurement?tab=returns" className="mt-4 text-m-body font-semibold text-m-body press" style={{ color: "var(--color-ink-700)" }}>
          Back to Returns
        </Link>

        {guardDialog === "supplier" ? (
          <MobileNewSupplierDialog
            open
            onClose={() => setGuardDialog(null)}
            onCreated={(s) => { setSuppliers((p) => [...p, { id: s.id, name: s.name }]); setGuardDialog(null); }}
          />
        ) : null}
        {guardDialog === "material" ? (
          <MobileNewMaterialDialog
            open
            onClose={() => setGuardDialog(null)}
            categories={categories}
            onCreated={(m) => { setMaterials((p) => [...p, { id: m.id, name: m.name, code: m.code, unit: m.unit }]); setGuardDialog(null); }}
          />
        ) : null}
        {guardDialog === "location" ? (
          <MobileNewStockLocationDialog
            open
            onClose={() => setGuardDialog(null)}
            onCreated={(l) => { setLocations((p) => [...p, { id: l.id, name: l.name, type: l.type }]); setGuardDialog(null); }}
          />
        ) : null}
      </div>
    );
  }

  return (
    <>
      {hasDraft && !draftRestored && !success ? (
        <DraftBanner
          formName="supplier-return-new"
          updatedAt={draftUpdatedAt}
          onRestore={() => setDraftRestored(true)}
          onDiscard={() => { clearDraft(); setDraftRestored(true); }}
        />
      ) : null}
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
      vehicle={vehicle}
      setVehicle={setVehicle}
    />
    </>
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
  vehicle, setVehicle,
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
  vehicle: VehicleData;
  setVehicle: (v: VehicleData) => void;
}) {
  const submitLongPress = useLongPressNav("/m/procurement?tab=returns", "Returns list");
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

      <form onSubmit={onSubmit} className="flex flex-col gap-3">
        {/* ══════ SECTION: WHO ══════ */}
        <div
          className="rounded-[0.625rem] border p-3 flex flex-col gap-3"
          style={{ borderColor: "var(--color-line)", backgroundColor: "var(--color-paper)" }}
        >
          <p className="text-m-section font-extrabold tracking-tight" style={{ color: "var(--color-ink-950)" }}>
            Supplier
          </p>

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
              label="Original Purchase Order (optional)"
              value={purchaseOrderId ? selectedPO?.poNumber : undefined}
              placeholder="Return without Purchase Order linkage"
            />
          ) : null}
        </div>

        {/* ══════ SECTION: FROM ══════ */}
        <div
          className="rounded-[0.625rem] border p-3 flex flex-col gap-3"
          style={{ borderColor: "var(--color-line)", backgroundColor: "var(--color-paper)" }}
        >
          <p className="text-m-section font-extrabold tracking-tight" style={{ color: "var(--color-ink-950)" }}>
            Source Location
          </p>

          <SelectorCard
            onClick={() => setModal({ type: "location" })}
            icon={MapPin}
            label="From Location"
            value={selectedLocation?.name}
            subvalue={selectedLocation?.type.replace(/_/g, " ").toLowerCase()}
            required
          />
        </div>

        {/* ══════ SECTION: WHAT ══════ */}
        <div
          className="rounded-[0.625rem] border p-3 flex flex-col gap-3"
          style={{ borderColor: "var(--color-line)", backgroundColor: "var(--color-paper)" }}
        >
          <p className="text-m-section font-extrabold tracking-tight" style={{ color: "var(--color-ink-950)" }}>
            Return Items
          </p>

          <div className="flex flex-col gap-3">
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
                  <span className="text-m-section font-extrabold tracking-tight" style={{ color: "var(--color-ink-700)" }}>
                    Item {idx + 1}
                  </span>
                  {lines.length > 1 ? (
                    <button
                      type="button"
                      onClick={() => onRemoveLine(idx)}
                      className="flex items-center gap-1.5 text-m-caption font-semibold text-m-body press"
                      style={{ color: "var(--color-stop)" }}
                    >
                      <Trash2 className="size-2.5" />
                    </button>
                  ) : null}
                </div>

                <div className="p-1.5 flex flex-col gap-3.5">
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
                      <label className="block text-m-caption font-bold mb-0" style={{ color: "var(--color-ink-700)" }}>
                        Qty{mat ? ` (${mat.unit})` : ""}
                      </label>
                      <input
                        type="text" inputMode="decimal"
                        step="any"
                        min="0"
                        value={line.qty}
                        onChange={(e) => onLineChange(idx, "qty", e.target.value)}
                        placeholder="0"
                        className="w-full rounded-[0.375rem] border px-2 py-1.5 text-m-body font-bold tabular-nums outline-none"
                        style={{ borderColor: "var(--color-line)", backgroundColor: "transparent", color: "var(--color-ink-950)" }}
                      />
                    </div>
                    <div>
                      <label className="block text-m-caption font-bold mb-0" style={{ color: "var(--color-ink-700)" }}>
                        Unit Cost
                      </label>
                      <input
                        type="text" inputMode="decimal"
                        step="any"
                        min="0"
                        value={line.unitCost}
                        onChange={(e) => onLineChange(idx, "unitCost", e.target.value)}
                        placeholder="0"
                        className="w-full rounded-[0.375rem] border px-2 py-1.5 text-m-body font-bold tabular-nums outline-none"
                        style={{ borderColor: "var(--color-line)", backgroundColor: "transparent", color: "var(--color-ink-950)" }}
                      />
                    </div>
                  </div>

                  {/* Reason selector */}
                  <div>
                    <label className="block text-m-caption font-bold mb-0" style={{ color: "var(--color-ink-700)" }}>
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
                            className="rounded-[0.375rem] px-1.5 py-0.5 text-m-caption font-semibold text-m-body press transition-colors"
                            style={
                              active
                                ? { backgroundColor: "var(--color-ink-950)", color: "var(--color-paper)" }
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
                    <span className="text-m-caption font-semibold uppercase" style={{ color: "var(--color-ink-700)" }}>
                      Credit
                    </span>
                    <span className="text-m-label font-bold tabular-nums" style={{ color: "var(--color-ink-500)" }}>
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
          className="flex items-center justify-center gap-1 w-full rounded-[0.5rem] border border-dashed py-2.5 text-m-body press"
          style={{ borderColor: "var(--color-line)", color: "var(--color-ink-700)" }}
        >
          <Plus className="size-3.5" />
          <span className="text-m-body font-bold">Add another item</span>
        </button>
        </div>

        {/* ══════ SECTION: DISPATCH ══════ */}
        <div
          className="rounded-[0.625rem] border p-3 flex flex-col gap-3"
          style={{ borderColor: "var(--color-line)", backgroundColor: "var(--color-paper)" }}
        >
          <p className="text-m-section font-extrabold tracking-tight" style={{ color: "var(--color-ink-950)" }}>
            Dispatch
          </p>

          {/* Vehicle / Carrier — how returned goods are transported back */}
          <div>
            <div
              className="flex items-center gap-1.5 border-b pb-2"
              style={{ borderColor: "var(--color-line)" }}
            >
              <Truck className="size-3.5" style={{ color: "var(--color-ink-500)" }} />
              <span className="text-m-section font-extrabold tracking-tight" style={{ color: "var(--color-ink-700)" }}>
                Vehicle / Carrier
              </span>
            </div>
            <VehicleCapture value={vehicle} onChange={setVehicle} compact />
          </div>

          {/* Notes */}
          <div>
            <label className="block text-m-caption font-bold mb-0" style={{ color: "var(--color-ink-700)" }}>
              Notes (optional)
            </label>
            <textarea
              value={notes}
              onChange={(e) => setNotes(e.target.value)}
              placeholder="e.g. Goods damaged in transit"
              rows={2}
              className="w-full h-7 px-1 text-m-caption outline-none border-b focus:border-b-2 transition-colors resize-none"
              style={{ borderColor: "var(--color-line)", backgroundColor: "transparent", color: "var(--color-ink-950)" }}
            />
          </div>
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
        <div className="max-w-md mx-auto px-3.5 py-2 flex items-center gap-1">
          <div className="shrink-0">
            <p className="text-m-caption font-semibold uppercase tracking-wide" style={{ color: "var(--color-ink-700)" }}>
              Total Credit
            </p>
            <p className="text-m-section font-bold tabular-nums" style={{ color: "var(--color-stop)" }}>
              {formatCurrency(total)}
            </p>
          </div>
          <button
            type="button"
            onClick={(e) => { if (submitLongPress.wasLongPress()) return; onSubmit(e as unknown as React.FormEvent); }}
            disabled={submitting}
            {...submitLongPress.longPressProps}
            className="flex-1 flex items-center justify-center gap-1.5 rounded-[0.5rem] py-2.5 text-m-section font-bold text-m-body press disabled:opacity-50 select-none"
            style={{ backgroundColor: "var(--color-ink-950)", color: "var(--color-paper)", touchAction: "none" }}
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
            modal.type === "po" ? [{ id: "", label: "No Purchase Order linkage", sub: undefined }, ...availablePOs.map((p) => ({ id: p.id, label: p.poNumber }))] :
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
      <Icon className="size-3" style={{ color: "var(--color-ink-500)" }} />
      <span className="text-m-section font-extrabold tracking-tight" style={{ color: "var(--color-ink-950)" }}>
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
      className="w-full flex items-center gap-1.5 text-m-body press text-left border-b focus:border-b-2 transition-colors pb-0.5"
      style={{
        borderColor: "var(--color-line)",
        backgroundColor: "transparent",
      }}
    >
      <Icon className="size-4 shrink-0" style={{ color: hasValue ? "var(--color-ink-700)" : "var(--color-signal)" }} />
      <div className="min-w-0 flex-1">
        <p className="block text-m-caption font-bold mb-0" style={{ color: "var(--color-ink-700)" }}>
          {label}{required ? <span style={{ color: "var(--color-stop)" }}> *</span> : null}
        </p>
        {hasValue ? (
          <>
            <p className="text-m-caption font-bold truncate" style={{ color: "var(--color-ink-950)" }}>{value}</p>
            {subvalue ? <p className="text-m-caption truncate" style={{ color: "var(--color-ink-700)" }}>{subvalue}</p> : null}
          </>
        ) : (
          <p className="text-m-caption truncate" style={{ color: "var(--color-ink-500)" }}>
            {placeholder ?? "Tap to select…"}
          </p>
        )}
      </div>
      <ChevronRight className="size-3 shrink-0" style={{ color: "var(--color-ink-700)" }} />
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
      className="w-full flex items-center gap-1.5 press text-left border-b focus:border-b-2 transition-colors pb-0.5"
      style={{
        borderColor: "var(--color-line)",
        backgroundColor: "transparent",
      }}
    >
      <Icon className={`shrink-0 ${compact ? "size-2.5" : "size-3"}`} style={{ color: hasValue ? "var(--color-ink-700)" : "var(--color-signal)" }} />
      <div className="min-w-0 flex-1">
        <span className="block text-m-caption font-bold mb-0" style={{ color: "var(--color-ink-700)" }}>
          {label}{required ? <span style={{ color: "var(--color-stop)" }}> *</span> : null}
        </span>
        {hasValue ? (
          <p className="text-m-caption font-bold truncate" style={{ color: "var(--color-ink-950)" }}>
            {value}{subvalue ? <span className="font-normal" style={{ color: "var(--color-ink-700)" }}> · {subvalue}</span> : null}
          </p>
        ) : (
          <p className="text-m-caption" style={{ color: "var(--color-ink-500)" }}>Tap to select…</p>
        )}
      </div>
      <ChevronRight className={`shrink-0 ${compact ? "size-2.5" : "size-3"}`} style={{ color: "var(--color-ink-700)" }} />
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
          <p className="text-m-section font-bold" style={{ color: "var(--color-ink-950)" }}>{title}</p>
          <button onClick={onClose} className="text-m-body press">
            <X className="size-4" style={{ color: "var(--color-ink-700)" }} />
          </button>
        </div>

        <div className="p-2 border-b" style={{ borderColor: "var(--color-line)" }}>
          <div className="relative">
            <Search className="absolute left-2.5 top-1/2 -translate-y-1/2 size-3.5" style={{ color: "var(--color-ink-700)" }} />
            <input
              type="search"
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              placeholder="Search…"
              autoFocus
              className="w-full h-9 rounded-[0.5rem] border pl-8 pr-2 text-m-body outline-none"
              style={{ borderColor: "var(--color-line)", backgroundColor: "var(--color-paper-2)", color: "var(--color-ink-500)" }}
            />
          </div>
        </div>

        <div className="flex-1 overflow-y-auto overscroll-contain">
          {filtered.length === 0 ? (
            <div className="flex flex-col items-center justify-center py-8 text-center">
              <Search className="size-5 mb-1.5" style={{ color: "var(--color-ink-300)" }} />
              <p className="text-m-body font-semibold" style={{ color: "var(--color-ink-700)" }}>No results</p>
            </div>
          ) : (
            filtered.map((item, i) => {
              const isSelected = item.id === selectedId;
              return (
                <button
                  key={item.id || i}
                  onClick={() => onSelect(item.id)}
                  className="w-full flex items-center gap-1 px-3 py-2.5 text-m-body press text-left"
                  style={{
                    backgroundColor: isSelected ? "color-mix(in srgb, var(--color-ink-950) 5%, transparent)" : "transparent",
                    borderBottom: "1px solid var(--color-line)",
                  }}
                >
                  <div className="min-w-0 flex-1">
                    <p className="text-m-section font-bold truncate" style={{ color: isSelected ? "var(--color-ink-950)" : "var(--color-ink-900)" }}>
                      {item.label}
                    </p>
                    {item.sub ? <p className="text-m-caption truncate" style={{ color: "var(--color-ink-700)" }}>{item.sub}</p> : null}
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

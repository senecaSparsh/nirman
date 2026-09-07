"use client";

import { useState, useMemo, useEffect } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import {
  Plus, Trash2, Loader2, CheckCircle2,
  // eslint-disable-next-line @typescript-eslint/no-unused-vars
  ChevronRight,
  Send, WifiOff,
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
import { SelectorModal, EnumSelect } from "@/components/mobile/v2/form-primitives";

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
  // eslint-disable-next-line @typescript-eslint/no-unused-vars
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
    [{ materialId: "", qty: "", unitCost: "", reason: "" }],
  );
  // Vehicle — how returned goods are transported back to supplier
  const [vehicle, setVehicle] = useState<VehicleData>({ vehicleNumber: "", vehicleType: "" });

  const [success, setSuccess] = useState<{ returnId?: string; returnNumber: string; total: number } | null>(null);

  // ── Draft auto-save (IndexedDB) ──
  useEffect(() => {
    if (success) return;
    const hasContent = supplierId || locationId || purchaseOrderId || notes ||
      lines.some((l) => l.materialId || l.qty);
    if (!hasContent) return;
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
    setLines([...lines, { materialId: "", qty: "", unitCost: "", reason: "" }]);
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
        <p className="text-m-section font-extrabold tracking-tight mb-1" style={{ color: "var(--color-ink-950)" }}>
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
              setLines([{ materialId: "", qty: "", unitCost: "", reason: "" }]);
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
        <p className="text-m-section font-extrabold tracking-tight mb-1" style={{ color: "var(--color-ink-950)" }}>Missing master data</p>
        <p className="text-m-body mb-4" style={{ color: "var(--color-ink-700)" }}>
          You need these before creating a supplier return:
        </p>
        <div className="flex flex-wrap gap-3 w-full max-w-sm justify-center">
          {suppliers.length === 0 && (
            <button
              onClick={() => setGuardDialog("supplier")}
              className="flex-1 min-w-[140px] flex items-center justify-center gap-1.5 rounded-[0.5rem] border-2 border-dashed py-2.5 text-m-body font-bold text-m-body press"
              style={{ borderColor: "var(--color-signal)", color: "var(--color-signal-dark)" }}
            >
              <Plus className="size-3.5" /> Add a Supplier
            </button>
          )}
          {materials.length === 0 && (
            <button
              onClick={() => setGuardDialog("material")}
              className="flex-1 min-w-[140px] flex items-center justify-center gap-1.5 rounded-[0.5rem] border-2 border-dashed py-2.5 text-m-body font-bold text-m-body press"
              style={{ borderColor: "var(--color-signal)", color: "var(--color-signal-dark)" }}
            >
              <Plus className="size-3.5" /> Add a Material
            </button>
          )}
          {locations.length === 0 && (
            <button
              onClick={() => setGuardDialog("location")}
              className="flex-1 min-w-[140px] flex items-center justify-center gap-1.5 rounded-[0.5rem] border-2 border-dashed py-2.5 text-m-body font-bold text-m-body press"
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
            nested
            onClose={() => setGuardDialog(null)}
            onCreated={(s) => { setSuppliers((p) => [...p, { id: s.id, name: s.name }]); setGuardDialog(null); }}
          />
        ) : null}
        {guardDialog === "material" ? (
          <MobileNewMaterialDialog
            open
            nested
            onClose={() => setGuardDialog(null)}
            categories={categories}
            onCreated={(m) => { setMaterials((p) => [...p, { id: m.id, name: m.name, code: m.code, unit: m.unit }]); setGuardDialog(null); }}
          />
        ) : null}
        {guardDialog === "location" ? (
          <MobileNewStockLocationDialog
            open
            nested
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
      categories={categories}
      setSuppliers={setSuppliers}
      setLocations={setLocations}
      setMaterials={setMaterials}
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
  categories,
  setSuppliers, setLocations, setMaterials,
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
  categories: CategoryItem[];
  setSuppliers: React.Dispatch<React.SetStateAction<SupplierItem[]>>;
  setLocations: React.Dispatch<React.SetStateAction<LocationItem[]>>;
  setMaterials: React.Dispatch<React.SetStateAction<MaterialItem[]>>;
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
  const [showCreateDialog, setShowCreateDialog] = useState<"supplier" | "location" | "material" | null>(null);

  const closeModal = () => setModal(null);
  const closeCreateDialog = () => setShowCreateDialog(null);

  // When a new entity is created inline, add it to the list and select it
  const handleCreated = (type: "supplier" | "location" | "material", id: string, name: string, extra?: Partial<SupplierItem & LocationItem & MaterialItem>) => {
    if (type === "supplier") {
      setSuppliers((prev) => [...prev, { id, name }]);
      setSupplierId(id);
    } else if (type === "location") {
      setLocations((prev) => [...prev, { id, name, type: extra?.type ?? "PROJECT_SITE" }]);
      setLocationId(id);
    } else if (type === "material") {
      setMaterials((prev) => [...prev, { id, name, code: extra?.code ?? "", unit: extra?.unit ?? "" }]);
      if (modal?.lineIndex !== undefined) {
        onLineChange(modal.lineIndex, "materialId", id);
      }
    }
    closeCreateDialog();
    closeModal();
  };

  const handleSelect = async (id: string) => {
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
      // Auto-fill unitCost from the current Moving Average Cost (MAC) at the
      // selected location. The user can still override this afterwards. Only
      // auto-fill when the field is empty so we never clobber a manual entry.
      const line = lines[modal.lineIndex];
      if (locationId && line && !line.unitCost) {
        try {
          const res = await fetch(
            `/api/stock?locationId=${encodeURIComponent(locationId)}&materialId=${encodeURIComponent(id)}`,
          );
          if (res.ok) {
            const rows = await res.json();
            const mac = Array.isArray(rows) && rows.length > 0 ? rows[0].mac : null;
            if (typeof mac === "number" && mac > 0) {
              onLineChange(modal.lineIndex, "unitCost", String(mac));
            }
          }
        } catch {
          // non-fatal — leave unitCost blank for manual entry
        }
      }
    }
    closeModal();
  };

  return (
    <div className="">

      <form onSubmit={onSubmit} className="flex flex-col gap-3">
        {/* ══════ SECTION: SUPPLIER + LOCATION ══════ */}
        <div
          className="rounded-[0.625rem] border p-3 flex flex-col gap-3"
          style={{ borderColor: "var(--color-line)", backgroundColor: "var(--color-paper)" }}
        >
          <p className="text-m-section font-extrabold tracking-tight" style={{ color: "var(--color-ink-950)" }}>
            Details
          </p>

          {/* Supplier + From Location (side by side) */}
          <div className="grid grid-cols-2 gap-2 divide-x" style={{ borderColor: "var(--color-line)" }}>
            <div>
              <SelectorCard
                onClick={() => setModal({ type: "supplier" })}
                label="Supplier"
                value={selectedSupplier?.name}
                required
              />
            </div>
            <div>
              <SelectorCard
                onClick={() => setModal({ type: "location" })}
                label="From Location"
                value={selectedLocation?.name}
                subvalue={selectedLocation?.type.replace(/_/g, " ").toLowerCase()}
                required
              />
            </div>
          </div>

          {/* Optional PO linkage */}
          {supplierId && availablePOs.length > 0 ? (
            <SelectorCard
              onClick={() => setModal({ type: "po" })}
              label="Original Purchase Order"
              value={purchaseOrderId ? selectedPO?.poNumber : undefined}
            />
          ) : null}
        </div>

        {/* ══════ SECTION: WHAT ══════ */}
        <div
          className="rounded-[0.625rem] border p-3 flex flex-col gap-3"
          style={{ borderColor: "var(--color-line)", backgroundColor: "var(--color-paper)" }}
        >
          <div className="flex items-center justify-between">
            <p className="text-m-section font-extrabold tracking-tight" style={{ color: "var(--color-ink-950)" }}>
              Return Items ({lines.length})
            </p>
            <button
              type="button"
              onClick={onAddLine}
              className="flex items-center gap-1 rounded-[0.375rem] px-2 py-1 text-m-caption font-bold text-m-body press active:scale-95"
              style={{ backgroundColor: "var(--color-concrete)", color: "var(--color-ink-500)" }}
            >
              <Plus className="size-3" />
              <span>Add</span>
            </button>
          </div>

          <div className={lines.length > 1 ? "grid grid-cols-2 gap-2 divide-x" : "flex flex-col gap-3"} style={{ borderColor: "var(--color-line)" }}>
            {lines.map((line, idx) => {
            const mat = materials.find((m) => m.id === line.materialId);
            const lineTotal = (Number(line.qty) || 0) * (Number(line.unitCost) || 0);
            return (
              <div
                key={idx}
                className="rounded-[0.5rem] border p-2 flex flex-col gap-2.5"
                style={{ borderColor: "var(--color-line)", backgroundColor: "var(--color-paper-2)" }}
              >
                {lines.length > 1 ? (
                  <div className="flex items-center justify-between">
                    <span className="text-m-caption font-bold" style={{ color: "var(--color-ink-700)" }}>
                      Item {idx + 1}
                    </span>
                    <button
                      type="button"
                      onClick={() => onRemoveLine(idx)}
                      aria-label="Remove item"
                      className="text-m-body press"
                      style={{ color: "var(--color-stop)" }}
                    >
                      <Trash2 className="size-3" />
                    </button>
                  </div>
                ) : null}

                <SelectorRow
                  onClick={() => setModal({ type: "material", lineIndex: idx })}
                  label="Material"
                  value={mat ? mat.name : undefined}
                  subvalue={mat ? `${mat.code} · ${mat.unit}` : undefined}
                  required
                />

                {/* Qty + Unit Cost (side by side) */}
                <div className="grid grid-cols-2 gap-1.5 divide-x" style={{ borderColor: "var(--color-line)" }}>
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
                      className="w-full h-7 px-1 text-m-caption font-bold tabular-nums outline-none border-b focus:border-b-2 transition-colors"
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
                      className="w-full h-7 px-1 text-m-caption font-bold tabular-nums outline-none border-b focus:border-b-2 transition-colors"
                      style={{ borderColor: "var(--color-line)", backgroundColor: "transparent", color: "var(--color-ink-950)" }}
                    />
                  </div>
                </div>

                {/* Reason + Credit (side by side) */}
                <div className="grid grid-cols-2 gap-1.5 divide-x" style={{ borderColor: "var(--color-line)" }}>
                  <div>
                    <EnumSelect
                      label="Reason"
                      value={line.reason}
                      onChange={(v) => onLineChange(idx, "reason", v)}
                      placeholder="— Select —"
                      options={REASONS.map((r) => ({ value: r, label: r }))}
                    />
                  </div>
                  <div className="flex flex-col justify-center">
                    <span className="text-m-caption font-bold" style={{ color: "var(--color-ink-700)" }}>
                      Credit
                    </span>
                    <span className="text-m-caption font-bold tabular-nums" style={{ color: "var(--color-ink-500)" }}>
                      {formatCurrency(lineTotal)}
                    </span>
                  </div>
                </div>
              </div>
            );
          })}
        </div>
        </div>

        {/* ══════ SECTION: DISPATCH ══════ */}
        <div
          className="rounded-[0.625rem] border p-3 flex flex-col gap-3"
          style={{ borderColor: "var(--color-line)", backgroundColor: "var(--color-paper)" }}
        >
          <p className="text-m-section font-extrabold tracking-tight" style={{ color: "var(--color-ink-950)" }}>
            Dispatch
          </p>

          {/* Vehicle / Carrier */}
          <div>
            <p className="text-m-section font-extrabold tracking-tight mb-2" style={{ color: "var(--color-ink-700)" }}>
              Vehicle / Carrier
            </p>
            <VehicleCapture value={vehicle} onChange={setVehicle} compact />
          </div>

          {/* Notes */}
          <div>
            <label className="block text-m-caption font-bold mb-0" style={{ color: "var(--color-ink-700)" }}>
              Notes
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
        className="sticky bottom-0 left-0 right-0 z-30 border-t"
        style={{
          backgroundColor: "var(--color-paper)",
          borderColor: "var(--color-line)",
        }}
      >
        <div className="px-3 py-2 flex items-center justify-between gap-2">
          <div className="shrink-0 flex flex-col gap-0.5">
            {total > 0 ? (
              <span className="text-m-body font-bold tabular-nums" style={{ color: "var(--color-ink-950)" }}>
                {formatCurrency(total)}
              </span>
            ) : (
              <span className="text-m-caption" style={{ color: "var(--color-ink-300)" }}>
                Add items to see total
              </span>
            )}
            {total > 0 ? (
              <span className="text-m-caption" style={{ color: "var(--color-ink-500)" }}>
                Total credit
              </span>
            ) : null}
          </div>

          <button
            type="button"
            onClick={(e) => { if (submitLongPress.wasLongPress()) return; onSubmit(e as unknown as React.FormEvent); }}
            disabled={submitting}
            {...submitLongPress.longPressProps}
            className="flex-1 flex items-center justify-center gap-1.5 rounded-[0.5rem] py-2.5 text-m-body font-bold text-m-body press disabled:opacity-50 select-none"
            style={{ backgroundColor: "var(--color-ink-950)", color: "var(--color-paper)", touchAction: "none" }}
          >
            {submitting ? (
              <Loader2 className="size-4 animate-spin" />
            ) : (
              <>
                {online ? <Send className="size-3.5" /> : <WifiOff className="size-3.5" />}
                <span>{online ? "Create Draft Return" : "Queue Offline"}</span>
              </>
            )}
          </button>
        </div>
      </div>

      {/* ══════ SELECTOR MODAL ══════ */}
      {modal ? (
        <SelectorModal
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
          onCreate={modal.type === "po" ? undefined : () => {
            if (modal) setShowCreateDialog(modal.type as "supplier" | "location" | "material");
          }}
        />
      ) : null}

      {/* ══════ INLINE CREATE DIALOGS ══════ */}
      {showCreateDialog === "supplier" ? (
        <MobileNewSupplierDialog
          open
          nested
          onClose={closeCreateDialog}
          onCreated={(s) => handleCreated("supplier", s.id, s.name)}
        />
      ) : null}
      {showCreateDialog === "material" ? (
        <MobileNewMaterialDialog
          open
          nested
          onClose={closeCreateDialog}
          categories={categories}
          onCreated={(m) => handleCreated("material", m.id, m.name, { code: m.code, unit: m.unit })}
        />
      ) : null}
      {showCreateDialog === "location" ? (
        <MobileNewStockLocationDialog
          open
          nested
          onClose={closeCreateDialog}
          projects={[]}
          onCreated={(l) => handleCreated("location", l.id, l.name, { type: l.type })}
        />
      ) : null}
    </div>
  );
}

/* ═══════════════════════════════════════════════════════════
 * Section header
 * ═══════════════════════════════════════════════════════════ */
// eslint-disable-next-line @typescript-eslint/no-unused-vars
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
  onClick, label, value, subvalue, required,
}: {
  onClick: () => void;
  icon?: React.ComponentType<{ className?: string; style?: React.CSSProperties }>;
  label: string;
  value?: string;
  subvalue?: string | null;
  placeholder?: string;
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

/* ═══════════════════════════════════════════════════════════
 * Selector row
 * ═══════════════════════════════════════════════════════════ */
function SelectorRow({
  onClick, label, value, subvalue, required,
}: {
  onClick: () => void;
  icon?: React.ComponentType<{ className?: string; style?: React.CSSProperties }>;
  label: string;
  value?: string;
  subvalue?: string;
  required?: boolean;
  compact?: boolean;
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



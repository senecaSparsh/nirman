"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import {
  Pencil, Trash2, Loader2, X, Tag, TrendingUp,
} from "lucide-react";
import { toast } from "sonner";
import { EnumSelect } from "@/components/mobile/v2/form-primitives";

type UnitStatus = "PLANNED" | "UNDER_CONSTRUCTION" | "AVAILABLE" | "HOLD" | "SOLD";
type UnitType = "BHK_1" | "BHK_2" | "BHK_3" | "BHK_4" | "SHOP" | "OFFICE" | "WAREHOUSE_UNIT" | "VILLA" | "OTHER";
type AreaUnit = "SQFT" | "SQM" | "SQYD" | "ACRE" | "BIGHA" | "KATHA" | "HECTARE";

const AREA_UNIT_LABELS: Record<AreaUnit, string> = {
  SQFT: "sq.ft",
  SQM: "sq.m",
  SQYD: "sq.yd",
  ACRE: "acre",
  BIGHA: "bigha",
  KATHA: "katha",
  HECTARE: "hectare",
};

// ── Extracted module-level components (avoid "Cannot create components during render") ──
function SheetHeader({ title, onClose }: { title: string; onClose: () => void }) {
  return (
    <>
      <div className="flex justify-center pt-2 pb-1">
        <div className="h-1 w-10 rounded-full" style={{ backgroundColor: "var(--color-line)" }} />
      </div>
      <div className="flex items-center justify-between px-3 pb-2">
        <p className="text-m-section font-extrabold tracking-tight" style={{ color: "var(--color-ink-950)" }}>{title}</p>
        <button onClick={onClose} aria-label="Close dialog" className="text-m-body press p-1">
          <X className="size-4" style={{ color: "var(--color-ink-500)" }} />
        </button>
      </div>
    </>
  );
}

function ConfirmButtons({ onCancel, onConfirm, confirmLabel, busy }: { onCancel: () => void; onConfirm: () => void; confirmLabel: string; busy: boolean }) {
  return (
    <div className="flex gap-2">
      <button onClick={onCancel} disabled={busy} className="flex-1 h-9 rounded-[0.5rem] border text-m-label font-bold text-m-body press" style={{ borderColor: "var(--color-line)", color: "var(--color-ink-700)" }}>Cancel</button>
      <button onClick={onConfirm} disabled={busy} className="flex-1 h-9 rounded-[0.5rem] text-m-label font-bold text-m-body press flex items-center justify-center gap-1" style={{ backgroundColor: "var(--color-ink-950)", color: "var(--color-paper)", opacity: busy ? 0.5 : 1 }}>
        {busy ? <Loader2 className="size-3.5 animate-spin" /> : confirmLabel}
      </button>
    </div>
  );
}

const STATUS_OPTIONS: { value: UnitStatus; label: string }[] = [
  { value: "PLANNED", label: "Planned" },
  { value: "UNDER_CONSTRUCTION", label: "Under Construction" },
  { value: "AVAILABLE", label: "Available" },
  { value: "HOLD", label: "On Hold" },
  { value: "SOLD", label: "Sold" },
];

const TYPE_OPTIONS: { value: UnitType; label: string }[] = [
  { value: "BHK_1", label: "1 BHK" },
  { value: "BHK_2", label: "2 BHK" },
  { value: "BHK_3", label: "3 BHK" },
  { value: "BHK_4", label: "4 BHK" },
  { value: "SHOP", label: "Shop" },
  { value: "OFFICE", label: "Office" },
  { value: "WAREHOUSE_UNIT", label: "Warehouse Unit" },
  { value: "VILLA", label: "Villa" },
  { value: "OTHER", label: "Other" },
];

export function MobileUnitActions({
  unitId,
  unitNumber,
  canManage,
  currentStatus,
  initialUnitType,
  initialFloor,
  initialWing,
  initialArea,
  initialAreaUnit,
  initialAskingPrice,
  initialCarpetArea,
  initialSuperBuiltUpArea,
  initialBalconyArea,
  initialClearHeight,
  initialHasLoadingDock,
  initialCurrentValuation,
}: {
  unitId: string;
  unitNumber: string;
  canManage: boolean;
  currentStatus: UnitStatus;
  initialUnitType: UnitType;
  initialFloor: number | null;
  initialWing: string | null;
  initialArea: string;
  initialAreaUnit: string;
  initialAskingPrice: string | null;
  initialCarpetArea: string | null;
  initialSuperBuiltUpArea: string | null;
  initialBalconyArea: string | null;
  initialClearHeight: string | null;
  initialHasLoadingDock: boolean;
  initialCurrentValuation: string;
}) {
  const router = useRouter();
  const [busy, setBusy] = useState(false);
  const [showEdit, setShowEdit] = useState(false);
  const [showStatus, setShowStatus] = useState(false);
  const [showValuation, setShowValuation] = useState(false);
  const [showDelete, setShowDelete] = useState(false);

  // Edit form state
  const [unitType, setUnitType] = useState<UnitType>(initialUnitType);
  const [floor, setFloor] = useState(initialFloor != null ? String(initialFloor) : "");
  const [wing, setWing] = useState(initialWing ?? "");
  const [area, setArea] = useState(initialArea);
  const [areaUnit, setAreaUnit] = useState<AreaUnit>(initialAreaUnit as AreaUnit);
  const [askingPrice, setAskingPrice] = useState(initialAskingPrice ?? "");
  const [carpetArea, setCarpetArea] = useState(initialCarpetArea ?? "");
  const [superBuiltUpArea, setSuperBuiltUpArea] = useState(initialSuperBuiltUpArea ?? "");
  const [balconyArea, setBalconyArea] = useState(initialBalconyArea ?? "");
  const [clearHeight, setClearHeight] = useState(initialClearHeight ?? "");
  const [hasLoadingDock, setHasLoadingDock] = useState(initialHasLoadingDock);

  // Status form state
  const [newStatus, setNewStatus] = useState<UnitStatus>(currentStatus);

  // Valuation form state
  const [valAskingPrice, setValAskingPrice] = useState(initialAskingPrice ?? "");
  const [valCurrentValuation, setValCurrentValuation] = useState(initialCurrentValuation);

  if (!canManage) return null;

  async function patch(body: Record<string, unknown>, successMsg: string, closeModal?: () => void) {
    setBusy(true);
    try {
      const res = await fetch(`/api/built-units/${unitId}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(body),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error ?? "Failed");
      toast.success(successMsg);
      closeModal?.();
      router.refresh();
    } catch (err: unknown) {
      toast.error(err instanceof Error ? err.message : "Failed");
    } finally {
      setBusy(false);
    }
  }

  async function handleDelete() {
    setBusy(true);
    try {
      const res = await fetch(`/api/built-units/${unitId}`, { method: "DELETE" });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(data.error ?? "Failed to delete");
      toast.success("Unit archived");
      setShowDelete(false);
      router.push(`/m/projects/${unitId}`);
    } catch (err: unknown) {
      toast.error(err instanceof Error ? err.message : "Failed");
    } finally {
      setBusy(false);
    }
  }

  function saveEdit() {
    const body: Record<string, unknown> = {
      action: "edit",
      unitType,
      unitNumber: unitNumber,
      area: Number(area),
      areaUnit,
    };
    if (floor !== "") body.floor = Number(floor);
    else body.floor = null;
    if (wing.trim()) body.wing = wing.trim();
    else body.wing = null;
    if (askingPrice !== "") body.askingPrice = Number(askingPrice);
    if (carpetArea !== "") body.carpetArea = Number(carpetArea);
    if (superBuiltUpArea !== "") body.superBuiltUpArea = Number(superBuiltUpArea);
    if (balconyArea !== "") body.balconyArea = Number(balconyArea);
    if (clearHeight !== "") body.clearHeight = Number(clearHeight);
    body.hasLoadingDock = hasLoadingDock;
    patch(body, "Unit updated", () => setShowEdit(false));
  }

  function saveStatus() {
    patch({ action: "status", status: newStatus }, "Status updated", () => setShowStatus(false));
  }

  function saveValuation() {
    const body: Record<string, unknown> = { action: "valuation" };
    if (valAskingPrice !== "") body.askingPrice = Number(valAskingPrice);
    if (valCurrentValuation !== "") body.currentValuation = Number(valCurrentValuation);
    patch(body, "Valuation updated", () => setShowValuation(false));
  }

  const inputClass = "w-full h-7 px-1 text-m-caption outline-none border-b focus:border-b-2 transition-colors";
  const inputStyle = { borderColor: "var(--color-line)", backgroundColor: "transparent", color: "var(--color-ink-950)" };
  const labelClass = "block text-m-caption font-bold mb-0";
  const labelStyle = { color: "var(--color-ink-700)" };

  return (
    <>
      {/* Action buttons */}
      <div className="grid grid-cols-2 gap-2 mb-3">
        <button onClick={() => setShowEdit(true)} disabled={busy} className="flex items-center justify-center gap-1.5 h-9 rounded-[0.5rem] border text-m-label font-bold text-m-body press disabled:opacity-50" style={{ borderColor: "var(--color-line)", color: "var(--color-ink-700)" }}>
          <Pencil className="size-3" /> Edit
        </button>
        <button onClick={() => setShowStatus(true)} disabled={busy} className="flex items-center justify-center gap-1.5 h-9 rounded-[0.5rem] border text-m-label font-bold text-m-body press disabled:opacity-50" style={{ borderColor: "var(--color-line)", color: "var(--color-ink-700)" }}>
          <Tag className="size-3" /> Status
        </button>
        <button onClick={() => setShowValuation(true)} disabled={busy} className="flex items-center justify-center gap-1.5 h-9 rounded-[0.5rem] border text-m-label font-bold text-m-body press disabled:opacity-50" style={{ borderColor: "var(--color-line)", color: "var(--color-ink-700)" }}>
          <TrendingUp className="size-3" /> Valuation
        </button>
        <button onClick={() => setShowDelete(true)} disabled={busy} className="flex items-center justify-center gap-1.5 h-9 rounded-[0.5rem] border text-m-label font-bold text-m-body press disabled:opacity-50" style={{ borderColor: "color-mix(in srgb, var(--color-stop) 30%, var(--color-line))", color: "var(--color-stop)" }}>
          <Trash2 className="size-3" /> Delete
        </button>
      </div>

      {/* Edit sheet */}
      {showEdit ? (
        <div className="fixed inset-0 z-50 flex items-end" style={{ backgroundColor: "color-mix(in srgb, var(--color-ink-950) 40%, transparent)" }} onClick={() => setShowEdit(false)}>
          <div className="w-full rounded-t-[1rem] mx-auto max-w-md max-h-[85vh] overflow-y-auto" style={{ backgroundColor: "var(--color-paper)" }} onClick={(e) => e.stopPropagation()}>
            <SheetHeader title="Edit Unit" onClose={() => setShowEdit(false)} />
            <div className="px-3 pb-4 flex flex-col gap-3">
              <div className="rounded-[0.625rem] border p-3 flex flex-col gap-3" style={{ borderColor: "var(--color-line)", backgroundColor: "var(--color-paper)" }}>
                <p className="text-m-section font-extrabold tracking-tight" style={{ color: "var(--color-ink-950)" }}>
                  Unit Basics
                </p>
                <div className="grid grid-cols-2 gap-2 divide-x" style={{ borderColor: "var(--color-line)" }}>
                  <div>
                    <EnumSelect
                      label="Type"
                      required
                      value={unitType}
                      onChange={(v) => setUnitType(v as UnitType)}
                      options={TYPE_OPTIONS}
                    />
                  </div>
                  <div className="pl-2">
                    <label className={labelClass} style={labelStyle}>Area *</label>
                    <input type="number" step="any" min="0" inputMode="decimal" value={area} onChange={(e) => setArea(e.target.value)} className={inputClass} style={inputStyle} />
                  </div>
                </div>
                <div className="grid grid-cols-2 gap-2 divide-x" style={{ borderColor: "var(--color-line)" }}>
                  <div>
                    <EnumSelect
                      label="Area Unit"
                      value={areaUnit}
                      onChange={(v) => setAreaUnit(v as AreaUnit)}
                      options={(Object.keys(AREA_UNIT_LABELS) as AreaUnit[]).map((u) => ({
                        value: u,
                        label: AREA_UNIT_LABELS[u],
                      }))}
                    />
                  </div>
                  <div className="pl-2">
                    <label className={labelClass} style={labelStyle}>Floor</label>
                    <input type="number" inputMode="numeric" value={floor} onChange={(e) => setFloor(e.target.value)} placeholder="—" className={inputClass} style={inputStyle} />
                  </div>
                </div>
                <div>
                  <label className={labelClass} style={labelStyle}>Wing</label>
                  <input value={wing} onChange={(e) => setWing(e.target.value)} placeholder="—" className={inputClass} style={inputStyle} />
                </div>
              </div>
              <div className="rounded-[0.625rem] border p-3 flex flex-col gap-3" style={{ borderColor: "var(--color-line)", backgroundColor: "var(--color-paper)" }}>
                <p className="text-m-section font-extrabold tracking-tight" style={{ color: "var(--color-ink-950)" }}>
                  Pricing
                </p>
                <div>
                  <label className={labelClass} style={labelStyle}>Asking Price (₹)</label>
                  <input type="number" min="0" inputMode="numeric" value={askingPrice} onChange={(e) => setAskingPrice(e.target.value)} placeholder="—" className={inputClass} style={inputStyle} />
                </div>
              </div>
              <div className="rounded-[0.625rem] border p-3 flex flex-col gap-3" style={{ borderColor: "var(--color-line)", backgroundColor: "var(--color-paper)" }}>
                <p className="text-m-section font-extrabold tracking-tight" style={{ color: "var(--color-ink-950)" }}>
                  Area Details
                </p>
                <div className="grid grid-cols-2 gap-2 divide-x" style={{ borderColor: "var(--color-line)" }}>
                  <div>
                    <label className={labelClass} style={labelStyle}>Carpet Area</label>
                    <input type="number" step="any" min="0" inputMode="decimal" value={carpetArea} onChange={(e) => setCarpetArea(e.target.value)} placeholder="—" className={inputClass} style={inputStyle} />
                  </div>
                  <div className="pl-2">
                    <label className={labelClass} style={labelStyle}>Super Built-Up</label>
                    <input type="number" step="any" min="0" inputMode="decimal" value={superBuiltUpArea} onChange={(e) => setSuperBuiltUpArea(e.target.value)} placeholder="—" className={inputClass} style={inputStyle} />
                  </div>
                </div>
                <div className="grid grid-cols-2 gap-2 divide-x" style={{ borderColor: "var(--color-line)" }}>
                  <div>
                    <label className={labelClass} style={labelStyle}>Balcony Area</label>
                    <input type="number" step="any" min="0" inputMode="decimal" value={balconyArea} onChange={(e) => setBalconyArea(e.target.value)} placeholder="—" className={inputClass} style={inputStyle} />
                  </div>
                  <div className="pl-2">
                    <label className={labelClass} style={labelStyle}>Clear Height</label>
                    <input type="number" step="any" min="0" inputMode="decimal" value={clearHeight} onChange={(e) => setClearHeight(e.target.value)} placeholder="—" className={inputClass} style={inputStyle} />
                  </div>
                </div>
                <label className="flex items-center gap-2 text-m-body" style={{ color: "var(--color-ink-700)" }}>
                  <input type="checkbox" checked={hasLoadingDock} onChange={(e) => setHasLoadingDock(e.target.checked)} className="size-4" />
                  Has Loading Dock
                </label>
              </div>
              <ConfirmButtons onCancel={() => setShowEdit(false)} onConfirm={saveEdit} confirmLabel="Save" busy={busy} />
            </div>
          </div>
        </div>
      ) : null}

      {/* Status sheet */}
      {showStatus ? (
        <div className="fixed inset-0 z-50 flex items-end" style={{ backgroundColor: "color-mix(in srgb, var(--color-ink-950) 40%, transparent)" }} onClick={() => setShowStatus(false)}>
          <div className="w-full rounded-t-[1rem] mx-auto max-w-md" style={{ backgroundColor: "var(--color-paper)" }} onClick={(e) => e.stopPropagation()}>
            <SheetHeader title="Update Status" onClose={() => setShowStatus(false)} />
            <div className="px-3 pb-4 flex flex-col gap-3">
              <div className="rounded-[0.625rem] border p-3 flex flex-col gap-3" style={{ borderColor: "var(--color-line)", backgroundColor: "var(--color-paper)" }}>
                <p className="text-m-section font-extrabold tracking-tight" style={{ color: "var(--color-ink-950)" }}>
                  Status
                </p>
                <EnumSelect
                  label=""
                  inline
                  value={newStatus}
                  onChange={(v) => setNewStatus(v as UnitStatus)}
                  options={STATUS_OPTIONS}
                />
              </div>
              <ConfirmButtons onCancel={() => setShowStatus(false)} onConfirm={saveStatus} confirmLabel="Update" busy={busy} />
            </div>
          </div>
        </div>
      ) : null}

      {/* Valuation sheet */}
      {showValuation ? (
        <div className="fixed inset-0 z-50 flex items-end" style={{ backgroundColor: "color-mix(in srgb, var(--color-ink-950) 40%, transparent)" }} onClick={() => setShowValuation(false)}>
          <div className="w-full rounded-t-[1rem] mx-auto max-w-md" style={{ backgroundColor: "var(--color-paper)" }} onClick={(e) => e.stopPropagation()}>
            <SheetHeader title="Update Valuation" onClose={() => setShowValuation(false)} />
            <div className="px-3 pb-4 flex flex-col gap-3">
              <div className="rounded-[0.625rem] border p-3 flex flex-col gap-3" style={{ borderColor: "var(--color-line)", backgroundColor: "var(--color-paper)" }}>
                <p className="text-m-section font-extrabold tracking-tight" style={{ color: "var(--color-ink-950)" }}>
                  Valuation
                </p>
                <div className="grid grid-cols-2 gap-2 divide-x" style={{ borderColor: "var(--color-line)" }}>
                  <div>
                    <label className={labelClass} style={labelStyle}>Asking Price (₹)</label>
                    <input type="number" min="0" inputMode="numeric" value={valAskingPrice} onChange={(e) => setValAskingPrice(e.target.value)} placeholder="—" className={inputClass} style={inputStyle} />
                  </div>
                  <div className="pl-2">
                    <label className={labelClass} style={labelStyle}>Current Valuation (₹)</label>
                    <input type="number" min="0" inputMode="numeric" value={valCurrentValuation} onChange={(e) => setValCurrentValuation(e.target.value)} className={inputClass} style={inputStyle} />
                  </div>
                </div>
              </div>
              <ConfirmButtons onCancel={() => setShowValuation(false)} onConfirm={saveValuation} confirmLabel="Update" busy={busy} />
            </div>
          </div>
        </div>
      ) : null}

      {/* Delete confirmation */}
      {showDelete ? (
        <div className="fixed inset-0 z-50 flex items-end" style={{ backgroundColor: "color-mix(in srgb, var(--color-ink-950) 40%, transparent)" }} onClick={() => setShowDelete(false)}>
          <div className="w-full rounded-t-[1rem] mx-auto max-w-md" style={{ backgroundColor: "var(--color-paper)" }} onClick={(e) => e.stopPropagation()}>
            <SheetHeader title="Archive Unit?" onClose={() => setShowDelete(false)} />
            <div className="px-3 pb-4">
              <p className="text-m-label mb-3" style={{ color: "var(--color-ink-500)" }}>
                This will archive unit <span className="font-bold">{unitNumber}</span>. The unit will be hidden but historical references are preserved. This cannot be undone.
              </p>
              <div className="flex gap-2">
                <button onClick={() => setShowDelete(false)} disabled={busy} className="flex-1 h-9 rounded-[0.5rem] border text-m-label font-bold text-m-body press" style={{ borderColor: "var(--color-line)", color: "var(--color-ink-700)" }}>Cancel</button>
                <button onClick={handleDelete} disabled={busy} className="flex-1 h-9 rounded-[0.5rem] text-m-label font-bold text-m-body press flex items-center justify-center gap-1" style={{ backgroundColor: "var(--color-stop)", color: "var(--color-paper)" }}>
                  {busy ? <Loader2 className="size-3.5 animate-spin" /> : "Archive"}
                </button>
              </div>
            </div>
          </div>
        </div>
      ) : null}
    </>
  );
}

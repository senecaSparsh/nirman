"use client";

import { useState, useEffect, useCallback } from "react";
import { useRouter } from "next/navigation";
import { SlidersHorizontal, Loader2, Plus, Minus, AlertTriangle } from "lucide-react";
import { toast } from "sonner";
import { MobileFab } from "@/components/mobile/v2/scaffold";
import { MobileFabModal } from "@/components/mobile/v2/fab-modal";
import { useFabModal } from "@/lib/use-fab-modal";
import { formatCurrency, formatNumber } from "@/lib/utils";
import { MobileSelectWithCreate } from "@/components/mobile/MobileSelectWithCreate";

type StockItem = {
  locationId: string;
  locationName: string;
  qty: number;
  movingAvgCost: number;
};

type LocationOption = {
  id: string;
  name: string;
  projectName: string | null;
};

/**
 * Mobile "Adjust Stock" FAB + bottom sheet.
 * Calls POST /api/materials/[id]/adjust-stock — same backend as the desktop
 * AdjustStockDialog. Lets managers add opening stock or write off stock
 * directly from the material profile without going through a PO/transfer.
 */
export function MobileAdjustStockBtn({
  materialId,
  materialCode,
  materialName,
  materialUnit,
  currentCost,
  isLotTracked,
  stockItems,
  locations: serverLocations,
}: {
  materialId: string;
  materialCode: string;
  materialName: string;
  materialUnit: string;
  currentCost: number;
  isLotTracked: boolean;
  stockItems: StockItem[];
  locations?: LocationOption[];
}) {
  const router = useRouter();
  const fab = useFabModal();
  const show = fab.isOpen;
  const setShow = (v: boolean) => (v ? fab.open() : fab.close());
  const [saving, setSaving] = useState(false);
  const [locations, setLocations] = useState<LocationOption[]>(
    serverLocations ??
      stockItems.map((i) => ({ id: i.locationId, name: i.locationName, projectName: null })),
  );
  const [locLoading, setLocLoading] = useState(false);
  const [direction, setDirection] = useState<"IN" | "OUT">("IN");
  const [locationId, setLocationId] = useState("");
  const [qty, setQty] = useState("");
  const [unitCost, setUnitCost] = useState("");
  const [reason, setReason] = useState("");

  const inputClass =
    "w-full h-7 px-1 text-m-caption outline-none border-b focus:border-b-2 transition-colors tabular-nums";
  const inputStyle = {
    borderColor: "var(--color-line)",
    backgroundColor: "transparent",
    color: "var(--color-ink-950)",
  } as React.CSSProperties;

  const fetchLocations = useCallback(async () => {
    setLocLoading(true);
    try {
      const res = await fetch("/api/stock-locations");
      if (!res.ok) throw new Error("Failed to load locations");
      const data = await res.json();
      if (!Array.isArray(data)) throw new Error("Invalid stock locations response");
      const fetched: LocationOption[] = data.map((l: LocationOption) => ({
        id: l.id,
        name: l.name,
        projectName: l.projectName ?? null,
      }));
      // Merge with the initial stock-item locations so there are never gaps
      // if the API returns empty or fails. Prefer fetched order, keep all.
      setLocations((prev) => {
        const map = new Map<string, LocationOption>();
        for (const l of prev) map.set(l.id, l);
        for (const l of fetched) map.set(l.id, l);
        return fetched.length > 0 ? fetched : Array.from(map.values());
      });
    } catch {
      toast.error("Could not load all stock locations");
    } finally {
      setLocLoading(false);
    }
  }, []);

  useEffect(() => {
    if (show) {
      const fallback =
        serverLocations ??
        stockItems.map((i) => ({ id: i.locationId, name: i.locationName, projectName: null }));
      setLocations(fallback);
      // Prefer a location where this material actually has stock, so the
      // current-balance card shows immediately. Fall back to the first option.
      const defaultId = stockItems[0]?.locationId ?? fallback[0]?.id ?? "";
      setLocationId(defaultId);
      setDirection("IN");
      setQty("");
      setUnitCost("");
      setReason("");
      if (!serverLocations) {
        fetchLocations();
      }
    }
  }, [show, fetchLocations, stockItems, serverLocations]);

  const selectedStock = stockItems.find((s) => s.locationId === locationId);
  const defaultCost =
    selectedStock && selectedStock.movingAvgCost > 0 ? selectedStock.movingAvgCost : currentCost;
  const effectiveUnitCost = unitCost === "" ? defaultCost : Number(unitCost);
  const availableQty = selectedStock?.qty ?? 0;
  const qtyNum = Number(qty) || 0;
  const lineValue = qtyNum * (direction === "IN" ? effectiveUnitCost : defaultCost);

  async function handleSubmit(e?: React.FormEvent) {
    e?.preventDefault();
    if (!locationId) {
      toast.error("Select a stock location");
      return;
    }
    if (qtyNum <= 0) {
      toast.error("Quantity must be greater than 0");
      return;
    }
    if (direction === "OUT" && qtyNum > availableQty) {
      toast.error(
        `Cannot remove ${qtyNum} ${materialUnit}: only ${formatNumber(availableQty, 3)} ${materialUnit} available`,
      );
      return;
    }
    if (!reason.trim()) {
      toast.error("A reason is required");
      return;
    }

    setSaving(true);
    try {
      const payload: Record<string, unknown> = {
        locationId,
        direction,
        qty: qtyNum,
        reason: reason.trim(),
      };
      if (direction === "IN") payload.unitCost = effectiveUnitCost;

      const res = await fetch(`/api/materials/${materialId}/adjust-stock`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(payload),
      });
      if (!res.ok) {
        const err = await res.json();
        throw new Error(err.error ?? "Failed to adjust stock");
      }
      const data = await res.json();
      const verb = direction === "IN" ? "Added" : "Removed";
      toast.success(
        `${verb} ${formatNumber(qtyNum, 3)} ${materialUnit} — new balance ${formatNumber(Number(data.newQty), 3)} ${materialUnit}`,
      );
      setShow(false);
      router.refresh();
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Failed to adjust stock");
    } finally {
      setSaving(false);
    }
  }

  return (
    <>
      <MobileFab onClick={fab.toggle} isOpen={fab.isOpen} label="Adjust stock" icon={SlidersHorizontal} />

      <MobileFabModal
        open={fab.isOpen}
        onClose={fab.close}
        originRect={fab.originRect}
        title="Adjust Stock"
      >
        <p
          className="text-m-caption mb-3"
          style={{ color: "var(--color-ink-500)" }}
        >
          {materialCode} · {materialName}
        </p>

        <form onSubmit={handleSubmit} className="flex flex-col gap-3">
          {/* Direction */}
          <div className="rounded-[0.625rem] border p-3 flex flex-col gap-3" style={{ borderColor: "var(--color-line)", backgroundColor: "var(--color-paper)" }}>
            <p className="text-m-section font-extrabold tracking-tight" style={{ color: "var(--color-ink-950)" }}>
              Direction
            </p>
            <div className="grid grid-cols-2 gap-2">
              <button
                type="button"
                onClick={() => setDirection("IN")}
                className="flex items-center justify-center gap-1.5 h-11 rounded-[0.5rem] border text-m-section font-bold press"
                style={
                  direction === "IN"
                    ? {
                        borderColor: "var(--color-go)",
                        backgroundColor: "color-mix(in srgb, var(--color-go) 12%, transparent)",
                        color: "var(--color-go)",
                      }
                    : { borderColor: "var(--color-line)", color: "var(--color-ink-500)" }
                }
              >
                <Plus className="size-4" /> Add
              </button>
              <button
                type="button"
                onClick={() => setDirection("OUT")}
                className="flex items-center justify-center gap-1.5 h-11 rounded-[0.5rem] border text-m-section font-bold press"
                style={
                  direction === "OUT"
                    ? {
                        borderColor: "var(--color-stop)",
                        backgroundColor: "color-mix(in srgb, var(--color-stop) 12%, transparent)",
                        color: "var(--color-stop)",
                      }
                    : { borderColor: "var(--color-line)", color: "var(--color-ink-500)" }
                }
              >
                <Minus className="size-4" /> Remove
              </button>
            </div>
          </div>

          {isLotTracked && direction === "IN" && (
            <div
              className="flex items-start gap-1.5 rounded-[0.5rem] p-2.5 text-m-caption"
              style={{
                backgroundColor: "color-mix(in srgb, var(--color-signal) 15%, transparent)",
                color: "var(--color-signal-dark)",
              }}
            >
              <AlertTriangle className="mt-0.5 size-3.5 shrink-0" />
              <span>
                Lot-tracked material. Opening stock for a new lot should be received via a
                purchase order or direct purchase.
              </span>
            </div>
          )}

          {/* Stock Location */}
          <div className="rounded-[0.625rem] border p-3 flex flex-col gap-3" style={{ borderColor: "var(--color-line)", backgroundColor: "var(--color-paper)" }}>
            <p className="text-m-section font-extrabold tracking-tight" style={{ color: "var(--color-ink-950)" }}>
              Stock Location
            </p>
            <div>
              <MobileSelectWithCreate
                label="Stock Location"
                value={locationId}
                onChange={setLocationId}
                options={locations.map((l) => ({
                  value: l.id,
                  label: l.name,
                  sub: l.projectName ?? undefined,
                }))}
                placeholder={locations.length === 0 ? "No locations available" : "— Select location —"}
                disabled={locLoading || locations.length === 0}
              />
            </div>

            {selectedStock && (
              <div
                className="rounded-[0.625rem] border p-3 space-y-1"
                style={{ borderColor: "var(--color-line)", backgroundColor: "var(--color-paper-2)" }}
              >
                <div className="flex items-baseline justify-between">
                  <span className="text-m-caption" style={{ color: "var(--color-ink-500)" }}>
                    Current balance
                  </span>
                  <span
                    className="text-m-body font-bold tabular-nums"
                    style={{ color: "var(--color-ink-950)" }}
                  >
                    {formatNumber(availableQty, 3)} {materialUnit}
                  </span>
                </div>
                <div className="flex items-baseline justify-between">
                  <span className="text-m-caption" style={{ color: "var(--color-ink-500)" }}>
                    Moving avg cost
                  </span>
                  <span
                    className="text-m-body font-bold tabular-nums"
                    style={{ color: "var(--color-ink-950)" }}
                  >
                    {formatCurrency(selectedStock.movingAvgCost)}
                  </span>
                </div>
              </div>
            )}
          </div>

          {/* Quantity & Cost */}
          <div className="rounded-[0.625rem] border p-3 flex flex-col gap-3" style={{ borderColor: "var(--color-line)", backgroundColor: "var(--color-paper)" }}>
            <p className="text-m-section font-extrabold tracking-tight" style={{ color: "var(--color-ink-950)" }}>
              Quantity &amp; Cost
            </p>
            {/* Qty + cost */}
            <div className="grid grid-cols-2 gap-2 divide-x" style={{ borderColor: "var(--color-line)" }}>
              <div>
                <label
                  className="block text-m-caption font-bold mb-0"
                  style={{ color: "var(--color-ink-700)" }}
                >
                  Quantity
                </label>
                <input
                  type="number"
                  step="any"
                  min="0"
                  value={qty}
                  onChange={(e) => setQty(e.target.value)}
                  placeholder="0"
                  inputMode="decimal"
                  className={inputClass}
                  style={inputStyle}
                />
              </div>
              {direction === "IN" ? (
                <div className="pl-2">
                  <label
                    className="block text-m-caption font-bold mb-0"
                    style={{ color: "var(--color-ink-700)" }}
                  >
                    Unit Cost
                  </label>
                  <input
                    type="number"
                    step="0.01"
                    min="0"
                    value={unitCost}
                    onChange={(e) => setUnitCost(e.target.value)}
                    placeholder={String(defaultCost || "")}
                    inputMode="decimal"
                    className={inputClass}
                    style={inputStyle}
                  />
                </div>
              ) : (
                <div className="pl-2">
                  <label
                    className="block text-m-caption font-bold mb-0"
                    style={{ color: "var(--color-ink-700)" }}
                  >
                    Value
                  </label>
                  <div
                    className="h-10 flex items-center px-3 rounded-[0.5rem] border text-m-section tabular-nums"
                    style={{
                      borderColor: "var(--color-line)",
                      backgroundColor: "var(--color-paper-2)",
                      color: "var(--color-ink-700)",
                    }}
                  >
                    {formatCurrency(lineValue)}
                  </div>
                </div>
              )}
            </div>

            {qtyNum > 0 && (
              <div
                className="flex items-baseline justify-between rounded-[0.625rem] border p-3"
                style={{ borderColor: "var(--color-line)", backgroundColor: "var(--color-paper-2)" }}
              >
                <span className="text-m-caption" style={{ color: "var(--color-ink-500)" }}>
                  Line value
                </span>
                <span
                  className="text-m-body font-bold tabular-nums"
                  style={{ color: "var(--color-ink-950)" }}
                >
                  {formatCurrency(lineValue)}
                </span>
              </div>
            )}
          </div>

          {/* Reason */}
          <div className="rounded-[0.625rem] border p-3 flex flex-col gap-3" style={{ borderColor: "var(--color-line)", backgroundColor: "var(--color-paper)" }}>
            <p className="text-m-section font-extrabold tracking-tight" style={{ color: "var(--color-ink-950)" }}>
              Reason
            </p>
            <div>
              <label
                className="block text-m-caption font-bold mb-0"
                style={{ color: "var(--color-ink-700)" }}
              >
                Reason
              </label>
              <input
                type="text"
                value={reason}
                onChange={(e) => setReason(e.target.value)}
                placeholder={direction === "IN" ? "e.g. Opening stock entry" : "e.g. Damaged / write-off"}
                maxLength={500}
                className="w-full h-7 px-1 text-m-caption outline-none border-b focus:border-b-2 transition-colors"
                style={inputStyle}
              />
            </div>
          </div>

          {/* ══════ STICKY BOTTOM ACTION BAR ══════ */}
          <div
            className="sticky bottom-0 left-0 right-0 z-20 border-t -mx-4 -mb-4 px-4 py-2"
            style={{
              backgroundColor: "var(--color-paper)",
              borderColor: "var(--color-line)",
            }}
          >
            <div className="flex items-center gap-3">
              <button
                type="button"
                onClick={() => setShow(false)}
                disabled={saving}
                className="flex-1 h-11 rounded-[0.5rem] border text-m-section font-bold text-m-body press"
                style={{ borderColor: "var(--color-line)", color: "var(--color-ink-700)" }}
              >
                Cancel
              </button>
              <button
                type="submit"
                disabled={saving}
                className="flex-1 h-11 rounded-[0.5rem] text-m-section font-bold text-m-body press flex items-center justify-center gap-1.5"
                style={
                  direction === "IN"
                    ? { backgroundColor: "var(--color-go)", color: "var(--color-paper)" }
                    : { backgroundColor: "var(--color-stop)", color: "var(--color-paper)" }
                }
              >
                {saving ? (
                  <Loader2 className="size-4 animate-spin" />
                ) : direction === "IN" ? (
                  <>
                    <Plus className="size-4" /> Add
                  </>
                ) : (
                  <>
                    <Minus className="size-4" /> Remove
                  </>
                )}
              </button>
            </div>
          </div>
        </form>
      </MobileFabModal>
    </>
  );
}

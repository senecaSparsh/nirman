"use client";

import { useEffect, useState, useMemo, useRef } from "react";
import { useRouter } from "next/navigation";
import {
  Plus, Trash2, Loader2, CheckCircle2,
  Package, Send, TrendingUp, TrendingDown,
  WifiOff,
} from "lucide-react";
import { formatNumber } from "@/lib/utils";
import { toast } from "sonner";
import { useLongPressNav } from "@/lib/use-long-press-nav";
import { useOfflineQueue } from "@/lib/offline/use-offline-queue";
import { useDrafts } from "@/lib/offline/use-drafts";
import { DraftBanner } from "@/components/mobile/draft-banner";
import { ScanButton } from "@/components/mobile/v2/scan-button";
import { MobileEmptyState } from "@/components/mobile/v2/primitives";
import { SelectorCard, SelectorModal } from "@/components/mobile/v2/form-primitives";

interface LocationItem { id: string; name: string; type: string; }
interface StockItem {
  materialId: string;
  materialName: string;
  materialCode: string;
  barcode?: string | null;
  unit: string;
  qty: number;
}

interface CountLine {
  materialId: string;
  materialName: string;
  materialCode: string;
  unit: string;
  systemQty: number;
  countedQty: string;
}

interface StockCountDraftLine {
  materialId: string;
  countedQty: string;
}

interface StockCountDraft {
  locationId: string;
  notes: string;
  lines: StockCountDraftLine[];
}

export default function MobileNewStockCountClient({ onClose, onCreated }: { onClose?: () => void; onCreated?: (id: string) => void } = {}) {
  const router = useRouter();
  const { online, enqueue } = useOfflineQueue();
  const submitLongPress = useLongPressNav("/m/stock?tab=counts", "Stock counts list");
  const [locations, setLocations] = useState<LocationItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [submitting, setSubmitting] = useState(false);

  const [locationId, setLocationId] = useState("");
  const [stock, setStock] = useState<StockItem[]>([]);
  const [lines, setLines] = useState<CountLine[]>([]);
  const [notes, setNotes] = useState("");
  const [showLocationModal, setShowLocationModal] = useState(false);
  const [showMaterialModal, setShowMaterialModal] = useState(false);
  const [stockLoading, setStockLoading] = useState(false);

  const [success, setSuccess] = useState<{ id: string } | null>(null);

  // Draft auto-save
  const { draft, hasDraft, draftUpdatedAt, saveDraft, clearDraft } = useDrafts<StockCountDraft>(
    "stock-count",
    "stock-count-new",
  );
  const [draftRestored, setDraftRestored] = useState(false);
  const pendingDraftLinesRef = useRef<StockCountDraftLine[] | null>(null);

  // Load locations
  useEffect(() => {
    let cancelled = false;
    async function loadLocations() {
      try {
        const res = await fetch("/api/stock-locations");
        const data = await res.ok ? await res.json() : [];
        if (cancelled) return;
        if (Array.isArray(data)) {
          setLocations(data);
          if (data.length > 0) setLocationId(data[0].id);
        }
      } catch (err) {
        console.error("Failed to load locations:", err);
      } finally {
        if (!cancelled) setLoading(false);
      }
    }
    loadLocations();
    return () => { cancelled = true; };
  }, []);

  // Load stock when location changes
  useEffect(() => {
    if (!locationId) return;
    let cancelled = false;
    setStockLoading((prev) => (prev ? prev : true));
    async function loadStock() {
      try {
        const res = await fetch(`/api/stock/available?locationId=${locationId}`);
        const data = await res.ok ? await res.json() : [];
        if (cancelled) return;
        if (Array.isArray(data)) {
          setStock(data);
          // Pre-fill lines with all materials at this location, counted qty empty
          const newLines = data.map((item: StockItem) => ({
            materialId: item.materialId,
            materialName: item.materialName,
            materialCode: item.materialCode,
            unit: item.unit,
            systemQty: item.qty,
            countedQty: "",
          }));
          // If restoring a draft, merge saved counted quantities after stock reload
          const pending = pendingDraftLinesRef.current;
          if (pending) {
            for (const line of newLines) {
              const dl = pending.find((d) => d.materialId === line.materialId);
              if (dl) line.countedQty = dl.countedQty;
            }
            pendingDraftLinesRef.current = null;
          }
          setLines(newLines);
        }
      } catch (err) {
        console.error("Failed to load stock:", err);
      } finally {
        if (!cancelled) setStockLoading(false);
      }
    }
    loadStock();
    return () => { cancelled = true; };
  }, [locationId]);

  // Auto-save draft
  useEffect(() => {
    if (loading || stockLoading || success) return;
    saveDraft({
      locationId,
      notes,
      lines: lines.map((l) => ({ materialId: l.materialId, countedQty: l.countedQty })),
    });
  }, [locationId, notes, lines, loading, stockLoading, success, saveDraft]);

  function restoreDraftState() {
    if (!draft) return;
    pendingDraftLinesRef.current = draft.lines;
    if (draft.locationId !== locationId) {
      // Changing location triggers stock reload; pending lines merged after load
      setLocationId(draft.locationId);
    } else {
      // Same location — apply counted quantities immediately
      setLines((prev) =>
        prev.map((l) => {
          const dl = draft.lines.find((d) => d.materialId === l.materialId);
          return dl ? { ...l, countedQty: dl.countedQty } : l;
        }),
      );
      pendingDraftLinesRef.current = null;
    }
    setNotes(draft.notes);
    setDraftRestored(true);
  }

  const selectedLocation = locations.find((l) => l.id === locationId);

  const handleLineChange = (materialId: string, countedQty: string) => {
    setLines((prev) =>
      prev.map((l) => l.materialId === materialId ? { ...l, countedQty } : l),
    );
  };

  const handleRemoveLine = (materialId: string) => {
    setLines((prev) => prev.filter((l) => l.materialId !== materialId));
  };

  const handleAddMaterial = (material: StockItem) => {
    // Don't add duplicates
    if (lines.some((l) => l.materialId === material.materialId)) {
      toast.error("Material already in count");
      return;
    }
    setLines((prev) => [
      ...prev,
      {
        materialId: material.materialId,
        materialName: material.materialName,
        materialCode: material.materialCode,
        unit: material.unit,
        systemQty: material.qty,
        countedQty: "",
      },
    ]);
  };

  // Scan barcode → find matching material in stock → add to count + focus qty
  const handleScan = (code: string) => {
    const matched = stock.find(
      (s) => s.barcode === code || s.materialCode === code,
    );
    if (!matched) {
      toast.error(`No material found for barcode: ${code}`);
      return;
    }
    if (lines.some((l) => l.materialId === matched.materialId)) {
      // Already in count — focus its qty input
      toast.info(`${matched.materialName} already in count`);
      return;
    }
    handleAddMaterial(matched);
    toast.success(`Added: ${matched.materialName}`);
  };

  // Calculate variances
  const varianceSummary = useMemo(() => {
    let counted = 0;
    let mismatches = 0;
    let netVariance = 0;
    for (const l of lines) {
      const cq = Number(l.countedQty) || 0;
      if (l.countedQty !== "") counted++;
      const v = cq - l.systemQty;
      if (v > 0.001 || v < -0.001) {
        mismatches++;
        netVariance += v;
      }
    }
    return { counted, mismatches, netVariance, total: lines.length };
  }, [lines]);

  const handleSubmit = async () => {
    if (!locationId) {
      toast.error("Please select a location");
      return;
    }

    const validLines = lines.filter((l) => l.countedQty !== "" && Number(l.countedQty) >= 0);
    if (validLines.length === 0) {
      toast.error("Enter counted quantity for at least one material");
      return;
    }

    setSubmitting(true);
    try {
      const payload = {
        locationId,
        notes: notes || null,
        lines: validLines.map((l) => ({
          materialId: l.materialId,
          countedQty: Number(l.countedQty),
        })),
      };

      // Offline: queue for later sync
      if (!online) {
        await enqueue("stock-count", payload);
        if (typeof navigator !== "undefined" && navigator.vibrate) {
          navigator.vibrate(10);
        }
        toast.success("Stock inventory queued offline", {
          description: "Will sync when back online",
        });
        clearDraft();
        setSuccess({ id: "QUEUED" });
        return;
      }

      const res = await fetch("/api/stock-counts", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(payload),
      });

      if (!res.ok) {
        const err = await res.json().catch(() => ({}));
        throw new Error(err.error ?? "Failed to create stock inventory");
      }

      const data = await res.json();
      clearDraft();
      setSuccess({ id: data.id });
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Failed to create stock inventory");
    } finally {
      setSubmitting(false);
    }
  };

  /* ── Success state ── */
  if (success) {
    const isQueued = success.id === "QUEUED";
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
          {isQueued ? "Stock Inventory Queued" : "Stock Inventory Created"}
        </p>
        {isQueued ? (
          <p className="text-m-body mb-4" style={{ color: "var(--color-ink-700)" }}>
            Will sync when back online
          </p>
        ) : (
          <p className="text-m-body mb-4" style={{ color: "var(--color-ink-700)" }}>
            {varianceSummary.counted} items counted · {varianceSummary.mismatches} mismatches
          </p>
        )}
        <div className="flex flex-col gap-3">
          {!isQueued && (
            <button
              onClick={() => {
                if (onCreated) {
                  onCreated(success.id);
                } else {
                  router.refresh();
                  router.push(`/m/stock-counts/${success.id}`);
                }
              }}
              className="rounded-[0.5rem] px-4 py-2 text-m-body font-bold text-m-body press"
              style={{ backgroundColor: "var(--color-ink-950)", color: "var(--color-paper)" }}
            >
              View Count
            </button>
          )}
          <button
            onClick={() => {
              setSuccess(null);
              setNotes("");
              setLines(stock.map((item) => ({
                materialId: item.materialId,
                materialName: item.materialName,
                materialCode: item.materialCode,
                unit: item.unit,
                systemQty: item.qty,
                countedQty: "",
              })));
            }}
            className="rounded-[0.5rem] px-4 py-2 text-m-body font-bold border text-m-body press"
            style={{ borderColor: "var(--color-line)", backgroundColor: "transparent", color: "var(--color-ink-950)" }}
          >
            New Count
          </button>
        </div>
      </div>
    );
  }

  /* ── Loading state ── */
  if (loading) {
    return (
      <div className="flex flex-col items-center justify-center py-12">
        <Loader2 className="size-6 animate-spin" style={{ color: "var(--color-ink-700)" }} />
        <p className="text-m-body mt-2" style={{ color: "var(--color-ink-700)" }}>Loading…</p>
      </div>
    );
  }

  return (
    <>
      {hasDraft && !draftRestored && !success && (
        <DraftBanner
          formName="Stock Inventory"
          updatedAt={draftUpdatedAt}
          onRestore={restoreDraftState}
          onDiscard={() => { clearDraft(); setDraftRestored(true); }}
        />
      )}
      <div className="pb-32">

      {/* ── Location selector ── */}
      <div
        className="rounded-[0.625rem] border p-3 flex flex-col gap-3 mb-3"
        style={{ borderColor: "var(--color-line)", backgroundColor: "var(--color-paper)" }}
      >
        <p className="text-m-section font-extrabold tracking-tight" style={{ color: "var(--color-ink-950)" }}>
          Location
        </p>

        <SelectorCard
          onClick={() => setShowLocationModal(true)}
          label="Stock Location"
          value={selectedLocation?.name}
          required
        />
      </div>

      {/* ── Line items ── */}
      <div
        className="rounded-[0.625rem] border p-3 flex flex-col gap-3 mb-3"
        style={{ borderColor: "var(--color-line)", backgroundColor: "var(--color-paper)" }}
      >
        <p className="text-m-section font-extrabold tracking-tight" style={{ color: "var(--color-ink-950)" }}>
          Count Items ({lines.length})
        </p>

        {stockLoading ? (
        <div className="flex flex-col items-center justify-center py-6">
          <Loader2 className="size-5 animate-spin" style={{ color: "var(--color-ink-700)" }} />
          <p className="text-m-body mt-2" style={{ color: "var(--color-ink-700)" }}>Loading stock…</p>
        </div>
      ) : lines.length === 0 ? (
        <MobileEmptyState
          icon={Package}
          title="No stock at this location"
          description="Select a different location"
          size="compact"
        />
      ) : (
        <div className="flex flex-col gap-3.5">
          {lines.map((line) => {
            const counted = Number(line.countedQty) || 0;
            const variance = line.countedQty === "" ? null : counted - line.systemQty;
            const hasVariance = variance !== null && (variance > 0.001 || variance < -0.001);
            const varianceColor = variance === null ? "var(--color-ink-500)"
              : variance < 0 ? "var(--color-stop)"
              : variance > 0 ? "var(--color-signal)"
              : "var(--color-go)";
            const VarianceIcon = variance === null ? null
              : variance > 0 ? TrendingUp
              : variance < 0 ? TrendingDown
              : CheckCircle2;

            return (
              <div
                key={line.materialId}
                className="rounded-[0.5rem] border p-2"
                style={{
                  borderColor: hasVariance ? `color-mix(in srgb, ${varianceColor} 25%, var(--color-line))` : "var(--color-line)",
                  backgroundColor: hasVariance ? `color-mix(in srgb, ${varianceColor} 4%, var(--color-paper))` : "var(--color-paper)",
                }}
              >
                  {/* Material name + remove */}
                  <div className="flex items-center justify-between mb-1.5">
                    <div className="min-w-0 flex-1">
                      <p className="text-m-body font-bold truncate" style={{ color: "var(--color-ink-500)" }}>
                        {line.materialName}
                      </p>
                      <p className="text-m-caption" style={{ color: "var(--color-ink-700)" }}>
                        {line.materialCode} · sys: {formatNumber(line.systemQty, 0)} {line.unit}
                      </p>
                    </div>
                    <button
                      type="button"
                      onClick={() => handleRemoveLine(line.materialId)}
                      className="shrink-0 text-m-body press"
                    >
                      <Trash2 className="size-3" style={{ color: "var(--color-stop)" }} />
                    </button>
                  </div>

                  {/* Counted qty input + variance */}
                  <div className="flex items-end gap-1">
                    <div className="flex-1">
                      <label className="block text-m-caption font-bold mb-0" style={{ color: "var(--color-ink-700)" }}>
                        Counted ({line.unit})
                      </label>
                      <input
                        type="text" inputMode="decimal"
                        step="any"
                        min="0"
                        value={line.countedQty}
                        onChange={(e) => handleLineChange(line.materialId, e.target.value)}
                        placeholder={String(line.systemQty)}
                        className="w-full h-7 px-1 text-m-caption font-bold tabular-nums outline-none border-b focus:border-b-2 transition-colors"
                        style={{ borderColor: "var(--color-line)", backgroundColor: "transparent", color: "var(--color-ink-950)" }}
                      />
                    </div>
                    {VarianceIcon ? (
                      <div className="shrink-0 flex items-center gap-1.5 pb-1">
                        <VarianceIcon className="size-3" style={{ color: varianceColor }} />
                        <span
                          className="text-m-caption font-bold tabular-nums"
                          style={{ color: varianceColor }}
                        >
                          {variance! > 0 ? "+" : ""}{formatNumber(variance!, 0)}
                        </span>
                      </div>
                    ) : null}
                  </div>
              </div>
            );
          })}
        </div>
      )}

      {/* Add material + optional scan */}
      {stock.length > 0 ? (
        <div className="flex items-center gap-1 mt-2">
          <button
            type="button"
            onClick={() => setShowMaterialModal(true)}
            className="flex-1 flex items-center justify-center gap-1 rounded-[0.375rem] border border-dashed py-2 text-m-body press"
            style={{ borderColor: "var(--color-line)", color: "var(--color-ink-700)" }}
          >
            <Plus className="size-3" />
            <span className="text-m-label font-semibold">Add material</span>
          </button>
          <ScanButton onScan={handleScan} label="Scan" />
        </div>
      ) : null}

      {/* ── Notes ── */}
      <div className="mt-3">
        <label className="block text-m-caption font-bold mb-0" style={{ color: "var(--color-ink-700)" }}>
          Notes (optional)
        </label>
        <textarea
          value={notes}
          onChange={(e) => setNotes(e.target.value)}
          placeholder="e.g. Monthly verification — cement bags damaged"
          rows={2}
          className="w-full h-7 px-1 text-m-caption outline-none border-b focus:border-b-2 transition-colors resize-none"
          style={{ borderColor: "var(--color-line)", backgroundColor: "transparent", color: "var(--color-ink-950)" }}
        />
      </div>
      </div>

      {/* ── STICKY BOTTOM BAR: summary + submit ── */}
      <div
        className="sticky bottom-0 left-0 right-0 z-20 border-t"
        style={{
          backgroundColor: "var(--color-paper)",
          borderColor: "var(--color-line)",
        }}
      >
        <div className="flex items-center justify-between gap-3 px-1 py-2">
          {/* Summary */}
          <div className="shrink-0">
            <p className="text-m-caption font-semibold uppercase tracking-wide" style={{ color: "var(--color-ink-700)" }}>
              {varianceSummary.counted}/{varianceSummary.total} counted
            </p>
            <p
              className="text-m-section font-bold tabular-nums"
              style={{
                color: varianceSummary.mismatches > 0
                  ? (varianceSummary.netVariance < 0 ? "var(--color-stop)" : "var(--color-signal)")
                  : "var(--color-go)",
              }}
            >
              {varianceSummary.mismatches > 0
                ? `${varianceSummary.mismatches} mismatch${varianceSummary.mismatches !== 1 ? "es" : ""}`
                : "all match"
              }
            </p>
            {varianceSummary.mismatches > 0 ? (
              <p className="text-m-caption" style={{ color: "var(--color-ink-700)" }}>
                net Δ {varianceSummary.netVariance > 0 ? "+" : ""}{formatNumber(varianceSummary.netVariance, 0)}
              </p>
            ) : null}
          </div>

          {/* Submit */}
          <button
            type="button"
            onClick={() => { if (submitLongPress.wasLongPress()) return; handleSubmit(); }}
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
                <span>{online ? "Create Count" : "Queue Count (Offline)"}</span>
              </>
            )}
          </button>
        </div>
      </div>

      {/* ── Location selector modal ── */}
      {showLocationModal ? (
        <SelectorModal
          title="Select Location"
          items={locations.map((l) => ({
            id: l.id,
            label: l.name,
            sub: l.type.replace(/_/g, " ").toLowerCase(),
          }))}
          selectedId={locationId}
          onSelect={(id) => {
            setLocationId(id);
            setShowLocationModal(false);
          }}
          onClose={() => setShowLocationModal(false)}
        />
      ) : null}

      {/* ── Material selector modal ── */}
      {showMaterialModal ? (
        <SelectorModal
          title="Add Material"
          items={stock
            .filter((s) => !lines.some((l) => l.materialId === s.materialId))
            .map((s) => ({
              id: s.materialId,
              label: s.materialName,
              sub: `${s.materialCode} · ${formatNumber(s.qty, 0)} ${s.unit} in stock`,
            }))}
          selectedId=""
          onSelect={(id) => {
            const item = stock.find((s) => s.materialId === id);
            if (item) handleAddMaterial(item);
            setShowMaterialModal(false);
          }}
          onClose={() => setShowMaterialModal(false)}
        />
      ) : null}
    </div>
    </>
  );
}

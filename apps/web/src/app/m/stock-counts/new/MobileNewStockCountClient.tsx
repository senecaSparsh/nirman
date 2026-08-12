"use client";

import { useEffect, useState, useMemo } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import {
  Plus, Trash2, Loader2, ChevronLeft, CheckCircle2, ScanLine,
  Search, X, ChevronRight, MapPin, Package, Send, TrendingUp, TrendingDown,
} from "lucide-react";
import { formatNumber } from "@/lib/utils";
import { toast } from "sonner";

interface LocationItem { id: string; name: string; type: string; }
interface StockItem {
  materialId: string;
  materialName: string;
  materialCode: string;
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

export default function MobileNewStockCountClient() {
  const router = useRouter();
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
          setLines(
            data.map((item: StockItem) => ({
              materialId: item.materialId,
              materialName: item.materialName,
              materialCode: item.materialCode,
              unit: item.unit,
              systemQty: item.qty,
              countedQty: "",
            })),
          );
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
      const res = await fetch("/api/stock-counts", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          locationId,
          notes: notes || null,
          lines: validLines.map((l) => ({
            materialId: l.materialId,
            countedQty: Number(l.countedQty),
          })),
        }),
      });

      if (!res.ok) {
        const err = await res.json().catch(() => ({}));
        throw new Error(err.error ?? "Failed to create stock count");
      }

      const data = await res.json();
      setSuccess({ id: data.id });
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Failed to create stock count");
    } finally {
      setSubmitting(false);
    }
  };

  /* ── Success state ── */
  if (success) {
    return (
      <div className="flex flex-col items-center justify-center py-12 px-4 text-center">
        <div
          className="grid place-items-center size-14 rounded-full mb-3"
          style={{ backgroundColor: "color-mix(in srgb, var(--color-go) 12%, transparent)" }}
        >
          <CheckCircle2 className="size-7" style={{ color: "var(--color-go)" }} />
        </div>
        <p className="text-[0.875rem] font-bold mb-1" style={{ color: "var(--color-ink-950)" }}>
          Stock Count Created
        </p>
        <p className="text-[0.6875rem] mb-4" style={{ color: "var(--color-ink-500)" }}>
          {varianceSummary.counted} items counted · {varianceSummary.mismatches} mismatches
        </p>
        <div className="flex gap-2">
          <button
            onClick={() => {
              router.refresh();
              router.push(`/m/stock-counts/${success.id}`);
            }}
            className="rounded-[0.5rem] px-4 py-2 text-[0.6875rem] font-bold press"
            style={{ backgroundColor: "var(--color-ink-950)", color: "#fff" }}
          >
            View Count
          </button>
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
            className="rounded-[0.5rem] px-4 py-2 text-[0.6875rem] font-bold border press"
            style={{ borderColor: "var(--color-line)", backgroundColor: "var(--color-paper)", color: "var(--color-ink-950)" }}
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
        <Loader2 className="size-6 animate-spin" style={{ color: "var(--color-ink-500)" }} />
        <p className="text-[0.6875rem] mt-2" style={{ color: "var(--color-ink-500)" }}>Loading…</p>
      </div>
    );
  }

  return (
    <div className="pb-32">
      {/* ── Header ── */}
      <div className="flex items-center gap-2 mb-3">
        <Link href="/m/stock-counts" className="shrink-0">
          <ChevronLeft className="size-5" style={{ color: "var(--color-ink-700)" }} />
        </Link>
        <div className="flex-1 min-w-0">
          <p className="text-[0.875rem] font-bold" style={{ color: "var(--color-ink-950)" }}>
            New Stock Count
          </p>
        </div>
        <span
          className="flex items-center gap-0.5 text-[0.5rem] font-bold uppercase tracking-wide px-2 py-0.5 rounded-full shrink-0"
          style={{ color: "var(--color-signal)", backgroundColor: "color-mix(in srgb, var(--color-signal) 12%, transparent)" }}
        >
          <ScanLine className="size-2.5" />
          Count
        </span>
      </div>

      {/* ── Location selector ── */}
      <div className="flex items-center gap-1.5 mb-2">
        <MapPin className="size-3" style={{ color: "var(--color-steel)" }} />
        <span className="text-[0.5625rem] font-bold uppercase tracking-wide" style={{ color: "var(--color-steel)" }}>
          Location
        </span>
        <div className="flex-1 h-px" style={{ backgroundColor: "var(--color-line)" }} />
      </div>

      <button
        type="button"
        onClick={() => setShowLocationModal(true)}
        className="w-full flex items-center gap-2.5 rounded-[0.625rem] border p-2.5 press text-left mb-3"
        style={{
          borderColor: selectedLocation ? "var(--color-line)" : "color-mix(in srgb, var(--color-signal) 30%, var(--color-line))",
          backgroundColor: "var(--color-paper)",
        }}
      >
        <span
          className="grid place-items-center size-8 rounded-[0.5rem] shrink-0"
          style={{ backgroundColor: selectedLocation ? "var(--color-paper-2)" : "color-mix(in srgb, var(--color-signal) 8%, transparent)" }}
        >
          <MapPin
            className="size-4"
            style={{ color: selectedLocation ? "var(--color-ink-700)" : "var(--color-signal)" }}
          />
        </span>
        <div className="min-w-0 flex-1">
          <p className="text-[0.4375rem] font-semibold uppercase tracking-wide" style={{ color: "var(--color-ink-500)" }}>
            Stock Location
          </p>
          {selectedLocation ? (
            <p className="text-[0.75rem] font-bold truncate" style={{ color: "var(--color-ink-950)" }}>
              {selectedLocation.name}
            </p>
          ) : (
            <p className="text-[0.75rem] font-medium" style={{ color: "var(--color-ink-500)" }}>
              Tap to select…
            </p>
          )}
        </div>
        <ChevronRight className="size-4 shrink-0" style={{ color: "var(--color-ink-500)" }} />
      </button>

      {/* ── Line items ── */}
      <div className="flex items-center gap-1.5 mb-2">
        <Package className="size-3" style={{ color: "var(--color-steel)" }} />
        <span className="text-[0.5625rem] font-bold uppercase tracking-wide" style={{ color: "var(--color-steel)" }}>
          Count Items ({lines.length})
        </span>
        <div className="flex-1 h-px" style={{ backgroundColor: "var(--color-line)" }} />
      </div>

      {stockLoading ? (
        <div className="flex flex-col items-center justify-center py-6">
          <Loader2 className="size-5 animate-spin" style={{ color: "var(--color-ink-500)" }} />
          <p className="text-[0.6875rem] mt-2" style={{ color: "var(--color-ink-500)" }}>Loading stock…</p>
        </div>
      ) : lines.length === 0 ? (
        <div
          className="flex flex-col items-center justify-center rounded-[0.5rem] border py-6 text-center"
          style={{ borderColor: "var(--color-line)", backgroundColor: "var(--color-paper-2)" }}
        >
          <Package className="size-5 mb-1.5" style={{ color: "var(--color-ink-300)" }} />
          <p className="text-[0.6875rem] font-semibold" style={{ color: "var(--color-ink-700)" }}>
            No stock at this location
          </p>
          <p className="text-[0.5625rem]" style={{ color: "var(--color-ink-500)" }}>
            Select a different location
          </p>
        </div>
      ) : (
        <div className="flex flex-col gap-1.5">
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
                className="rounded-[0.5rem] border overflow-hidden"
                style={{
                  borderColor: hasVariance ? `color-mix(in srgb, ${varianceColor} 25%, var(--color-line))` : "var(--color-line)",
                  backgroundColor: hasVariance ? `color-mix(in srgb, ${varianceColor} 4%, var(--color-paper))` : "var(--color-paper)",
                }}
              >
                <div className="p-2">
                  {/* Material name + remove */}
                  <div className="flex items-center justify-between mb-1.5">
                    <div className="min-w-0 flex-1">
                      <p className="text-[0.6875rem] font-bold truncate" style={{ color: "var(--color-ink-950)" }}>
                        {line.materialName}
                      </p>
                      <p className="text-[0.5rem]" style={{ color: "var(--color-ink-500)" }}>
                        {line.materialCode} · sys: {formatNumber(line.systemQty, 0)} {line.unit}
                      </p>
                    </div>
                    <button
                      type="button"
                      onClick={() => handleRemoveLine(line.materialId)}
                      className="shrink-0 press"
                    >
                      <Trash2 className="size-3" style={{ color: "var(--color-stop)" }} />
                    </button>
                  </div>

                  {/* Counted qty input + variance */}
                  <div className="flex items-center gap-2">
                    <div className="flex-1">
                      <label className="text-[0.375rem] font-semibold uppercase block mb-0.5" style={{ color: "var(--color-ink-500)" }}>
                        Counted ({line.unit})
                      </label>
                      <input
                        type="number"
                        step="any"
                        min="0"
                        value={line.countedQty}
                        onChange={(e) => handleLineChange(line.materialId, e.target.value)}
                        placeholder={String(line.systemQty)}
                        className="w-full rounded-[0.375rem] border px-2 py-1.5 text-[0.6875rem] font-bold tabular-nums outline-none"
                        style={{ borderColor: "var(--color-line)", backgroundColor: "var(--color-paper)", color: "var(--color-ink-950)" }}
                      />
                    </div>
                    {VarianceIcon ? (
                      <div className="shrink-0 flex items-center gap-0.5 pt-4">
                        <VarianceIcon className="size-3" style={{ color: varianceColor }} />
                        <span
                          className="text-[0.5625rem] font-bold tabular-nums"
                          style={{ color: varianceColor }}
                        >
                          {variance! > 0 ? "+" : ""}{formatNumber(variance!, 0)}
                        </span>
                      </div>
                    ) : null}
                  </div>
                </div>
              </div>
            );
          })}
        </div>
      )}

      {/* Add material button */}
      {stock.length > 0 ? (
        <button
          type="button"
          onClick={() => setShowMaterialModal(true)}
          className="flex items-center justify-center gap-1 w-full rounded-[0.375rem] border border-dashed py-2 mt-2 press"
          style={{ borderColor: "var(--color-line)", color: "var(--color-ink-700)" }}
        >
          <Plus className="size-3" />
          <span className="text-[0.625rem] font-semibold">Add material</span>
        </button>
      ) : null}

      {/* ── Notes ── */}
      <div className="mt-3">
        <label className="text-[0.5625rem] font-semibold block mb-1" style={{ color: "var(--color-ink-500)" }}>
          Notes (optional)
        </label>
        <textarea
          value={notes}
          onChange={(e) => setNotes(e.target.value)}
          placeholder="e.g. Monthly verification — cement bags damaged"
          rows={2}
          className="w-full rounded-[0.375rem] border px-2.5 py-2 text-[0.75rem] font-medium outline-none resize-none"
          style={{ borderColor: "var(--color-line)", backgroundColor: "var(--color-paper)", color: "var(--color-ink-950)" }}
        />
      </div>

      {/* ── STICKY BOTTOM BAR: summary + submit ── */}
      <div
        className="fixed left-0 right-0 z-30 border-t backdrop-blur-sm"
        style={{
          bottom: "calc(3.5rem + max(env(safe-area-inset-bottom), 0px))",
          backgroundColor: "color-mix(in srgb, var(--color-paper) 97%, transparent)",
          borderColor: "var(--color-line)",
        }}
      >
        <div className="max-w-md mx-auto px-3.5 py-2 flex items-center gap-3">
          {/* Summary */}
          <div className="shrink-0">
            <p className="text-[0.4375rem] font-semibold uppercase tracking-wide" style={{ color: "var(--color-ink-500)" }}>
              {varianceSummary.counted}/{varianceSummary.total} counted
            </p>
            <p
              className="text-[0.875rem] font-bold tabular-nums"
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
              <p className="text-[0.4375rem]" style={{ color: "var(--color-ink-500)" }}>
                net Δ {varianceSummary.netVariance > 0 ? "+" : ""}{formatNumber(varianceSummary.netVariance, 0)}
              </p>
            ) : null}
          </div>

          {/* Submit */}
          <button
            type="button"
            onClick={handleSubmit}
            disabled={submitting}
            className="flex-1 flex items-center justify-center gap-1.5 rounded-[0.5rem] py-2.5 text-[0.75rem] font-bold press disabled:opacity-50"
            style={{ backgroundColor: "var(--color-ink-950)", color: "#fff" }}
          >
            {submitting ? (
              <Loader2 className="size-4 animate-spin" />
            ) : (
              <>
                <Send className="size-3.5" />
                <span>Create Count</span>
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
  );
}

/* ═══════════════════════════════════════════════════════════
 * Selector modal — bottom-sheet with searchable list
 * ═══════════════════════════════════════════════════════════ */
function SelectorModal({
  title, items, selectedId, onSelect, onClose,
}: {
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

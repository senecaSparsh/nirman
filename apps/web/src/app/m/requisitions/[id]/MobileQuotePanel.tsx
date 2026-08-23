"use client";

import { useState, useEffect, useCallback, useMemo } from "react";
import { toast } from "sonner";
import {
  Plus, Trophy, AlertTriangle, CheckCircle2, Loader2,
  Crown, FileText, Upload, X, Trash2, ShieldCheck,
} from "lucide-react";
import { formatCurrency, formatDate } from "@/lib/utils";
import { haptic } from "@/lib/haptic";
import { MobileNewSupplierDialog } from "@/app/m/suppliers/MobileNewSupplierDialog";
import type { ComparativeStatement, VendorQuoteRow } from "@/lib/types";

type SupplierOption = { id: string; name: string };
type RequisitionLine = {
  materialId: string;
  materialCode: string;
  materialName: string;
  unit: string;
  qtyRequested: number;
};

/**
 * Mobile quote panel — combined upload + comparative statement + winner selection.
 * Renders inline on the requisition detail page. No redirection.
 *
 * Layout:
 *  1. Status bar (X/N quotes, gate satisfied, winner badge)
 *  2. Quote cards (sorted by landed total, cheapest first)
 *  3. Upload button → bottom-sheet form
 *  4. Waive button (approver only)
 */
export function MobileQuotePanel({
  requisitionId,
  reqNumber,
  requisitionLines,
  suppliers,
  canApprove,
  canCreate,
  onWinnerSelected,
}: {
  requisitionId: string;
  reqNumber: string;
  requisitionLines: RequisitionLine[];
  suppliers: SupplierOption[];
  canApprove: boolean;
  canCreate: boolean;
  onWinnerSelected?: () => void;
}) {
  const [statement, setStatement] = useState<ComparativeStatement | null>(null);
  const [loading, setLoading] = useState(true);
  const [uploadOpen, setUploadOpen] = useState(false);
  const [waiveOpen, setWaiveOpen] = useState(false);
  const [waiveReason, setWaiveReason] = useState("");
  const [waiving, setWaiving] = useState(false);
  const [selectingId, setSelectingId] = useState<string | null>(null);

  const fetchStatement = useCallback(async () => {
    try {
      const res = await fetch(`/api/quotes?requisitionId=${requisitionId}`);
      const data = await res.json();
      if (!res.ok) throw new Error(data.error);
      setStatement(data);
    } catch (err: unknown) {
      toast.error(err instanceof Error ? err.message : "Failed to load quotes");
    } finally {
      setLoading(false);
    }
  }, [requisitionId]);

  useEffect(() => {
    fetchStatement();
  }, [fetchStatement]);

  async function selectWinner(quoteId: string) {
    haptic(10);
    setSelectingId(quoteId);
    try {
      const res = await fetch(`/api/quotes/${quoteId}/select`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({}),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error);
      toast.success("Winning quote selected", {
        description: "Line costs will auto-fill from this quote on conversion.",
      });
      await fetchStatement();
      onWinnerSelected?.();
    } catch (err: unknown) {
      toast.error(err instanceof Error ? err.message : "Failed");
    } finally {
      setSelectingId(null);
    }
  }

  async function deleteQuote(quoteId: string) {
    try {
      const res = await fetch(`/api/quotes/${quoteId}`, { method: "DELETE" });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error);
      toast.success("Quote removed");
      await fetchStatement();
    } catch (err: unknown) {
      toast.error(err instanceof Error ? err.message : "Failed");
    }
  }

  async function confirmWaive() {
    if (!waiveReason.trim()) return toast.error("A reason is required");
    setWaiving(true);
    try {
      const res = await fetch(`/api/requisitions/${requisitionId}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ action: "waiveQuotes", reason: waiveReason.trim() }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error);
      toast.success("Quote requirement waived");
      setWaiveOpen(false);
      setWaiveReason("");
      await fetchStatement();
    } catch (err: unknown) {
      toast.error(err instanceof Error ? err.message : "Failed");
    } finally {
      setWaiving(false);
    }
  }

  const activeQuotes = useMemo(
    () => statement?.quotes.filter((q) => q.status !== "REJECTED") ?? [],
    [statement],
  );
  const sortedQuotes = useMemo(
    () => [...activeQuotes].sort((a, b) => a.landedTotal - b.landedTotal),
    [activeQuotes],
  );

  const kpis = useMemo(() => {
    if (activeQuotes.length === 0) return null;
    const totals = activeQuotes.map((q) => q.landedTotal);
    const lowest = Math.min(...totals);
    const highest = Math.max(...totals);
    const savings = highest - lowest;
    return { lowest, highest, savings, count: activeQuotes.length };
  }, [activeQuotes]);

  if (loading) {
    return (
      <div className="flex items-center justify-center gap-2 py-6 text-[0.6875rem]" style={{ color: "var(--color-ink-500)" }}>
        <Loader2 className="size-4 animate-spin" /> Loading quotes…
      </div>
    );
  }

  if (!statement) return null;

  const { nonRejectedCount, gateSatisfied, cheapestQuoteId, selectedQuoteId } = statement;
  const minRequired = statement.requisition.minQuotesRequired;
  const waived = statement.requisition.quotesWaived;
  const locked = statement.requisition.quotesLockedAt !== null;

  return (
    <div className="mb-5">
      {/* ── Section header ── */}
      <div className="flex items-center justify-between mb-2">
        <p className="text-[0.5625rem] font-bold uppercase tracking-wider" style={{ color: "var(--color-steel)" }}>
          Vendor Quotes
        </p>
        <div className="flex items-center gap-1.5">
          {gateSatisfied ? (
            <span
              className="flex items-center gap-0.5 text-[0.5rem] font-bold uppercase px-1.5 py-0.5 rounded"
              style={{ backgroundColor: "color-mix(in srgb, var(--color-go) 12%, transparent)", color: "var(--color-go)" }}
            >
              <CheckCircle2 className="size-2.5" />
              {waived ? "Waived" : `${nonRejectedCount}/${minRequired}`}
            </span>
          ) : (
            <span
              className="flex items-center gap-0.5 text-[0.5rem] font-bold uppercase px-1.5 py-0.5 rounded"
              style={{ backgroundColor: "color-mix(in srgb, var(--color-signal) 12%, transparent)", color: "var(--color-signal-dark)" }}
            >
              <AlertTriangle className="size-2.5" />
              {nonRejectedCount}/{minRequired}
            </span>
          )}
          {selectedQuoteId ? (
            <span
              className="flex items-center gap-0.5 text-[0.5rem] font-bold uppercase px-1.5 py-0.5 rounded"
              style={{ backgroundColor: "var(--color-go)", color: "#fff" }}
            >
              <Crown className="size-2.5" /> Winner
            </span>
          ) : null}
        </div>
      </div>

      {/* ── KPI summary ── */}
      {kpis ? (
        <div
          className="rounded-[0.5rem] border p-2.5 mb-2 grid grid-cols-3 gap-2"
          style={{ borderColor: "var(--color-line)", backgroundColor: "var(--color-paper)" }}
        >
          <div>
            <p className="text-[0.4375rem] font-semibold uppercase" style={{ color: "var(--color-ink-500)" }}>Lowest</p>
            <p className="text-[0.6875rem] font-bold tabular-nums" style={{ color: "var(--color-go)" }}>
              {formatCurrency(kpis.lowest)}
            </p>
          </div>
          <div>
            <p className="text-[0.4375rem] font-semibold uppercase" style={{ color: "var(--color-ink-500)" }}>Highest</p>
            <p className="text-[0.6875rem] font-bold tabular-nums" style={{ color: "var(--color-stop)" }}>
              {formatCurrency(kpis.highest)}
            </p>
          </div>
          <div>
            <p className="text-[0.4375rem] font-semibold uppercase" style={{ color: "var(--color-ink-500)" }}>Savings</p>
            <p className="text-[0.6875rem] font-bold tabular-nums" style={{ color: "var(--color-ink-950)" }}>
              {formatCurrency(kpis.savings)}
            </p>
          </div>
        </div>
      ) : null}

      {/* ── Quote cards ── */}
      {sortedQuotes.length > 0 ? (
        <div className="flex flex-col gap-2 mb-3">
          {sortedQuotes.map((quote, idx) => {
            const isCheapest = quote.id === cheapestQuoteId;
            const isSelected = quote.id === selectedQuoteId;
            const isSelecting = selectingId === quote.id;
            return (
              <div
                key={quote.id}
                className="rounded-[0.625rem] border overflow-hidden"
                style={{
                  borderColor: isSelected ? "var(--color-go)" : isCheapest ? "color-mix(in srgb, var(--color-go) 40%, var(--color-line))" : "var(--color-line)",
                  backgroundColor: "var(--color-paper)",
                }}
              >
                {/* Card header */}
                <div
                  className="flex items-center gap-2 px-2.5 py-2"
                  style={{
                    backgroundColor: isSelected
                      ? "color-mix(in srgb, var(--color-go) 8%, transparent)"
                      : isCheapest
                        ? "color-mix(in srgb, var(--color-go) 4%, transparent)"
                        : "var(--color-paper-2)",
                    borderBottom: "1px solid var(--color-line)",
                  }}
                >
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-1.5">
                      <span className="text-[0.6875rem] font-bold truncate" style={{ color: "var(--color-ink-950)" }}>
                        {quote.supplierName}
                      </span>
                      {isCheapest ? (
                        <span
                          className="flex items-center gap-0.5 text-[0.4375rem] font-bold uppercase px-1 py-0 rounded shrink-0"
                          style={{ backgroundColor: "color-mix(in srgb, var(--color-go) 15%, transparent)", color: "var(--color-go)" }}
                        >
                          <Trophy className="size-2" /> Cheapest
                        </span>
                      ) : null}
                      {isSelected ? (
                        <span
                          className="flex items-center gap-0.5 text-[0.4375rem] font-bold uppercase px-1 py-0 rounded shrink-0"
                          style={{ backgroundColor: "var(--color-go)", color: "#fff" }}
                        >
                          <Crown className="size-2" /> Selected
                        </span>
                      ) : null}
                    </div>
                    <p className="text-[0.5rem] tabular-nums" style={{ color: "var(--color-ink-500)" }}>
                      #{idx + 1} · {quote.submittedBy?.name ?? "—"}
                      {quote.validUntil ? ` · valid till ${formatDate(quote.validUntil)}` : ""}
                    </p>
                  </div>
                  <div className="text-right shrink-0">
                    <p className="text-[0.75rem] font-bold tabular-nums" style={{ color: isSelected ? "var(--color-go)" : "var(--color-ink-950)" }}>
                      {formatCurrency(quote.landedTotal)}
                    </p>
                    <p className="text-[0.4375rem]" style={{ color: "var(--color-ink-500)" }}>landed total</p>
                  </div>
                </div>

                {/* Card body — line breakdown */}
                <div className="px-2.5 py-2 flex flex-col gap-1">
                  {quote.lines.map((ql) => {
                    const reqLine = requisitionLines.find((l) => l.materialId === ql.materialId);
                    return (
                      <div key={ql.materialId} className="flex items-center justify-between gap-2">
                        <div className="min-w-0 flex-1">
                          <p className="text-[0.5625rem] font-semibold truncate" style={{ color: "var(--color-ink-700)" }}>
                            {reqLine?.materialName ?? ql.materialId}
                          </p>
                          <p className="text-[0.4375rem] tabular-nums" style={{ color: "var(--color-ink-500)" }}>
                            {ql.qty} {reqLine?.unit ?? ""} × {formatCurrency(ql.unitPrice)}
                            {ql.freightPerUnit > 0 ? ` + ${formatCurrency(ql.freightPerUnit)} frt` : ""}
                          </p>
                        </div>
                        <p className="text-[0.5625rem] font-bold tabular-nums shrink-0" style={{ color: "var(--color-ink-700)" }}>
                          {formatCurrency(ql.lineTotal)}
                        </p>
                      </div>
                    );
                  })}
                </div>

                {/* Card actions */}
                <div
                  className="flex items-center gap-1.5 px-2.5 py-1.5"
                  style={{ borderTop: "1px solid var(--color-line)", backgroundColor: "var(--color-paper-2)" }}
                >
                  <a
                    href={quote.fileUrl}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="flex items-center gap-1 text-[0.5625rem] font-semibold px-2 py-1 rounded press"
                    style={{ color: "var(--color-ink-700)" }}
                  >
                    <FileText className="size-3" /> View
                  </a>
                  {canApprove && !isSelected && !locked ? (
                    <button
                      type="button"
                      onClick={() => selectWinner(quote.id)}
                      disabled={isSelecting}
                      className="flex items-center gap-1 text-[0.5625rem] font-bold px-2 py-1 rounded press disabled:opacity-50"
                      style={{ backgroundColor: "var(--color-go)", color: "#fff" }}
                    >
                      {isSelecting ? <Loader2 className="size-3 animate-spin" /> : <Crown className="size-3" />}
                      Select Winner
                    </button>
                  ) : null}
                  {canCreate && !locked && !isSelected ? (
                    <button
                      type="button"
                      onClick={() => deleteQuote(quote.id)}
                      className="flex items-center gap-0.5 text-[0.5625rem] font-semibold px-1.5 py-1 rounded press ml-auto"
                      style={{ color: "var(--color-stop)" }}
                    >
                      <Trash2 className="size-3" />
                    </button>
                  ) : null}
                </div>
              </div>
            );
          })}
        </div>
      ) : (
        <div
          className="rounded-[0.5rem] border border-dashed p-4 text-center mb-3"
          style={{ borderColor: "var(--color-line)", color: "var(--color-ink-500)" }}
        >
          <p className="text-[0.6875rem] font-semibold mb-1">No quotes uploaded yet</p>
          <p className="text-[0.5625rem]">
            {minRequired} vendor quote{minRequired > 1 ? "s" : ""} required to convert to PO.
            Upload quote files from suppliers with pricing.
          </p>
        </div>
      )}

      {/* ── Action buttons ── */}
      <div className="flex items-center gap-2">
        {canCreate && !locked ? (
          <button
            type="button"
            onClick={() => { haptic(10); setUploadOpen(true); }}
            className="flex-1 flex items-center justify-center gap-1.5 rounded-[0.5rem] border border-dashed py-2.5 text-[0.6875rem] font-bold press"
            style={{ borderColor: "var(--color-signal)", color: "var(--color-signal-dark)" }}
          >
            <Plus className="size-3.5" /> Upload Quote
          </button>
        ) : null}
        {canApprove && !gateSatisfied && !waived ? (
          <button
            type="button"
            onClick={() => setWaiveOpen(true)}
            className="flex items-center justify-center gap-1.5 rounded-[0.5rem] border py-2.5 px-3 text-[0.6875rem] font-bold press"
            style={{ borderColor: "var(--color-line)", color: "var(--color-ink-700)" }}
          >
            <ShieldCheck className="size-3.5" /> Waive
          </button>
        ) : null}
      </div>

      {/* ── Waive dialog ── */}
      {waiveOpen ? (
        <WaiveDialog
          reason={waiveReason}
          setReason={setWaiveReason}
          onConfirm={confirmWaive}
          onCancel={() => setWaiveOpen(false)}
          waiving={waiving}
        />
      ) : null}

      {/* ── Upload dialog ── */}
      {uploadOpen ? (
        <MobileQuoteUploadDialog
          requisitionId={requisitionId}
          reqNumber={reqNumber}
          requisitionLines={requisitionLines}
          suppliers={suppliers}
          onUploaded={() => {
            setUploadOpen(false);
            fetchStatement();
          }}
          onClose={() => setUploadOpen(false)}
        />
      ) : null}
    </div>
  );
}

/* ═══════════════════════════════════════════════════════════
 * Mobile quote upload dialog — bottom-sheet style
 * ═══════════════════════════════════════════════════════════ */
function MobileQuoteUploadDialog({
  requisitionId,
  reqNumber,
  requisitionLines,
  suppliers,
  onUploaded,
  onClose,
}: {
  requisitionId: string;
  reqNumber: string;
  requisitionLines: RequisitionLine[];
  suppliers: SupplierOption[];
  onUploaded: () => void;
  onClose: () => void;
}) {
  const [saving, setSaving] = useState(false);
  const [uploading, setUploading] = useState(false);
  const [supplierId, setSupplierId] = useState("");
  const [localSuppliers, setLocalSuppliers] = useState<SupplierOption[]>(suppliers);
  const [showNewSupplier, setShowNewSupplier] = useState(false);
  const [supplierSearch, setSupplierSearch] = useState("");
  const [showSupplierPicker, setShowSupplierPicker] = useState(false);
  const [fileUrl, setFileUrl] = useState("");
  const [fileName, setFileName] = useState("");
  const [mimeType, setMimeType] = useState("");
  const [landedTotal, setLandedTotal] = useState("");
  const [validUntil, setValidUntil] = useState("");
  const [notes, setNotes] = useState("");
  const [linePrices, setLinePrices] = useState<Record<string, string>>({});

  const computedTotal = requisitionLines.reduce((sum, l) => {
    const price = Number(linePrices[l.materialId] ?? 0);
    return sum + l.qtyRequested * price;
  }, 0);

  const filteredSuppliers = useMemo(() => {
    if (!supplierSearch.trim()) return localSuppliers;
    const q = supplierSearch.toLowerCase();
    return localSuppliers.filter((s) => s.name.toLowerCase().includes(q));
  }, [localSuppliers, supplierSearch]);

  const selectedSupplier = localSuppliers.find((s) => s.id === supplierId);

  async function handleFileUpload(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    if (!file) return;
    setUploading(true);
    try {
      const formData = new FormData();
      formData.append("file", file);
      const res = await fetch("/api/uploads", { method: "POST", body: formData });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error ?? "Upload failed");
      setFileUrl(data.url);
      setFileName(data.fileName);
      setMimeType(data.mimeType);
      toast.success("Quote file uploaded");
    } catch (err: unknown) {
      toast.error(err instanceof Error ? err.message : "Upload failed");
    } finally {
      setUploading(false);
    }
  }

  function clearFile() {
    setFileUrl("");
    setFileName("");
    setMimeType("");
  }

  async function onSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (!supplierId) return toast.error("Select a supplier");
    if (!fileUrl) return toast.error("Upload a quote file (PDF/image)");
    if (!landedTotal && computedTotal === 0) return toast.error("Enter the landed total or line prices");

    const total = landedTotal ? Number(landedTotal) : computedTotal;
    if (total <= 0) return toast.error("Landed total must be > 0");

    setSaving(true);
    try {
      const lines = requisitionLines.map((l) => ({
        materialId: l.materialId,
        qty: l.qtyRequested,
        unitPrice: Number(linePrices[l.materialId] ?? 0),
      }));
      const res = await fetch("/api/quotes", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          requisitionId,
          supplierId,
          fileUrl,
          fileName,
          mimeType,
          landedTotal: landedTotal ? total : undefined,
          validUntil: validUntil || null,
          notes: notes.trim() || null,
          deliveryTermsType: "DELIVERED_SITE",
          lines,
        }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error ?? "Failed to upload quote");
      toast.success("Quote uploaded", {
        description: `${reqNumber} — ${selectedSupplier?.name}`,
      });
      onUploaded();
    } catch (err: unknown) {
      toast.error(err instanceof Error ? err.message : "Failed");
    } finally {
      setSaving(false);
    }
  }

  const inputClass = "w-full h-10 rounded-[0.5rem] border px-3 text-[0.75rem] outline-none";
  const inputStyle = {
    borderColor: "var(--color-line)",
    backgroundColor: "var(--color-paper)",
    color: "var(--color-ink-950)",
  };

  return (
    <>
      {/* Backdrop */}
      <div
        className="fixed inset-0 z-50 bg-black/40"
        onClick={onClose}
      />
      {/* Bottom sheet */}
      <div
        className="fixed left-0 right-0 bottom-0 z-50 max-h-[90vh] overflow-y-auto rounded-t-[1rem] border-t"
        style={{
          backgroundColor: "var(--color-paper)",
          borderColor: "var(--color-line)",
          paddingBottom: "max(env(safe-area-inset-bottom), 1rem)",
        }}
      >
        {/* Drag handle */}
        <div className="flex justify-center pt-2 pb-1">
          <div className="w-10 h-1 rounded-full" style={{ backgroundColor: "var(--color-line)" }} />
        </div>

        {/* Header */}
        <div className="flex items-center justify-between px-4 pb-2 border-b" style={{ borderColor: "var(--color-line)" }}>
          <div>
            <p className="text-[0.875rem] font-bold" style={{ color: "var(--color-ink-950)" }}>Upload Vendor Quote</p>
            <p className="text-[0.5625rem] font-mono" style={{ color: "var(--color-ink-500)" }}>{reqNumber}</p>
          </div>
          <button onClick={onClose} className="grid place-items-center size-8 rounded-[0.5rem] press" style={{ color: "var(--color-ink-500)" }}>
            <X className="size-4" />
          </button>
        </div>

        <form onSubmit={onSubmit} className="px-4 py-3 flex flex-col gap-3">
          {/* Supplier */}
          <div>
            <label className="text-[0.5625rem] font-semibold block mb-1" style={{ color: "var(--color-ink-500)" }}>
              Supplier *
            </label>
            <button
              type="button"
              onClick={() => setShowSupplierPicker(true)}
              className={inputClass}
              style={inputStyle}
            >
              {selectedSupplier ? (
                <span className="text-left">{selectedSupplier.name}</span>
              ) : (
                <span className="text-left" style={{ color: "var(--color-ink-500)" }}>Select supplier…</span>
              )}
            </button>
          </div>

          {/* File upload */}
          <div>
            <label className="text-[0.5625rem] font-semibold block mb-1" style={{ color: "var(--color-ink-500)" }}>
              Quote File (PDF/Image) *
            </label>
            {fileUrl ? (
              <div className="flex items-center gap-2 rounded-[0.5rem] border px-3 py-2" style={inputStyle}>
                <a href={fileUrl} target="_blank" rel="noopener noreferrer" className="flex-1 truncate text-[0.6875rem] font-semibold" style={{ color: "var(--color-ink-700)" }}>
                  {fileName}
                </a>
                <button type="button" onClick={clearFile} className="shrink-0" style={{ color: "var(--color-ink-500)" }}>
                  <X className="size-4" />
                </button>
              </div>
            ) : (
              <label
                className="flex cursor-pointer items-center justify-center gap-2 rounded-[0.5rem] border border-dashed py-3 text-[0.6875rem]"
                style={{ borderColor: "var(--color-line)", color: "var(--color-ink-500)" }}
              >
                {uploading ? <Loader2 className="size-4 animate-spin" /> : <Upload className="size-4" />}
                <span>{uploading ? "Uploading…" : "Choose file"}</span>
                <input type="file" accept=".pdf,image/*" className="hidden" onChange={handleFileUpload} disabled={uploading} />
              </label>
            )}
          </div>

          {/* Line prices */}
          <div>
            <label className="text-[0.5625rem] font-semibold block mb-1.5" style={{ color: "var(--color-ink-500)" }}>
              Line Prices (per unit)
            </label>
            <div className="rounded-[0.5rem] border overflow-hidden" style={{ borderColor: "var(--color-line)" }}>
              {requisitionLines.map((l, i) => (
                <div
                  key={l.materialId}
                  className="flex items-center gap-2 px-2.5 py-2"
                  style={i > 0 ? { borderTop: "1px solid var(--color-line)" } : undefined}
                >
                  <div className="min-w-0 flex-1">
                    <p className="text-[0.625rem] font-bold truncate" style={{ color: "var(--color-ink-950)" }}>{l.materialName}</p>
                    <p className="text-[0.5rem] tabular-nums" style={{ color: "var(--color-ink-500)" }}>
                      {l.qtyRequested} {l.unit}
                    </p>
                  </div>
                  <input
                    type="text"
                    inputMode="decimal"
                    step="any"
                    min="0"
                    placeholder="0"
                    value={linePrices[l.materialId] ?? ""}
                    onChange={(e) => setLinePrices((p) => ({ ...p, [l.materialId]: e.target.value }))}
                    className="w-24 text-right rounded-[0.375rem] border px-2 py-1.5 text-[0.6875rem] font-bold tabular-nums outline-none"
                    style={inputStyle}
                  />
                </div>
              ))}
            </div>
            <div className="flex items-center justify-between px-1 mt-1.5">
              <span className="text-[0.5625rem]" style={{ color: "var(--color-ink-500)" }}>Computed total (ex-GST)</span>
              <span className="text-[0.6875rem] font-bold tabular-nums" style={{ color: "var(--color-ink-950)" }}>
                {formatCurrency(computedTotal)}
              </span>
            </div>
          </div>

          {/* Landed total override */}
          <div>
            <label className="text-[0.5625rem] font-semibold block mb-1" style={{ color: "var(--color-ink-500)" }}>
              Landed Total (delivered to site) *
            </label>
            <input
              type="text"
              inputMode="decimal"
              step="any"
              min="0"
              placeholder={computedTotal > 0 ? String(computedTotal) : "0.00"}
              value={landedTotal}
              onChange={(e) => setLandedTotal(e.target.value)}
              className={inputClass}
              style={inputStyle}
            />
            <p className="text-[0.5rem] mt-0.5" style={{ color: "var(--color-ink-500)" }}>
              Leave blank to use computed total from lines
            </p>
          </div>

          {/* Valid until */}
          <div>
            <label className="text-[0.5625rem] font-semibold block mb-1" style={{ color: "var(--color-ink-500)" }}>
              Valid Until
            </label>
            <input
              type="date"
              value={validUntil}
              onChange={(e) => setValidUntil(e.target.value)}
              className={inputClass}
              style={inputStyle}
            />
          </div>

          {/* Notes */}
          <div>
            <label className="text-[0.5625rem] font-semibold block mb-1" style={{ color: "var(--color-ink-500)" }}>
              Notes (optional)
            </label>
            <textarea
              rows={2}
              value={notes}
              onChange={(e) => setNotes(e.target.value)}
              placeholder="Any special terms…"
              className="w-full rounded-[0.5rem] border px-3 py-2 text-[0.75rem] resize-none outline-none"
              style={inputStyle}
            />
          </div>

          {/* Submit */}
          <button
            type="submit"
            disabled={saving || uploading}
            className="flex w-full items-center justify-center gap-1.5 rounded-[0.5rem] py-3 text-[0.75rem] font-bold press disabled:opacity-50"
            style={{ backgroundColor: "var(--color-ink-950)", color: "var(--color-paper)" }}
          >
            {saving ? <Loader2 className="size-4 animate-spin" /> : <Upload className="size-3.5" />}
            {saving ? "Saving…" : "Upload Quote"}
          </button>
        </form>
      </div>

      {/* Supplier picker modal */}
      {showSupplierPicker ? (
        <SupplierPickerModal
          suppliers={filteredSuppliers}
          search={supplierSearch}
          setSearch={setSupplierSearch}
          selectedId={supplierId}
          onSelect={(id) => { setSupplierId(id); setShowSupplierPicker(false); }}
          onClose={() => setShowSupplierPicker(false)}
          onCreateNew={() => { setShowSupplierPicker(false); setShowNewSupplier(true); }}
        />
      ) : null}

      {/* Inline supplier creation */}
      {showNewSupplier ? (
        <MobileNewSupplierDialog
          open
          onClose={() => setShowNewSupplier(false)}
          onCreated={(s) => {
            setLocalSuppliers((p) => [...p, { id: s.id, name: s.name }]);
            setSupplierId(s.id);
            setShowNewSupplier(false);
          }}
        />
      ) : null}
    </>
  );
}

/* ═══════════════════════════════════════════════════════════
 * Supplier picker modal
 * ═══════════════════════════════════════════════════════════ */
function SupplierPickerModal({
  suppliers,
  search,
  setSearch,
  selectedId,
  onSelect,
  onClose,
  onCreateNew,
}: {
  suppliers: SupplierOption[];
  search: string;
  setSearch: (v: string) => void;
  selectedId: string;
  onSelect: (id: string) => void;
  onClose: () => void;
  onCreateNew: () => void;
}) {
  return (
    <>
      <div className="fixed inset-0 z-50 bg-black/40" onClick={onClose} />
      <div
        className="fixed left-0 right-0 bottom-0 z-50 max-h-[70vh] overflow-y-auto rounded-t-[1rem] border-t"
        style={{
          backgroundColor: "var(--color-paper)",
          borderColor: "var(--color-line)",
          paddingBottom: "max(env(safe-area-inset-bottom), 1rem)",
        }}
      >
        <div className="flex justify-center pt-2 pb-1">
          <div className="w-10 h-1 rounded-full" style={{ backgroundColor: "var(--color-line)" }} />
        </div>
        <div className="flex items-center justify-between px-4 pb-2 border-b" style={{ borderColor: "var(--color-line)" }}>
          <p className="text-[0.875rem] font-bold" style={{ color: "var(--color-ink-950)" }}>Select Supplier</p>
          <button onClick={onClose} className="grid place-items-center size-8 rounded-[0.5rem] press" style={{ color: "var(--color-ink-500)" }}>
            <X className="size-4" />
          </button>
        </div>
        <div className="px-4 py-2">
          <input
            type="text"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder="Search suppliers…"
            className="w-full h-10 rounded-[0.5rem] border px-3 text-[0.75rem] outline-none"
            style={{ borderColor: "var(--color-line)", backgroundColor: "var(--color-paper)", color: "var(--color-ink-950)" }}
          />
        </div>
        <div className="px-2 pb-2 flex flex-col gap-0.5">
          {suppliers.map((s) => (
            <button
              key={s.id}
              onClick={() => onSelect(s.id)}
              className="flex items-center justify-between rounded-[0.5rem] px-3 py-2.5 text-left press"
              style={{
                backgroundColor: s.id === selectedId ? "color-mix(in srgb, var(--color-ink-950) 5%, transparent)" : "transparent",
              }}
            >
              <span className="text-[0.75rem] font-semibold" style={{ color: "var(--color-ink-950)" }}>{s.name}</span>
              {s.id === selectedId ? <CheckCircle2 className="size-4" style={{ color: "var(--color-go)" }} /> : null}
            </button>
          ))}
          {suppliers.length === 0 ? (
            <p className="text-[0.6875rem] text-center py-4" style={{ color: "var(--color-ink-500)" }}>No suppliers found</p>
          ) : null}
        </div>
        <div className="px-4 pb-2">
          <button
            onClick={onCreateNew}
            className="flex w-full items-center justify-center gap-1.5 rounded-[0.5rem] border border-dashed py-2.5 text-[0.6875rem] font-bold press"
            style={{ borderColor: "var(--color-signal)", color: "var(--color-signal-dark)" }}
          >
            <Plus className="size-3.5" /> Create New Supplier
          </button>
        </div>
      </div>
    </>
  );
}

/* ═══════════════════════════════════════════════════════════
 * Waive dialog
 * ═══════════════════════════════════════════════════════════ */
function WaiveDialog({
  reason,
  setReason,
  onConfirm,
  onCancel,
  waiving,
}: {
  reason: string;
  setReason: (v: string) => void;
  onConfirm: () => void;
  onCancel: () => void;
  waiving: boolean;
}) {
  return (
    <>
      <div className="fixed inset-0 z-50 bg-black/40" onClick={onCancel} />
      <div
        className="fixed left-0 right-0 bottom-0 z-50 rounded-t-[1rem] border-t"
        style={{
          backgroundColor: "var(--color-paper)",
          borderColor: "var(--color-line)",
          paddingBottom: "max(env(safe-area-inset-bottom), 1rem)",
        }}
      >
        <div className="flex justify-center pt-2 pb-1">
          <div className="w-10 h-1 rounded-full" style={{ backgroundColor: "var(--color-line)" }} />
        </div>
        <div className="flex items-center justify-between px-4 pb-2 border-b" style={{ borderColor: "var(--color-line)" }}>
          <p className="text-[0.875rem] font-bold" style={{ color: "var(--color-ink-950)" }}>Waive Quote Requirement</p>
          <button onClick={onCancel} className="grid place-items-center size-8 rounded-[0.5rem] press" style={{ color: "var(--color-ink-500)" }}>
            <X className="size-4" />
          </button>
        </div>
        <div className="px-4 py-3 flex flex-col gap-3">
          <p className="text-[0.6875rem]" style={{ color: "var(--color-ink-500)" }}>
            Waiving allows PO conversion without the minimum vendor quotes. This is logged for audit.
          </p>
          <div>
            <label className="text-[0.5625rem] font-semibold block mb-1" style={{ color: "var(--color-ink-500)" }}>
              Reason *
            </label>
            <textarea
              rows={3}
              value={reason}
              onChange={(e) => setReason(e.target.value)}
              placeholder="e.g. Single source supplier, emergency procurement…"
              className="w-full rounded-[0.5rem] border px-3 py-2 text-[0.75rem] resize-none outline-none"
              style={{ borderColor: "var(--color-line)", backgroundColor: "var(--color-paper)", color: "var(--color-ink-950)" }}
            />
          </div>
          <button
            onClick={onConfirm}
            disabled={waiving}
            className="flex w-full items-center justify-center gap-1.5 rounded-[0.5rem] py-3 text-[0.75rem] font-bold press disabled:opacity-50"
            style={{ backgroundColor: "var(--color-ink-950)", color: "var(--color-paper)" }}
          >
            {waiving ? <Loader2 className="size-4 animate-spin" /> : <ShieldCheck className="size-3.5" />}
            {waiving ? "Waiving…" : "Confirm Waive"}
          </button>
        </div>
      </div>
    </>
  );
}

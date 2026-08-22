"use client";

import { useState, useMemo, useRef, useEffect } from "react";
import { useRouter } from "next/navigation";
import { toast } from "sonner";
import {
  Trophy,
  Plus,
  Loader2,
  FileText,
  X,
  Truck,
  Camera,
  Upload,
  ChevronDown,
  ChevronRight,
  ChevronUp,
  Check,
  AlertCircle,
  Calculator,
  Calendar,
  HardHat,
  TrendingUp,
  Crown,
  Download,
  ExternalLink,
} from "lucide-react";
import { formatCurrency, formatNumber, formatDate } from "@/lib/utils";
import { downloadCSV } from "@/lib/export";

// Compact currency for table cells — drops ".00", drops ₹ symbol spacing
// e.g. ₹5,700.00 → 5,700 · ₹1,234.50 → 1,234.5 · ₹9,356.00 → 9,356
function fmtCompact(value: number | string | null | undefined): string {
  if (value == null) return "—";
  const n = typeof value === "string" ? Number(value) : value;
  if (Number.isNaN(n)) return "—";
  const abs = Math.abs(n);
  const sign = n < 0 ? "-" : "";
  if (abs >= 1_00_00_000) return `${sign}${(abs / 1_00_00_000).toFixed(2)}Cr`;
  if (abs >= 1_00_000) return `${sign}${(abs / 1_00_000).toFixed(2)}L`;
  if (abs >= 1_000) return `${sign}${Math.round(abs).toLocaleString("en-IN")}`;
  return `${sign}${abs % 1 === 0 ? abs.toFixed(0) : abs.toFixed(2)}`;
}

// Auto-shrink font size so text never overflows the cell.
// baseFs is the ideal font size; text is the rendered string.
// Returns a font size in px that fits within maxChars width.
function fitFont(text: string, baseFs: number, maxChars: number = 7): number {
  const len = text.length;
  if (len <= maxChars) return baseFs;
  // Scale down proportionally, with a floor of 60% of base
  const scale = Math.max(0.55, maxChars / len);
  return Math.round(baseFs * scale * 10) / 10;
}

// Short date for table cells — "17/09" instead of "17 Sept 2026"
function fmtDateShort(value: Date | string | null | undefined): string {
  if (!value) return "—";
  const d = new Date(value);
  if (Number.isNaN(d.getTime())) return "—";
  return `${String(d.getDate()).padStart(2, "0")}/${String(d.getMonth() + 1).padStart(2, "0")}`;
}

type RequestLine = {
  id: string;
  materialId: string;
  materialName: string;
  materialCode: string;
  unit: string;
  qtyRequired: number;
  hsnCode: string | null;
  gstRate: number;
  lastRate: { unitCost: number; poNumber: string; poDate: string; supplierName: string; projectName: string | null } | null;
  allQuotesAboveLastRate: boolean;
  minVariancePct: number | null;
};

type QuoteLine = {
  materialId: string;
  qty: number;
  unitPrice: number;
  hsnCode: string | null;
  gstRate: number;
  gstAmount: number;
  discountPerUnit: number;
  packingPerUnit: number;
  freightPerUnit: number;
  loadingPerUnit: number;
  insurancePerUnit: number;
  handlingPerUnit: number;
  buyerTransportPerUnit: number;
  taxableValuePerUnit: number;
  unitLandedCost: number;
  lineSubtotal: number;
  lineTotal: number;
};

type Quote = {
  id: string;
  supplierId: string;
  supplierName: string;
  supplierPhone: string | null;
  supplierGstin: string | null;
  fileUrl: string | null;
  fileName: string | null;
  quoteSource: string;
  sourceNote: string | null;
  status: string;
  isCheapest: boolean;
  isSelected: boolean;
  subtotal: number;
  gstTotal: number;
  freightTotal: number;
  handlingTotal: number;
  discountTotal: number;
  packingTotal: number;
  loadingTotal: number;
  insuranceTotal: number;
  landedTotal: number;
  buyerTransportTotal: number;
  validUntil: string | null;
  paymentTerms: string | null;
  deliveryTerms: string | null;
  deliveryTermsType: "DELIVERED_SITE" | "EX_WORKS" | "FOR_STATION" | "CUSTOM";
  leadTimeDays: number | null;
  warranty: string | null;
  notes: string | null;
  createdAt: string;
  isExpired: boolean;
  daysUntilExpiry: number | null;
  lines: QuoteLine[];
};

type Request = {
  id: string;
  requestNumber: string;
  title: string;
  status: string;
  minQuotesRequired: number;
  notes: string | null;
  projectName: string | null;
  requiredByDate: string | null;
  workActivity: string | null;
  isUrgent: boolean;
  daysUntilRequired: number | null;
  submittedByName: string;
  approvedByName: string | null;
  approvedAt: string | null;
  approvalReason: string | null;
  selectedQuoteId: string | null;
  createdAt: string;
  canApprove: boolean;
  canAddQuote: boolean;
  cheapestQuoteId: string | null;
  convertedPo?: { id: string; poNumber: string; status: string; total?: number } | null;
};

export type { Request as QuotationDetailRequest, RequestLine as QuotationDetailLine, Quote as QuotationDetailQuote, Supplier as QuotationDetailSupplier };

type Supplier = { id: string; name: string; phone: string | null; gstin: string | null };

const STATUS_STYLE: Record<string, { color: string; label: string }> = {
  OPEN: { color: "var(--color-ink-400)", label: "Open" },
  QUOTES_COLLECTED: { color: "var(--color-signal)", label: "Quotes In" },
  APPROVED: { color: "var(--color-go)", label: "Approved" },
  CLOSED: { color: "var(--color-steel)", label: "Closed" },
  CANCELLED: { color: "var(--color-stop)", label: "Cancelled" },
};

export function MobileQuotationDetail({
  request,
  lines,
  quotes,
  suppliers,
  onClose,
  onChanged,
}: {
  request: Request;
  lines: RequestLine[];
  quotes: Quote[];
  suppliers: Supplier[];
  onClose?: () => void;
  onChanged?: () => void;
}) {
  const router = useRouter();
  const [showAddQuote, setShowAddQuote] = useState(false);
  const [expandedMaterial, setExpandedMaterial] = useState<string | null>(null);
  const [approving, setApproving] = useState<string | null>(null);
  const [showApproveDialog, setShowApproveDialog] = useState(false);
  const [approveQuoteId, setApproveQuoteId] = useState<string | null>(null);
  const [approveReason, setApproveReason] = useState("");

  const style = STATUS_STYLE[request.status] ?? STATUS_STYLE.OPEN!;

  // Non-rejected quotes for the matrix.
  const activeQuotes = useMemo(() => quotes.filter((q) => q.status !== "REJECTED"), [quotes]);

  // Total savings = max - min landed total.
  const savings = useMemo(() => {
    if (activeQuotes.length < 2) return 0;
    const totals = activeQuotes.map((q) => q.landedTotal);
    return Math.max(...totals) - Math.min(...totals);
  }, [activeQuotes]);

  // Per-material comparison matrix.
  const materialMatrix = useMemo(() => {
    return lines.map((line) => {
      const quoteEntries = activeQuotes.map((q) => {
        const ql = q.lines.find((l) => l.materialId === line.materialId);
        if (!ql) return null;
        return {
          quoteId: q.id,
          supplierName: q.supplierName,
          supplierId: q.supplierId,
          deliveryTermsType: q.deliveryTermsType,
          unitPrice: ql.unitPrice,
          gstRate: ql.gstRate,
          gstAmount: ql.gstAmount,
          freightPerUnit: ql.freightPerUnit,
          handlingPerUnit: ql.handlingPerUnit,
          buyerTransportPerUnit: ql.buyerTransportPerUnit,
          unitLandedCost: ql.unitLandedCost,
          lineTotal: ql.lineTotal,
          isCheapest: false,
          isSelected: q.isSelected,
        };
      }).filter((x): x is NonNullable<typeof x> => x !== null);

      // Find cheapest per-piece landed cost.
      let cheapestCost = Infinity;
      for (const e of quoteEntries) {
        if (e.unitLandedCost < cheapestCost) cheapestCost = e.unitLandedCost;
      }
      for (const e of quoteEntries) {
        e.isCheapest = e.unitLandedCost === cheapestCost;
      }

      return { line, quotes: quoteEntries };
    });
  }, [lines, activeQuotes]);

  async function handleApprove() {
    if (!approveQuoteId) {
      toast.error("Select a quote to approve");
      return;
    }
    // If not cheapest, reason is required.
    const selectedQuote = activeQuotes.find((q) => q.id === approveQuoteId);
    const isCheapest = selectedQuote?.id === request.cheapestQuoteId;
    if (!isCheapest && !approveReason.trim()) {
      toast.error("A reason is required when not selecting the cheapest quote");
      return;
    }

    setApproving(approveQuoteId);
    try {
      const res = await fetch(`/api/quotations/${request.id}/approve`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          selectedQuoteId: approveQuoteId,
          reason: approveReason.trim() || null,
        }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error ?? "Failed to approve");
      const poLabel = data.purchaseOrder?.poNumber
        ? `PO ${data.purchaseOrder.poNumber} created`
        : selectedQuote?.supplierName;
      toast.success("Quotation approved — PO created", {
        description: poLabel,
      });
      setShowApproveDialog(false);
      setApproving(null);
      onChanged?.();
      router.refresh();
    } catch (err: unknown) {
      toast.error(err instanceof Error ? err.message : "Failed");
    } finally {
      setApproving(null);
    }
  }

  return (
    <div className="space-y-2">
      {/* ── Header (compact) ── */}
      <div className="flex items-center gap-2 flex-wrap">
        {onClose ? (
          <button type="button" onClick={onClose} className="p-2 -ml-2 rounded-lg press active:scale-95" style={{ color: "var(--color-ink-700)" }} aria-label="Close">
            <X className="size-5" />
          </button>
        ) : null}
        <h1 className="text-[0.875rem] font-bold font-mono" style={{ color: "var(--color-ink-950)" }}>
          {request.requestNumber}
        </h1>
        <span
          className="text-[0.5rem] font-bold uppercase px-1.5 py-0.5 rounded"
          style={{ backgroundColor: style.color, color: "#fff" }}
        >
          {style.label}
        </span>
        {request.isUrgent ? (
          <span
            className="text-[0.5rem] font-bold uppercase px-1.5 py-0.5 rounded flex items-center gap-0.5"
            style={{ backgroundColor: "var(--color-stop)", color: "#fff" }}
          >
            <AlertCircle className="size-2.5" />
            URGENT
          </span>
        ) : null}
        <span className="text-[0.625rem] font-bold ml-auto" style={{ color: "var(--color-ink-950)" }}>
          {request.title}
        </span>
      </div>
      <div className="flex items-center gap-2 flex-wrap text-[0.5625rem]" style={{ color: "var(--color-ink-500)" }}>
        <span>{request.projectName ?? "No project"}</span>
        <span>·</span>
        <span>by {request.submittedByName}</span>
        <span>·</span>
        <span>{formatDate(request.createdAt)}</span>
        {request.requiredByDate ? (
          <>
            <span>·</span>
            <span style={{ color: request.isUrgent ? "var(--color-stop)" : undefined }}>
              Due {formatDate(request.requiredByDate)}
              {request.daysUntilRequired !== null ? ` (${request.daysUntilRequired >= 0 ? `${request.daysUntilRequired}d` : `${Math.abs(request.daysUntilRequired)}d overdue`})` : ""}
            </span>
          </>
        ) : null}
        {request.workActivity ? (
          <>
            <span>·</span>
            <span>{request.workActivity}</span>
          </>
        ) : null}
      </div>

      {/* ── Converted PO banner (compact) ── */}
      {request.convertedPo ? (
        <a
          href={`/m/procurement/${request.convertedPo.id}`}
          className="flex items-center justify-between rounded border px-2.5 py-1.5 press"
          style={{ borderColor: "var(--color-go)", backgroundColor: "var(--color-go-wash)" }}
        >
          <div className="flex items-center gap-2">
            <span className="text-[0.5rem] font-bold uppercase tracking-wide" style={{ color: "var(--color-go)" }}>
              PO created
            </span>
            <span className="text-[0.75rem] font-bold font-mono" style={{ color: "var(--color-ink-950)" }}>
              {request.convertedPo.poNumber}
            </span>
          </div>
          <span className="text-[0.5rem] font-bold uppercase" style={{ color: "var(--color-go)" }}>
            {request.convertedPo.status}
          </span>
        </a>
      ) : null}

      {/* ── Quote gate status + Add button (compact) ── */}
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-1.5">
          {activeQuotes.length >= request.minQuotesRequired ? (
            <span className="flex items-center gap-1 text-[0.625rem] font-semibold" style={{ color: "var(--color-go)" }}>
              <Check className="size-3" />
              {activeQuotes.length}/{request.minQuotesRequired} quotes
            </span>
          ) : (
            <span className="flex items-center gap-1 text-[0.625rem] font-semibold" style={{ color: "var(--color-signal-dark)" }}>
              <AlertCircle className="size-3" />
              {activeQuotes.length}/{request.minQuotesRequired} — need {request.minQuotesRequired - activeQuotes.length} more
            </span>
          )}
        </div>
        {request.canAddQuote ? (
          <button
            onClick={() => setShowAddQuote(true)}
            className="flex items-center gap-1 h-7 px-2.5 rounded text-[0.625rem] font-bold whitespace-nowrap press active:scale-95"
            style={{ backgroundColor: "var(--color-ink-950)", color: "#fff" }}
          >
            <Plus className="size-3" />
            Add Quote
          </button>
        ) : null}
      </div>

      {/* ═══════════════════════════════════════════════════════════════
          EXCEL-STYLE COMPARATIVE STATEMENT SHEET
         ═══════════════════════════════════════════════════════════════ */}
      {activeQuotes.length > 0 ? (
        <ComparativeSheet
          lines={lines}
          quotes={activeQuotes}
          cheapestQuoteId={request.cheapestQuoteId}
          selectedQuoteId={request.selectedQuoteId}
          savings={savings}
          expandedMaterial={expandedMaterial}
          onToggleMaterial={(id) => setExpandedMaterial(expandedMaterial === id ? null : id)}
          canEdit={request.canAddQuote}
        />
      ) : null}

      {/* ── Notes ── */}
      {request.notes ? (
        <div
          className="rounded-[0.5rem] border-l-2 p-2.5 text-[0.6875rem] italic"
          style={{ borderColor: "var(--color-steel)", backgroundColor: "var(--color-paper)", color: "var(--color-ink-700)" }}
        >
          {request.notes}
        </div>
      ) : null}

      {/* ── Approval reason ── */}
      {request.approvalReason ? (
        <div
          className="rounded-[0.5rem] border-l-2 p-2.5 text-[0.6875rem]"
          style={{ borderColor: "var(--color-signal)", backgroundColor: "var(--color-signal-wash)", color: "var(--color-ink-700)" }}
        >
          <p className="font-bold text-[0.5625rem] uppercase mb-1" style={{ color: "var(--color-signal-dark)" }}>
            Approval Reason
          </p>
          {request.approvalReason}
        </div>
      ) : null}

      {/* ── Sticky bottom action bar ── */}
      {request.canApprove && activeQuotes.length > 0 ? (
        <div
          className="sticky bottom-0 z-20 border-t mt-4"
          style={{
            backgroundColor: "color-mix(in srgb, var(--color-paper) 97%, transparent)",
            borderColor: "var(--color-line)",
            backdropFilter: "blur(8px)",
          }}
        >
          <div className="mx-auto w-full max-w-[34rem] px-3.5 py-2.5 pb-safe">
            <button
              onClick={() => {
                setApproveQuoteId(request.cheapestQuoteId);
                setShowApproveDialog(true);
              }}
              className="flex w-full items-center justify-center gap-2 rounded-[0.625rem] py-3 text-[0.8125rem] font-bold press active:scale-95"
              style={{ backgroundColor: "var(--color-go)", color: "#fff" }}
            >
              <Trophy className="size-4" />
              Approve & Select Winner
            </button>
          </div>
        </div>
      ) : null}

      {/* ── Add Quote Dialog ── */}
      {showAddQuote ? (
        <AddQuoteDialog
          request={request}
          lines={lines}
          suppliers={suppliers}
          existingQuotes={quotes}
          onClose={() => setShowAddQuote(false)}
          onAdded={() => {
            setShowAddQuote(false);
            onChanged?.();
            router.refresh();
          }}
        />
      ) : null}

      {/* ── Approve Dialog ── */}
      {showApproveDialog ? (
        <ApproveDialog
          quotes={activeQuotes}
          cheapestQuoteId={request.cheapestQuoteId}
          selectedQuoteId={approveQuoteId}
          onSelect={setApproveQuoteId}
          reason={approveReason}
          onReasonChange={setApproveReason}
          onConfirm={handleApprove}
          onCancel={() => {
            setShowApproveDialog(false);
            setApproveQuoteId(null);
            setApproveReason("");
          }}
          approving={approving !== null}
        />
      ) : null}
    </div>
  );
}

/* ═══════════════════════════════════════════════════════════════════════════
   COMPARATIVE SHEET — Professional Excel-style grid
   Clean, readable, color-coded: green=cheapest/winner, red=highest
   ═══════════════════════════════════════════════════════════════════════════ */
function ComparativeSheet({
  lines,
  quotes,
  cheapestQuoteId,
  selectedQuoteId,
  savings,
  expandedMaterial,
  onToggleMaterial,
  canEdit,
}: {
  lines: RequestLine[];
  quotes: Quote[];
  cheapestQuoteId: string | null;
  selectedQuoteId: string | null;
  savings: number;
  expandedMaterial: string | null;
  onToggleMaterial: (id: string) => void;
  canEdit: boolean;
}) {
  // ── Local quotes state for seamless (no-refresh) updates ──
  // Syncs from props but is updated optimistically after each inline edit.
  const [localQuotes, setLocalQuotes] = useState<Quote[]>(quotes);
  useEffect(() => { setLocalQuotes(quotes); }, [quotes]);

  const sortedQuotes = useMemo(
    () => [...localQuotes].sort((a, b) => a.landedTotal - b.landedTotal),
    [localQuotes],
  );

  // ── Inline single-cell edit state ──
  // editingCell = { quoteId, materialId, field } for line costs
  // editingTerm = { quoteId, field } for commercial terms
  const [editingCell, setEditingCell] = useState<{ quoteId: string; materialId: string; field: string } | null>(null);
  const [editingTerm, setEditingTerm] = useState<{ quoteId: string; field: string } | null>(null);
  const [cellValue, setCellValue] = useState<string>("");
  const [saving, setSaving] = useState(false);
  // Ref to track current cell value for immediate access in keydown handlers (avoids stale closure)
  const cellValueRef = useRef<string>("");
  const syncCellValue = (v: string) => { cellValueRef.current = v; setCellValue(v); };

  const materialMatrix = useMemo(() => {
    return lines.map((line) => {
      const entries = sortedQuotes.map((q) => {
        const ql = q.lines.find((l) => l.materialId === line.materialId);
        if (!ql) return null;
        return {
          quoteId: q.id,
          supplierName: q.supplierName,
          deliveryTermsType: q.deliveryTermsType,
          unitPrice: ql.unitPrice,
          gstRate: ql.gstRate,
          gstAmount: ql.gstAmount,
          discountPerUnit: ql.discountPerUnit,
          packingPerUnit: ql.packingPerUnit,
          freightPerUnit: ql.freightPerUnit,
          loadingPerUnit: ql.loadingPerUnit,
          insurancePerUnit: ql.insurancePerUnit,
          handlingPerUnit: ql.handlingPerUnit,
          buyerTransportPerUnit: ql.buyerTransportPerUnit,
          unitLandedCost: ql.unitLandedCost,
          lineTotal: ql.lineTotal,
          qty: ql.qty,
          isCheapest: false,
          isSelected: q.isSelected,
        };
      }).filter((x): x is NonNullable<typeof x> => x !== null);

      let cheapestCost = Infinity;
      let highestCost = 0;
      for (const e of entries) {
        if (e.unitLandedCost < cheapestCost) cheapestCost = e.unitLandedCost;
        if (e.unitLandedCost > highestCost) highestCost = e.unitLandedCost;
      }
      for (const e of entries) {
        e.isCheapest = e.unitLandedCost === cheapestCost && cheapestCost !== Infinity;
      }
      return { line, entries, cheapestCost, highestCost };
    });
  }, [lines, sortedQuotes]);

  const deliveryBases = new Set(sortedQuotes.map((q) => q.deliveryTermsType));
  const mixedDelivery = deliveryBases.size > 1;

  // ── Save a single line cost cell ──
  // ── Recalculate quote totals from lines (client-side, for seamless updates) ──
  // MUST match server's computeQuoteTotals() exactly:
  //   subtotal = sum(unitPrice * qty)  [raw, before discount]
  //   landedTotal = sum(unitLandedCost * qty)  [fully loaded]
  function recalcQuote(q: Quote, updatedLines: QuoteLine[]): Quote {
    let subtotal = 0, gstTotal = 0, freightTotal = 0, handlingTotal = 0;
    let discountTotal = 0, packingTotal = 0, loadingTotal = 0, insuranceTotal = 0, buyerTransportTotal = 0;
    let landedTotal = 0;
    for (const l of updatedLines) {
      subtotal += l.unitPrice * l.qty;
      gstTotal += l.gstAmount;
      freightTotal += l.freightPerUnit * l.qty;
      handlingTotal += l.handlingPerUnit * l.qty;
      discountTotal += l.discountPerUnit * l.qty;
      packingTotal += l.packingPerUnit * l.qty;
      loadingTotal += l.loadingPerUnit * l.qty;
      insuranceTotal += l.insurancePerUnit * l.qty;
      buyerTransportTotal += l.buyerTransportPerUnit * l.qty;
      landedTotal += l.lineTotal;
    }
    return {
      ...q,
      lines: updatedLines,
      subtotal: Math.round(subtotal * 100) / 100,
      gstTotal: Math.round(gstTotal * 100) / 100,
      freightTotal: Math.round(freightTotal * 100) / 100,
      handlingTotal: Math.round(handlingTotal * 100) / 100,
      discountTotal: Math.round(discountTotal * 100) / 100,
      packingTotal: Math.round(packingTotal * 100) / 100,
      loadingTotal: Math.round(loadingTotal * 100) / 100,
      insuranceTotal: Math.round(insuranceTotal * 100) / 100,
      buyerTransportTotal: Math.round(buyerTransportTotal * 100) / 100,
      landedTotal: Math.round(landedTotal * 100) / 100,
    };
  }

  // ── Update a single quote in localQuotes (seamless, no refresh) ──
  function updateLocalQuote(quoteId: string, updater: (q: Quote) => Quote) {
    setLocalQuotes((prev) => prev.map((q) => q.id === quoteId ? updater(q) : q));
  }

  // ── Recalculate isCheapest flags after any change ──
  function recalcCheapest(quotes: Quote[]): Quote[] {
    const active = quotes.filter((q) => q.status !== "REJECTED");
    if (active.length === 0) return quotes;
    const minTotal = Math.min(...active.map((q) => q.landedTotal));
    return quotes.map((q) => ({ ...q, isCheapest: q.status !== "REJECTED" && q.landedTotal === minTotal }));
  }

  async function saveCell(quoteId: string, materialId: string, field: string, value: string) {
    if (!canEdit) return;
    setSaving(true);
    try {
      const q = sortedQuotes.find((x) => x.id === quoteId);
      if (!q) return;
      const numVal = parseFloat(value) || 0;
      // Build full lines array with the one field changed
      const allLines = q.lines.map((l) => {
        const isTarget = l.materialId === materialId;
        return {
          materialId: l.materialId,
          qty: l.qty,
          unitPrice: isTarget && field === "unitPrice" ? numVal : l.unitPrice,
          gstRate: l.gstRate,
          discountPerUnit: isTarget && field === "discountPerUnit" ? numVal : l.discountPerUnit,
          packingPerUnit: isTarget && field === "packingPerUnit" ? numVal : l.packingPerUnit,
          freightPerUnit: isTarget && field === "freightPerUnit" ? numVal : l.freightPerUnit,
          loadingPerUnit: isTarget && field === "loadingPerUnit" ? numVal : l.loadingPerUnit,
          insurancePerUnit: isTarget && field === "insurancePerUnit" ? numVal : l.insurancePerUnit,
          handlingPerUnit: isTarget && field === "handlingPerUnit" ? numVal : l.handlingPerUnit,
          buyerTransportPerUnit: isTarget && field === "buyerTransportPerUnit" ? numVal : l.buyerTransportPerUnit,
        };
      });
      // Optimistic update — recalc locally for seamless UI
      const updatedQuoteLines: QuoteLine[] = q.lines.map((l) => {
        const isTarget = l.materialId === materialId;
        const getField = (f: string, current: number) => isTarget && field === f ? numVal : current;
        const unitPrice = getField("unitPrice", l.unitPrice);
        const discountPerUnit = getField("discountPerUnit", l.discountPerUnit);
        const packingPerUnit = getField("packingPerUnit", l.packingPerUnit);
        const freightPerUnit = getField("freightPerUnit", l.freightPerUnit);
        const loadingPerUnit = getField("loadingPerUnit", l.loadingPerUnit);
        const insurancePerUnit = getField("insurancePerUnit", l.insurancePerUnit);
        const handlingPerUnit = getField("handlingPerUnit", l.handlingPerUnit);
        const buyerTransportPerUnit = getField("buyerTransportPerUnit", l.buyerTransportPerUnit);
        const taxableValuePerUnit = unitPrice - discountPerUnit + packingPerUnit;
        const gstAmount = taxableValuePerUnit * l.gstRate / 100 * l.qty;
        const unitLandedCost = taxableValuePerUnit + (taxableValuePerUnit * l.gstRate / 100) + freightPerUnit + loadingPerUnit + insurancePerUnit + handlingPerUnit + buyerTransportPerUnit;
        // lineSubtotal = unitPrice * qty (matches server computeLineLandedCost)
        const lineSubtotal = unitPrice * l.qty;
        const lineTotal = unitLandedCost * l.qty;
        return { ...l, unitPrice, discountPerUnit, packingPerUnit, freightPerUnit, loadingPerUnit, insurancePerUnit, handlingPerUnit, buyerTransportPerUnit, taxableValuePerUnit, gstAmount, unitLandedCost, lineSubtotal, lineTotal };
      });
      // Capture pre-edit state for potential revert (avoids stale closure on `quotes` prop)
      const preEditQuotes = localQuotes;
      setLocalQuotes((prev) => recalcCheapest(prev.map((q2) => q2.id === quoteId ? recalcQuote(q2, updatedQuoteLines) : q2)));

      const res = await fetch(`/api/quotes/${quoteId}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ lines: allLines }),
      });
      if (!res.ok) {
        // Revert to pre-edit state (not the stale `quotes` prop)
        setLocalQuotes(preEditQuotes);
        const data = await res.json().catch(() => ({}));
        throw new Error(data.error ?? "Failed to update");
      }
      setEditingCell(null);
      // Don't call onChanged here — it would remount the overlay (key change).
      // Local state already recalculates cheapest/winner. Server data refreshes
      // when the user closes the overlay (onClose → router.refresh()).
    } catch (err: unknown) {
      toast.error(err instanceof Error ? err.message : "Failed to save");
    } finally {
      setSaving(false);
    }
  }

  // ── Save a single commercial term cell ──
  async function saveTermCell(quoteId: string, field: string, value: string) {
    if (!canEdit) return;
    setSaving(true);
    try {
      const body: Record<string, unknown> = {};
      if (field === "paymentTerms") body.paymentTerms = value || null;
      else if (field === "leadTimeDays") body.leadTimeDays = value ? parseInt(value, 10) : null;
      else if (field === "warranty") body.warranty = value || null;
      else if (field === "validUntil") body.validUntil = value || null;
      else if (field === "deliveryTermsType") body.deliveryTermsType = value;

      // Capture pre-edit state for potential revert
      const preEditQuotes = localQuotes;
      // Optimistic update
      updateLocalQuote(quoteId, (q) => {
        const updated = { ...q };
        if (field === "paymentTerms") updated.paymentTerms = value || null;
        else if (field === "leadTimeDays") updated.leadTimeDays = value ? parseInt(value, 10) : null;
        else if (field === "warranty") updated.warranty = value || null;
        else if (field === "validUntil") {
          updated.validUntil = value ? new Date(value).toISOString() : null;
          if (value) {
            const d = new Date(value);
            const now = new Date();
            updated.isExpired = d < now;
            updated.daysUntilExpiry = Math.ceil((d.getTime() - now.getTime()) / (1000 * 60 * 60 * 24));
          } else {
            updated.isExpired = false;
            updated.daysUntilExpiry = null;
          }
        }
        else if (field === "deliveryTermsType") updated.deliveryTermsType = value as Quote["deliveryTermsType"];
        return updated;
      });

      const res = await fetch(`/api/quotes/${quoteId}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(body),
      });
      if (!res.ok) {
        // Revert to pre-edit state (not the stale `quotes` prop)
        setLocalQuotes(preEditQuotes);
        const data = await res.json().catch(() => ({}));
        throw new Error(data.error ?? "Failed to update");
      }
      setEditingTerm(null);
      // Don't call onChanged here — it would remount the overlay (key change).
      // Local state is already updated optimistically.
    } catch (err: unknown) {
      toast.error(err instanceof Error ? err.message : "Failed to save");
    } finally {
      setSaving(false);
    }
  }

  // ── Start editing a line cost cell (saves previous cell if any) ──
  function startEditCell(quoteId: string, materialId: string, field: string, currentValue: number) {
    if (!canEdit) return;
    // Save the previous cell being edited before switching
    if (editingCell && (editingCell.quoteId !== quoteId || editingCell.materialId !== materialId || editingCell.field !== field)) {
      saveCell(editingCell.quoteId, editingCell.materialId, editingCell.field, cellValueRef.current);
    }
    // Also save a term if one was being edited
    if (editingTerm) {
      saveTermCell(editingTerm.quoteId, editingTerm.field, cellValueRef.current);
    }
    setEditingCell({ quoteId, materialId, field });
    syncCellValue(String(currentValue));
  }

  // ── Start editing a commercial term cell (saves previous cell if any) ──
  function startEditTermCell(quoteId: string, field: string, currentValue: string) {
    if (!canEdit) return;
    // Save the previous term being edited before switching
    if (editingTerm && (editingTerm.quoteId !== quoteId || editingTerm.field !== field)) {
      saveTermCell(editingTerm.quoteId, editingTerm.field, cellValueRef.current);
    }
    // Also save a line cell if one was being edited
    if (editingCell) {
      saveCell(editingCell.quoteId, editingCell.materialId, editingCell.field, cellValueRef.current);
    }
    setEditingTerm({ quoteId, field });
    syncCellValue(currentValue);
  }

  // ── Split quotes into batches of max 5 so text stays readable ──
  const MAX_PER_TABLE = 5;
  const batchStarts: number[] = [];
  for (let i = 0; i < sortedQuotes.length; i += MAX_PER_TABLE) {
    batchStarts.push(i);
  }

  // Font sizes based on quotes-per-batch (always <= 5, so always readable)
  function makeFs(batchSize: number) {
    const n = batchSize;
    return {
      supplier: n <= 2 ? 11 : n === 3 ? 10 : 9,
      price:    n <= 2 ? 12 : n === 3 ? 11 : 10,
      sub:      n <= 2 ? 9  : n === 3 ? 8  : 8,
      micro:    n <= 2 ? 8  : n === 3 ? 7  : 7,
      label:    n <= 2 ? 10 : n === 3 ? 9  : 9,
      badge:    n <= 2 ? 7  : n === 3 ? 6  : 6,
      section:  n <= 2 ? 10 : n === 3 ? 9  : 9,
    };
  }

  function renderBatchTable(batchStart: number) {
    const batch = sortedQuotes.slice(batchStart, batchStart + MAX_PER_TABLE);
    const batchFs = makeFs(batch.length);
    const bn = batch.length;
    const labelPct = bn <= 2 ? 34 : bn === 3 ? 30 : 28;
    const quotePct = (100 - labelPct) / bn;
    const batchNum = Math.floor(batchStart / MAX_PER_TABLE) + 1;
    const totalBatches = Math.ceil(sortedQuotes.length / MAX_PER_TABLE);

    // For this batch, find cheapest within the FULL sorted list (idx 0 is always cheapest overall)
    const globalCheapestId = sortedQuotes[0]?.id;

    return (
      <div key={batchStart} className={batchStart > 0 ? "mt-3" : ""}>
        {totalBatches > 1 && (
          <div className="text-center text-[9px] font-bold uppercase tracking-wider text-slate-500 mb-1">
            Suppliers {batchStart + 1}–{batchStart + batch.length} of {sortedQuotes.length}
          </div>
        )}
        <div className="rounded-lg border-2 border-slate-700 bg-white shadow-md overflow-hidden cs-table">
          <style>{`
            .cs-table td, .cs-table th { overflow: hidden; text-overflow: ellipsis; white-space: nowrap; max-width: 0; }
          `}</style>
          <table className="w-full border-collapse" style={{ tableLayout: "fixed", fontSize: `${batchFs.label}px` }}>
            <colgroup>
              <col style={{ width: `${labelPct}%` }} />
              {batch.map((q) => (
                <col key={q.id} style={{ width: `${quotePct}%` }} />
              ))}
            </colgroup>
            <thead>
              <tr>
                <th className="border border-slate-300 px-1.5 py-1 text-left bg-slate-700 text-white overflow-hidden">
                  <div className="font-bold uppercase tracking-wider opacity-70" style={{ fontSize: `${batchFs.micro}px` }}>Comp. Statement</div>
                  <div className="font-bold" style={{ fontSize: `${batchFs.supplier}px` }}>Supplier →</div>
                </th>
                {batch.map((q) => {
                  const globalIdx = sortedQuotes.indexOf(q);
                  const isWinner = q.id === selectedQuoteId;
                  const isCheapest = q.id === globalCheapestId;
                  return (
                    <th
                      key={q.id}
                      className={`border border-slate-300 px-1 py-1 text-center overflow-hidden ${isWinner ? "bg-slate-900" : isCheapest ? "bg-slate-800" : "bg-slate-700"}`}
                    >
                      <div className="text-white">
                        <div className="flex items-center justify-center gap-0.5 overflow-hidden">
                          {isWinner && <Crown className="shrink-0" style={{ width: batchFs.badge + 3, height: batchFs.badge + 3 }} />}
                          {isCheapest && !isWinner && <Trophy className="shrink-0" style={{ width: batchFs.badge + 3, height: batchFs.badge + 3 }} />}
                          <span className="font-bold truncate" style={{ fontSize: `${batchFs.supplier}px` }}>{q.supplierName}</span>
                        </div>
                        {isWinner && <div className="mt-0.5 font-bold uppercase tracking-wider bg-white/20 rounded px-0.5" style={{ fontSize: `${batchFs.badge}px` }}>★ Win</div>}
                        {isCheapest && !isWinner && <div className="mt-0.5 font-bold uppercase tracking-wider bg-white/20 rounded px-0.5" style={{ fontSize: `${batchFs.badge}px` }}>Low</div>}
                      </div>
                    </th>
                  );
                })}
              </tr>
            </thead>
            <tbody>
              {/* ── PER-MATERIAL SECTIONS ── */}
              {materialMatrix.map(({ line, entries }) => {
                const batchEntries = entries.filter((e) => batch.some((q) => q.id === e.quoteId));
                const isExpanded = expandedMaterial === line.materialId;
                const hasMultiple = batchEntries.length > 1;
                return (
                  <MatSection
                    key={line.id}
                    line={line}
                    entries={batchEntries}
                    hasMultiple={hasMultiple}
                    isExpanded={isExpanded}
                    onToggle={() => onToggleMaterial(line.materialId)}
                    fs={batchFs}
                    canEdit={canEdit}
                    editingCell={editingCell}
                    cellValue={cellValue}
                    saving={saving}
                    onStartEditCell={(quoteId, field, currentValue) => startEditCell(quoteId, line.materialId, field, currentValue)}
                    onSaveCell={() => {
                      if (editingCell) saveCell(editingCell.quoteId, editingCell.materialId, editingCell.field, cellValueRef.current);
                    }}
                    onCancelCell={() => setEditingCell(null)}
                    onCellValueChange={syncCellValue}
                  />
                );
              })}

              {/* ── SUMMARY SECTION HEADER ── */}
              <tr>
                <td colSpan={batch.length + 1} className="border border-slate-300 px-1.5 py-1 bg-slate-200 text-slate-800 font-bold uppercase tracking-wider" style={{ fontSize: `${batchFs.section}px` }}>
                  Summary
                </td>
              </tr>

              <SummaryRow label="Subtotal (ex-GST)" quotes={batch} getValue={(q) => q.subtotal} fs={batchFs} />
              <SummaryRow label="GST Total" quotes={batch} getValue={(q) => q.gstTotal} fs={batchFs} />
              <SummaryRow
                label="Freight+Transp"
                quotes={batch}
                getValue={(q) => q.freightTotal + q.buyerTransportTotal}
                remark={mixedDelivery ? "Normalized" : "Incl. freight"}
                fs={batchFs}
              />

              {/* ── Individual charge rows — only show if any quote has non-zero value ── */}
              {batch.some((q) => q.discountTotal > 0) && (
                <SummaryRow label="Discount" quotes={batch} getValue={(q) => -q.discountTotal} fs={batchFs} />
              )}
              {batch.some((q) => q.packingTotal > 0) && (
                <SummaryRow label="Packing" quotes={batch} getValue={(q) => q.packingTotal} fs={batchFs} />
              )}
              {batch.some((q) => q.loadingTotal > 0) && (
                <SummaryRow label="Loading" quotes={batch} getValue={(q) => q.loadingTotal} fs={batchFs} />
              )}
              {batch.some((q) => q.insuranceTotal > 0) && (
                <SummaryRow label="Insurance" quotes={batch} getValue={(q) => q.insuranceTotal} fs={batchFs} />
              )}
              {batch.some((q) => q.handlingTotal > 0) && (
                <SummaryRow label="Handling" quotes={batch} getValue={(q) => q.handlingTotal} fs={batchFs} />
              )}

              {/* ── LANDED TOTAL — bold headline row ── */}
              <tr>
                <td className="border-2 border-slate-500 px-1.5 py-1 font-bold bg-slate-300 text-slate-900 uppercase tracking-wide overflow-hidden" style={{ fontSize: `${batchFs.sub}px` }}>
                  Landed Total
                </td>
                {batch.map((q) => {
                  const isWinner = q.id === selectedQuoteId;
                  const isCheapest = q.id === globalCheapestId;
                  const isHighest = q.id === sortedQuotes[sortedQuotes.length - 1]?.id && sortedQuotes.length > 1;
                  return (
                    <td
                      key={q.id}
                      className={`border-2 border-slate-500 px-1 py-1 text-right tabular-nums overflow-hidden ${
                        isWinner
                          ? "bg-slate-900 text-white"
                          : isCheapest
                            ? "bg-emerald-50 text-emerald-800"
                            : isHighest
                              ? "bg-red-50 text-red-600"
                              : "bg-white text-slate-800"
                      }`}
                    >
                      <div className="font-bold leading-none" style={{ fontSize: `${fitFont("₹" + fmtCompact(q.landedTotal), batchFs.price, 7)}px` }}>₹{fmtCompact(q.landedTotal)}</div>
                      {isWinner && <div className="font-bold uppercase leading-none mt-0.5" style={{ fontSize: `${batchFs.badge}px` }}>★Win</div>}
                      {isCheapest && !isWinner && <div className="font-bold uppercase leading-none mt-0.5" style={{ fontSize: `${batchFs.badge}px` }}>Low</div>}
                      {isHighest && !isCheapest && <div className="font-bold uppercase leading-none mt-0.5" style={{ fontSize: `${batchFs.badge}px` }}>Hi</div>}
                    </td>
                  );
                })}
              </tr>

              {/* ── VARIANCE ROW ── */}
              {sortedQuotes.length > 1 && (
                <tr>
                  <td className="border border-slate-300 px-1.5 py-1 font-semibold bg-slate-100 text-slate-600 uppercase overflow-hidden" style={{ fontSize: `${batchFs.sub}px` }}>
                    Variance vs Lowest
                  </td>
                  {batch.map((q) => {
                    const isCheapest = q.id === globalCheapestId;
                    const variance = q.landedTotal - (sortedQuotes[0]?.landedTotal ?? q.landedTotal);
                    const pct = sortedQuotes[0] ? (variance / sortedQuotes[0].landedTotal) * 100 : 0;
                    return (
                      <td
                        key={q.id}
                        className={`border border-slate-300 px-1 py-1 text-right tabular-nums overflow-hidden ${
                          isCheapest ? "bg-white text-slate-400" : "bg-red-50 text-red-600"
                        }`}
                      >
                        {isCheapest ? (
                          <span style={{ fontSize: `${batchFs.sub}px` }}>base</span>
                        ) : (
                          <>
                            <div className="font-bold" style={{ fontSize: `${fitFont("+" + fmtCompact(variance), batchFs.sub, 7)}px` }}>+{fmtCompact(variance)}</div>
                            <div style={{ fontSize: `${batchFs.micro}px` }}>+{pct.toFixed(1)}%</div>
                          </>
                        )}
                      </td>
                    );
                  })}
                </tr>
              )}

              {/* ── COMMERCIAL TERMS SECTION ── */}
              <tr>
                <td colSpan={batch.length + 1} className="border border-slate-300 px-1.5 py-1 bg-slate-200 text-slate-800 font-bold uppercase tracking-wider" style={{ fontSize: `${batchFs.section}px` }}>
                  Commercial Terms{canEdit ? " · tap to edit" : ""}
                </td>
              </tr>

              {/* Payment Terms — click to edit */}
              <tr>
                <td className="border border-slate-300 px-1.5 py-0.5 font-semibold bg-slate-100 text-slate-700 uppercase tracking-wide overflow-hidden" style={{ fontSize: `${batchFs.sub}px` }}>
                  Payment Terms
                </td>
                {batch.map((q) => {
                  const isThisEditing = editingTerm?.quoteId === q.id && editingTerm?.field === "paymentTerms";
                  const display = q.paymentTerms ?? "—";
                  const PAYMENT_OPTIONS = ["Advance payment", "7 days credit", "15 days credit", "30 days credit", "45 days credit", "60 days credit", "90 days credit"];
                  const isKnownOption = PAYMENT_OPTIONS.includes(display);
                  return (
                    <td
                      key={q.id}
                      onClick={() => canEdit && !isThisEditing && startEditTermCell(q.id, "paymentTerms", q.paymentTerms ?? "")}
                      className={`px-0.5 py-0.5 text-center overflow-hidden ${canEdit ? "border border-dashed border-slate-300 cursor-pointer hover:bg-amber-50/50" : "border border-slate-300"} ${isThisEditing ? "border-dashed border-slate-500 bg-amber-50" : ""}`}
                      style={{ fontSize: `${batchFs.sub}px` }}
                    >
                      {isThisEditing ? (
                        cellValue === "__custom" || (!isKnownOption && cellValue !== "" && !PAYMENT_OPTIONS.includes(cellValue)) ? (
                          <input
                            type="text"
                            autoFocus
                            onFocus={(e) => e.target.select()}
                            placeholder="Type custom…"
                            value={cellValue === "__custom" ? "" : cellValue}
                            onChange={(e) => syncCellValue(e.target.value)}
                            onKeyDown={(e) => {
                              if (e.key === "Enter") { e.preventDefault(); saveTermCell(q.id, "paymentTerms", cellValueRef.current); }
                              if (e.key === "Escape") { e.preventDefault(); setEditingTerm(null); }
                            }}
                            onBlur={() => { if (cellValueRef.current && cellValueRef.current !== "__custom") saveTermCell(q.id, "paymentTerms", cellValueRef.current); else setEditingTerm(null); }}
                            disabled={saving}
                            className="w-full bg-transparent text-center outline-none text-slate-900 font-semibold"
                            style={{ fontSize: `${batchFs.sub}px`, border: "none", color: "#1e293b" }}
                          />
                        ) : (
                          <select
                            autoFocus
                            value={isKnownOption ? cellValue : "__custom"}
                            onChange={(e) => {
                              const val = e.target.value === "__custom" ? "__custom" : e.target.value;
                              syncCellValue(val);
                              if (e.target.value !== "__custom") saveTermCell(q.id, "paymentTerms", e.target.value);
                            }}
                            onKeyDown={(e) => { if (e.key === "Escape") { e.preventDefault(); setEditingTerm(null); } }}
                            onBlur={() => { if (cellValueRef.current && cellValueRef.current !== "__custom") saveTermCell(q.id, "paymentTerms", cellValueRef.current); else setEditingTerm(null); }}
                            disabled={saving}
                            className="w-full bg-transparent text-center outline-none text-slate-900 font-semibold"
                            style={{ fontSize: `${batchFs.sub}px`, border: "none", color: "#1e293b" }}
                          >
                            {PAYMENT_OPTIONS.map((opt) => <option key={opt} value={opt}>{opt === "Advance payment" ? "Adv" : opt.replace(" days credit", "d cr")}</option>)}
                            {!isKnownOption && display !== "—" && <option value="__custom">{display}</option>}
                            <option value="__custom">Other…</option>
                          </select>
                        )
                      ) : (
                        <span className="text-slate-600">
                          {display === "Advance payment" ? "Adv" : display.includes("days credit") ? display.replace(" days credit", "d cr") : display.includes("days") ? display.replace(" days", "d") : display}
                        </span>
                      )}
                    </td>
                  );
                })}
              </tr>

              {/* Delivery Basis — click to edit (select) */}
              <tr>
                <td className="border border-slate-300 px-1.5 py-0.5 font-semibold bg-slate-100 text-slate-700 uppercase tracking-wide overflow-hidden" style={{ fontSize: `${batchFs.sub}px` }}>
                  Delivery Basis
                </td>
                {batch.map((q) => {
                  const isThisEditing = editingTerm?.quoteId === q.id && editingTerm?.field === "deliveryTermsType";
                  return (
                    <td
                      key={q.id}
                      onClick={() => canEdit && !isThisEditing && startEditTermCell(q.id, "deliveryTermsType", q.deliveryTermsType)}
                      className={`px-1 py-0.5 text-center overflow-hidden ${canEdit ? "border border-dashed border-slate-300 cursor-pointer hover:bg-amber-50/50" : "border border-slate-300"} ${isThisEditing ? "border-dashed border-slate-500 bg-amber-50" : ""}`}
                      style={{ fontSize: `${batchFs.sub}px` }}
                    >
                      {isThisEditing ? (
                        <select
                          autoFocus
                          value={cellValue}
                          onChange={(e) => { syncCellValue(e.target.value); saveTermCell(q.id, "deliveryTermsType", e.target.value); }}
                          onKeyDown={(e) => { if (e.key === "Escape") { e.preventDefault(); setEditingTerm(null); } }}
                          className="w-full bg-transparent text-center outline-none text-slate-900 font-semibold"
                          style={{ fontSize: `${batchFs.sub}px`, border: "none", color: "#1e293b" }}
                        >
                          <option value="DELIVERED_SITE">Delivered</option>
                          <option value="EX_WORKS">Ex-Works</option>
                          <option value="FOR_STATION">FOR</option>
                          <option value="CUSTOM">Custom</option>
                        </select>
                      ) : (
                        <DeliveryPill type={q.deliveryTermsType} fs={batchFs.sub} />
                      )}
                    </td>
                  );
                })}
              </tr>

              {/* Lead Time — click to edit */}
              <tr>
                <td className="border border-slate-300 px-1.5 py-0.5 font-semibold bg-slate-100 text-slate-700 uppercase tracking-wide overflow-hidden" style={{ fontSize: `${batchFs.sub}px` }}>
                  Lead Time
                </td>
                {batch.map((q) => {
                  const isThisEditing = editingTerm?.quoteId === q.id && editingTerm?.field === "leadTimeDays";
                  const valid = batch.filter((x) => x.leadTimeDays != null).map((x) => x.leadTimeDays!);
                  const isBest = q.leadTimeDays != null && valid.length > 0 && q.leadTimeDays === Math.min(...valid);
                  return (
                    <td
                      key={q.id}
                      onClick={() => canEdit && !isThisEditing && startEditTermCell(q.id, "leadTimeDays", q.leadTimeDays?.toString() ?? "")}
                      className={`px-1 py-0.5 text-center overflow-hidden ${canEdit ? "border border-dashed border-slate-300 cursor-pointer hover:bg-amber-50/50" : "border border-slate-300"} ${isThisEditing ? "border-dashed border-slate-500 bg-amber-50" : ""} ${isBest ? "bg-emerald-50 text-emerald-700 font-semibold" : ""}`}
                      style={{ fontSize: `${batchFs.sub}px` }}
                    >
                      {isThisEditing ? (
                        <input
                          type="text"
                          inputMode="numeric"
                          autoFocus
                          onFocus={(e) => e.target.select()}
                          value={cellValue}
                          onChange={(e) => syncCellValue(e.target.value)}
                          onKeyDown={(e) => {
                            if (e.key === "Enter") { e.preventDefault(); saveTermCell(q.id, "leadTimeDays", cellValueRef.current); }
                            if (e.key === "Escape") { e.preventDefault(); setEditingTerm(null); }
                          }}
                          onBlur={(e) => { syncCellValue(e.target.value); saveTermCell(q.id, "leadTimeDays", cellValueRef.current); }}
                          disabled={saving}
                          className="w-full bg-transparent text-center outline-none text-slate-900 font-semibold"
                          style={{ fontSize: `${batchFs.sub}px`, border: "none", color: "#1e293b" }}
                        />
                      ) : (
                        <span className="text-slate-600">{q.leadTimeDays != null ? `${q.leadTimeDays}d` : "—"}</span>
                      )}
                    </td>
                  );
                })}
              </tr>

              {/* Warranty — click to edit */}
              <tr>
                <td className="border border-slate-300 px-1.5 py-0.5 font-semibold bg-slate-100 text-slate-700 uppercase tracking-wide overflow-hidden" style={{ fontSize: `${batchFs.sub}px` }}>
                  Warranty
                </td>
                {batch.map((q) => {
                  const isThisEditing = editingTerm?.quoteId === q.id && editingTerm?.field === "warranty";
                  const w = q.warranty ?? "—";
                  const WARRANTY_OPTIONS = ["No warranty", "3 months", "6 months", "9 months", "12 months", "18 months", "24 months", "36 months", "60 months"];
                  const isKnownOption = WARRANTY_OPTIONS.includes(w);
                  return (
                    <td
                      key={q.id}
                      onClick={() => canEdit && !isThisEditing && startEditTermCell(q.id, "warranty", q.warranty ?? "")}
                      className={`px-0.5 py-0.5 text-center overflow-hidden ${canEdit ? "border border-dashed border-slate-300 cursor-pointer hover:bg-amber-50/50" : "border border-slate-300"} ${isThisEditing ? "border-dashed border-slate-500 bg-amber-50" : ""}`}
                      style={{ fontSize: `${batchFs.sub}px` }}
                    >
                      {isThisEditing ? (
                        cellValue === "__custom" || (!isKnownOption && cellValue !== "" && !WARRANTY_OPTIONS.includes(cellValue)) ? (
                          <input
                            type="text"
                            autoFocus
                            onFocus={(e) => e.target.select()}
                            placeholder="Type custom…"
                            value={cellValue === "__custom" ? "" : cellValue}
                            onChange={(e) => syncCellValue(e.target.value)}
                            onKeyDown={(e) => {
                              if (e.key === "Enter") { e.preventDefault(); saveTermCell(q.id, "warranty", cellValueRef.current); }
                              if (e.key === "Escape") { e.preventDefault(); setEditingTerm(null); }
                            }}
                            onBlur={() => { if (cellValueRef.current && cellValueRef.current !== "__custom") saveTermCell(q.id, "warranty", cellValueRef.current); else setEditingTerm(null); }}
                            disabled={saving}
                            className="w-full bg-transparent text-center outline-none text-slate-900 font-semibold"
                            style={{ fontSize: `${batchFs.sub}px`, border: "none", color: "#1e293b" }}
                          />
                        ) : (
                          <select
                            autoFocus
                            value={isKnownOption ? cellValue : "__custom"}
                            onChange={(e) => {
                              const val = e.target.value === "__custom" ? "__custom" : e.target.value;
                              syncCellValue(val);
                              if (e.target.value !== "__custom") saveTermCell(q.id, "warranty", e.target.value);
                            }}
                            onKeyDown={(e) => { if (e.key === "Escape") { e.preventDefault(); setEditingTerm(null); } }}
                            onBlur={() => { if (cellValueRef.current && cellValueRef.current !== "__custom") saveTermCell(q.id, "warranty", cellValueRef.current); else setEditingTerm(null); }}
                            disabled={saving}
                            className="w-full bg-transparent text-center outline-none text-slate-900 font-semibold"
                            style={{ fontSize: `${batchFs.sub}px`, border: "none", color: "#1e293b" }}
                          >
                            {WARRANTY_OPTIONS.map((opt) => <option key={opt} value={opt}>{opt === "No warranty" ? "None" : opt.replace(" months", "mo")}</option>)}
                            {!isKnownOption && w !== "—" && <option value="__custom">{w}</option>}
                            <option value="__custom">Other…</option>
                          </select>
                        )
                      ) : (
                        <span className="text-slate-600">{w === "No warranty" ? "None" : w.includes("months") ? w.replace(" months", "mo") : w}</span>
                      )}
                    </td>
                  );
                })}
              </tr>

              {/* Valid Until — click to edit */}
              <tr>
                <td className="border border-slate-300 px-1.5 py-0.5 font-semibold bg-slate-100 text-slate-700 uppercase tracking-wide overflow-hidden" style={{ fontSize: `${batchFs.sub}px` }}>
                  Valid Until
                </td>
                {batch.map((q) => {
                  const isThisEditing = editingTerm?.quoteId === q.id && editingTerm?.field === "validUntil";
                  return (
                    <td
                      key={q.id}
                      onClick={() => canEdit && !isThisEditing && startEditTermCell(q.id, "validUntil", q.validUntil ? q.validUntil.split("T")[0] ?? "" : "")}
                      className={`px-1 py-0.5 text-center overflow-hidden ${canEdit ? "border border-dashed border-slate-300 cursor-pointer hover:bg-amber-50/50" : "border border-slate-300"} ${isThisEditing ? "border-dashed border-slate-500 bg-amber-50" : ""} ${q.isExpired ? "bg-red-50 text-red-600" : q.daysUntilExpiry !== null && q.daysUntilExpiry <= 7 ? "bg-amber-50 text-amber-700" : ""}`}
                      style={{ fontSize: `${batchFs.sub}px` }}
                    >
                      {isThisEditing ? (
                        <input
                          type="date"
                          autoFocus
                          value={cellValue}
                          onChange={(e) => { syncCellValue(e.target.value); saveTermCell(q.id, "validUntil", e.target.value); }}
                          onKeyDown={(e) => { if (e.key === "Escape") { e.preventDefault(); setEditingTerm(null); } }}
                          className="w-full bg-transparent text-center outline-none text-slate-900 font-bold"
                          style={{ fontSize: `${batchFs.sub}px`, border: "none", color: "#1e293b", minHeight: "20px" }}
                        />
                      ) : q.validUntil ? (
                        <span className="flex flex-col items-center leading-tight">
                          <span className="font-bold text-slate-900" style={{ color: "#1e293b" }}>{fmtDateShort(q.validUntil)}</span>
                          {q.isExpired ? <span className="text-red-500 font-bold" style={{ fontSize: `${batchFs.micro}px` }}>expired</span> : q.daysUntilExpiry !== null ? <span className={q.daysUntilExpiry <= 7 ? "text-amber-600 font-semibold" : "text-slate-500"} style={{ fontSize: `${batchFs.micro}px` }}>{q.daysUntilExpiry}d left</span> : null}
                        </span>
                      ) : <span className="text-slate-400">—</span>}
                    </td>
                  );
                })}
              </tr>

              {/* Quote Document — expandable + downloadable */}
              <tr>
                <td className="border border-slate-300 px-1.5 py-0.5 font-semibold bg-slate-100 text-slate-700 uppercase tracking-wide overflow-hidden" style={{ fontSize: `${batchFs.sub}px` }}>
                  Quote Doc
                </td>
                {batch.map((q) => (
                  <td
                    key={q.id}
                    className="border border-slate-300 px-1 py-0.5 text-center overflow-hidden bg-white"
                    style={{ fontSize: `${batchFs.sub}px` }}
                  >
                    {q.fileUrl ? (
                      <div className="flex items-center justify-center gap-1">
                        <a
                          href={q.fileUrl}
                          target="_blank"
                          rel="noopener noreferrer"
                          className="inline-flex items-center gap-0.5 text-blue-600 hover:text-blue-800 font-semibold"
                          style={{ fontSize: `${batchFs.sub}px` }}
                        >
                          <ExternalLink style={{ width: batchFs.sub + 1, height: batchFs.sub + 1 }} />
                          View
                        </a>
                        <a
                          href={q.fileUrl}
                          download={q.fileName ?? undefined}
                          className="inline-flex items-center text-emerald-600 hover:text-emerald-800 font-semibold"
                          style={{ fontSize: `${batchFs.sub}px` }}
                        >
                          <Download style={{ width: batchFs.sub + 1, height: batchFs.sub + 1 }} />
                        </a>
                      </div>
                    ) : (
                      <span className="text-slate-400">—</span>
                    )}
                  </td>
                ))}
              </tr>
            </tbody>
          </table>
        </div>
      </div>
    );
  }

  // ── Export comparative statement to Excel (CSV with BOM) ──
  function exportToExcel() {
    const supplierNames = sortedQuotes.map((q) => q.supplierName);
    const rows: Record<string, unknown>[] = [];

    // Per-material rows
    for (const line of lines) {
      const matrix = materialMatrix.find((m) => m.line.materialId === line.materialId);
      if (!matrix) continue;
      const row: Record<string, unknown> = { Material: `${line.materialCode} · ${line.materialName} (${line.qtyRequired} ${line.unit})` };
      for (const q of sortedQuotes) {
        const e = matrix.entries.find((en) => en?.quoteId === q.id);
        row[q.supplierName] = e ? e.unitLandedCost : "";
      }
      rows.push(row);
    }

    // Summary rows
    const summaryLabels: Record<string, (q: Quote) => number> = {
      "Subtotal (ex-GST)": (q) => q.subtotal,
      "GST Total": (q) => q.gstTotal,
      "Freight+Transport": (q) => q.freightTotal + q.buyerTransportTotal,
      "Loading": (q) => q.loadingTotal,
      "Insurance": (q) => q.insuranceTotal,
      "Handling": (q) => q.handlingTotal,
      "Landed Total": (q) => q.landedTotal,
    };
    for (const [label, fn] of Object.entries(summaryLabels)) {
      const row: Record<string, unknown> = { Material: label };
      for (const q of sortedQuotes) row[q.supplierName] = fn(q);
      rows.push(row);
    }

    // Commercial terms
    const termLabels: Record<string, (q: Quote) => string> = {
      "Payment Terms": (q) => q.paymentTerms ?? "",
      "Delivery Basis": (q) => q.deliveryTermsType === "EX_WORKS" ? "Ex-Works" : q.deliveryTermsType === "FOR_STATION" ? "FOR" : q.deliveryTermsType ?? "",
      "Lead Time (days)": (q) => q.leadTimeDays?.toString() ?? "",
      "Warranty": (q) => q.warranty ?? "",
      "Valid Until": (q) => q.validUntil ? fmtDateShort(q.validUntil) : "",
    };
    for (const [label, fn] of Object.entries(termLabels)) {
      const row: Record<string, unknown> = { Material: label };
      for (const q of sortedQuotes) row[q.supplierName] = fn(q);
      rows.push(row);
    }

    const columns = [
      { key: "Material", label: "Material" },
      ...supplierNames.map((s) => ({ key: s, label: s })),
    ];
    downloadCSV(`comparative-statement-${new Date().toISOString().slice(0, 10)}.csv`, rows, columns);
  }

  return (
    <div>
      {/* Export button — top right */}
      <div className="flex justify-end mb-1">
        <button
          onClick={exportToExcel}
          className="inline-flex items-center gap-1 rounded-md bg-emerald-600 px-2 py-1 text-white font-semibold hover:bg-emerald-700"
          style={{ fontSize: "10px" }}
        >
          <Download style={{ width: 12, height: 12 }} />
          Excel
        </button>
      </div>
      {batchStarts.map((start) => renderBatchTable(start))}
    </div>
  );
}

// ── Per-material section ──
function MatSection({
  line, entries, hasMultiple, isExpanded, onToggle, fs,
  canEdit, editingCell, cellValue, saving,
  onStartEditCell, onSaveCell, onCancelCell, onCellValueChange,
}: {
  line: RequestLine;
  entries: {
    quoteId: string;
    supplierName: string;
    deliveryTermsType: "DELIVERED_SITE" | "EX_WORKS" | "FOR_STATION" | "CUSTOM";
    unitPrice: number;
    gstRate: number;
    gstAmount: number;
    discountPerUnit: number;
    packingPerUnit: number;
    freightPerUnit: number;
    loadingPerUnit: number;
    insurancePerUnit: number;
    handlingPerUnit: number;
    buyerTransportPerUnit: number;
    unitLandedCost: number;
    lineTotal: number;
    qty: number;
    isCheapest: boolean;
    isSelected: boolean;
  }[];
  hasMultiple: boolean;
  isExpanded: boolean;
  onToggle: () => void;
  fs: { supplier: number; price: number; sub: number; micro: number; label: number; badge: number; section: number };
  canEdit?: boolean;
  editingCell: { quoteId: string; materialId: string; field: string } | null;
  cellValue: string;
  saving?: boolean;
  onStartEditCell?: (quoteId: string, field: string, currentValue: number) => void;
  onSaveCell?: () => void;
  onCancelCell?: () => void;
  onCellValueChange?: (v: string) => void;
}) {
  const componentRows = [
    { label: "Basic Price", field: "unitPrice" as const, getValue: (e: typeof entries[0]) => e.unitPrice, show: true },
    { label: "Discount", field: "discountPerUnit" as const, getValue: (e: typeof entries[0]) => -e.discountPerUnit, prefix: "−" },
    { label: "Packing", field: "packingPerUnit" as const, getValue: (e: typeof entries[0]) => e.packingPerUnit },
    { label: "GST", field: null as null, getValue: (e: typeof entries[0]) => e.gstAmount / e.qty },
    { label: "Freight", field: "freightPerUnit" as const, getValue: (e: typeof entries[0]) => e.freightPerUnit },
    { label: "Buyer Transport", field: "buyerTransportPerUnit" as const, getValue: (e: typeof entries[0]) => e.buyerTransportPerUnit },
    { label: "Loading", field: "loadingPerUnit" as const, getValue: (e: typeof entries[0]) => e.loadingPerUnit },
    { label: "Insurance", field: "insurancePerUnit" as const, getValue: (e: typeof entries[0]) => e.insurancePerUnit },
    { label: "Handling", field: "handlingPerUnit" as const, getValue: (e: typeof entries[0]) => e.handlingPerUnit },
  ];

  return (
    <>
      {/* Material header row */}
      <tr>
        <td className="border border-slate-300 px-1.5 py-1 bg-blue-50 overflow-hidden">
          <button onClick={onToggle} className="flex items-center gap-0.5 w-full text-left">
            {isExpanded ? <ChevronUp className="shrink-0 text-blue-600" style={{ width: fs.micro + 2, height: fs.micro + 2 }} /> : <ChevronDown className="shrink-0 text-blue-600" style={{ width: fs.micro + 2, height: fs.micro + 2 }} />}
            <div className="min-w-0 overflow-hidden">
              <div className="font-bold text-blue-900 truncate" style={{ fontSize: `${fs.supplier}px` }}>{line.materialName}</div>
              <div className="font-mono text-blue-500 truncate" style={{ fontSize: `${fs.micro}px` }}>
                {line.materialCode} · {formatNumber(line.qtyRequired, 0)} {line.unit} · GST {line.gstRate}%
              </div>
              {line.lastRate && (
                <div className="flex items-center gap-0.5 text-slate-500 truncate" style={{ fontSize: `${fs.micro}px` }}>
                  <TrendingUp style={{ width: fs.micro, height: fs.micro }} />
                  Last: {fmtCompact(line.lastRate.unitCost)}/{line.unit}
                </div>
              )}
            </div>
          </button>
        </td>
        {entries.map((e) => {
          const isWinner = e.isSelected;
          const isCheapest = e.isCheapest;
          return (
            <td
              key={e.quoteId}
              className={`border border-slate-300 px-1 py-1 text-center tabular-nums overflow-hidden ${
                isWinner ? "bg-green-50" : isCheapest ? "bg-emerald-50" : "bg-white"
              }`}
            >
              <div className="flex items-center justify-center gap-0.5">
                {isWinner && <Crown className="shrink-0 text-green-600" style={{ width: fs.badge + 2, height: fs.badge + 2 }} />}
                {isCheapest && !isWinner && <Trophy className="shrink-0 text-emerald-500" style={{ width: fs.badge + 2, height: fs.badge + 2 }} />}
                <span className={`font-bold ${isWinner ? "text-green-700" : isCheapest ? "text-emerald-700" : "text-slate-700"}`} style={{ fontSize: `${fitFont(fmtCompact(e.unitLandedCost), fs.price, 6)}px` }}>
                  {fmtCompact(e.unitLandedCost)}
                </span>
              </div>
              <div className="text-slate-400 truncate" style={{ fontSize: `${fitFont(fmtCompact(e.lineTotal), fs.micro, 8)}px` }}>/{line.unit} · {fmtCompact(e.lineTotal)}</div>
            </td>
          );
        })}
      </tr>

      {/* Cartel warning */}
      {line.allQuotesAboveLastRate && line.lastRate && (
        <tr>
          <td colSpan={entries.length + 1} className="border border-slate-300 px-1.5 py-1 bg-amber-50">
            <div className="flex items-center gap-0.5 text-amber-700">
              <AlertCircle className="shrink-0" style={{ width: fs.micro + 2, height: fs.micro + 2 }} />
              <span style={{ fontSize: `${fs.sub}px` }}>
                All quotes <strong>{line.minVariancePct}% above</strong> last rate ({fmtCompact(line.lastRate.unitCost)}/{line.unit}). Verify.
              </span>
            </div>
          </td>
        </tr>
      )}

      {/* Expanded cost breakdown */}
      {isExpanded && componentRows.map((row) => {
        const anyNonZero = entries.some((e) => Math.abs(row.getValue(e)) > 0.001);
        if (!anyNonZero && !row.show) return null;
        const values = entries.map((e) => row.getValue(e));
        const positiveVals = values.filter((v) => v > 0);
        const minVal = positiveVals.length > 0 ? Math.min(...positiveVals) : 0;

        return (
          <tr key={row.label} className="bg-slate-50/50">
            <td className="border border-slate-300 px-1 py-0.5 pl-4 text-slate-500 overflow-hidden" style={{ fontSize: `${fs.sub}px` }}>
              {row.label}
            </td>
            {entries.map((e) => {
              const v = row.getValue(e);
              const isZero = Math.abs(v) < 0.001;
              const isMin = !isZero && v === minVal && v > 0 && hasMultiple;
              const isThisCellEditing = editingCell?.quoteId === e.quoteId && editingCell?.field === row.field;
              const isEditable = canEdit && row.field !== null;

              // ── This cell is being edited: show input with dashed boundary ──
              if (isThisCellEditing) {
                return (
                  <td
                    key={e.quoteId}
                    className="border border-dashed border-slate-500 px-1 py-0.5 overflow-hidden bg-amber-50"
                    style={{ fontSize: `${fs.sub}px` }}
                  >
                    <input
                      type="text"
                      inputMode="decimal"
                      autoFocus
                      onFocus={(ev) => ev.target.select()}
                      value={cellValue}
                      onChange={(ev) => onCellValueChange?.(ev.target.value)}
                      onKeyDown={(ev) => {
                        if (ev.key === "Enter") { ev.preventDefault(); onSaveCell?.(); }
                        if (ev.key === "Escape") { ev.preventDefault(); onCancelCell?.(); }
                      }}
                      onBlur={(ev) => {
                        // Read directly from the DOM to avoid stale state
                        onCellValueChange?.(ev.target.value);
                        onSaveCell?.();
                      }}
                      disabled={saving}
                      className="w-full bg-transparent text-right tabular-nums outline-none text-slate-900 font-semibold"
                      style={{ fontSize: `${fs.sub}px`, border: "none", color: "#1e293b" }}
                    />
                  </td>
                );
              }

              // ── Display mode: click to edit if editable ──
              return (
                <td
                  key={e.quoteId}
                  onClick={() => {
                    if (isEditable && row.field && onStartEditCell) {
                      onStartEditCell(e.quoteId, row.field, Math.abs(v));
                    }
                  }}
                  className={`border px-1 py-0.5 text-right tabular-nums overflow-hidden ${
                    isEditable ? "border-dashed border-slate-300 cursor-pointer hover:bg-amber-50/50" : "border-slate-300"
                  } ${
                    isZero ? "text-slate-300" : "text-slate-600"
                  } ${isMin ? "bg-emerald-50 font-semibold text-emerald-700" : ""}`}
                  style={{ fontSize: `${isZero ? fs.sub : fitFont(`${row.prefix ?? ""}${fmtCompact(Math.abs(v))}`, fs.sub, 6)}px` }}
                >
                  {isZero ? "—" : `${row.prefix ?? ""}${fmtCompact(Math.abs(v))}`}
                </td>
              );
            })}
          </tr>
        );
      })}
    </>
  );
}

// ── Summary row (Subtotal, GST, etc.) ──
function SummaryRow({
  label, quotes, getValue, remark, fs,
}: {
  label: string;
  quotes: Quote[];
  getValue: (q: Quote) => number;
  remark?: string;
  fs: { supplier: number; price: number; sub: number; micro: number; label: number; badge: number; section: number };
}) {
  const values = quotes.map(getValue);
  const minVal = Math.min(...values.filter((v) => v > 0));
  return (
    <tr>
      <td className="border border-slate-300 px-1.5 py-0.5 font-semibold bg-slate-100 text-slate-700 uppercase tracking-wide overflow-hidden" style={{ fontSize: `${fs.sub}px` }}>
        {label}
      </td>
      {quotes.map((q, idx) => {
        const v = getValue(q);
        const isCheapest = v > 0 && v === minVal && quotes.length > 1;
        const isHighest = v > 0 && v === Math.max(...values) && v !== minVal && quotes.length > 1;
        return (
          <td
            key={q.id}
            className={`border border-slate-300 px-1 py-0.5 text-right tabular-nums font-medium overflow-hidden ${
              isCheapest ? "bg-emerald-50 text-emerald-700" : isHighest ? "bg-red-50 text-red-500" : "bg-white text-slate-700"
            }`}
            style={{ fontSize: `${v > 0 ? fitFont(fmtCompact(v), fs.sub, 7) : fs.sub}px` }}
          >
            {v > 0 ? fmtCompact(v) : "—"}
          </td>
        );
      })}
    </tr>
  );
}

// ── Delivery pill ──
function DeliveryPill({
  type,
  onDark = false,
  fs = 9,
}: {
  type: "DELIVERED_SITE" | "EX_WORKS" | "FOR_STATION" | "CUSTOM" | null | undefined;
  onDark?: boolean;
  fs?: number;
}) {
  const config: Record<string, { label: string; light: string; dark: string }> = {
    EX_WORKS: { label: "ExW", light: "bg-amber-100 text-amber-700", dark: "bg-amber-500/30 text-amber-200" },
    FOR_STATION: { label: "FOR", light: "bg-amber-100 text-amber-700", dark: "bg-amber-500/30 text-amber-200" },
    DELIVERED_SITE: { label: "Del", light: "bg-slate-200 text-slate-700", dark: "bg-white/20 text-white" },
    CUSTOM: { label: "Cus", light: "bg-slate-200 text-slate-700", dark: "bg-white/20 text-white" },
  };
  const c = config[type ?? "EX_WORKS"] ?? config.EX_WORKS!;
  const label = c?.label ?? "ExW";
  const lightClass = c?.light ?? "bg-slate-200 text-slate-700";
  const darkClass = c?.dark ?? "bg-white/20 text-white";
  return (
    <span className={`inline-flex items-center gap-0 font-semibold ${onDark ? darkClass : lightClass}`} style={{ fontSize: `${fs}px` }}>
      {label}
    </span>
  );
}

/* ═══════════════════════════════════════════════════════════════════════════
   ADD QUOTE DIALOG — full-screen modal with:
   - Supplier picker (with inline "new supplier" creation)
   - File upload (camera or file picker)
   - Per-line entry: qty, unit price, freight, handling
   - Live per-piece landed cost computation
   ═══════════════════════════════════════════════════════════════════════════ */
function AddQuoteDialog({
  request,
  lines,
  suppliers,
  existingQuotes,
  onClose,
  onAdded,
}: {
  request: Request;
  lines: RequestLine[];
  suppliers: Supplier[];
  existingQuotes: Quote[];
  onClose: () => void;
  onAdded: () => void;
}) {
  // ── Sensible defaults (reduces friction for the common case) ──
  const todayPlus30 = new Date(Date.now() + 30 * 24 * 60 * 60 * 1000).toISOString().slice(0, 10);
  const DELIVERY_LABELS: Record<string, string> = {
    DELIVERED_SITE: "Delivered to site",
    EX_WORKS: "Ex-works (we pick up)",
    FOR_STATION: "FOR station",
    CUSTOM: "",
  };
  const [supplierId, setSupplierId] = useState("");
  const [showNewSupplier, setShowNewSupplier] = useState(false);
  const [newSupplier, setNewSupplier] = useState({ name: "", gstin: "", phone: "", email: "", address: "" });
  const [fileUrl, setFileUrl] = useState("");
  const [fileName, setFileName] = useState("");
  const [mimeType, setMimeType] = useState("");
  const [uploading, setUploading] = useState(false);
  const [quoteSource, setQuoteSource] = useState<"DOCUMENT" | "EMAIL" | "VERBAL" | "WHATSAPP" | "LETTER" | "EXCEL">("DOCUMENT");
  const [sourceNote, setSourceNote] = useState("");
  const [saving, setSaving] = useState(false);
  const [notes, setNotes] = useState("");
  const [validUntil, setValidUntil] = useState(todayPlus30);
  const [paymentTerms, setPaymentTerms] = useState("30 days credit");
  const [deliveryTerms, setDeliveryTerms] = useState("Delivered to site");
  const [deliveryTermsType, setDeliveryTermsType] = useState<"DELIVERED_SITE" | "EX_WORKS" | "FOR_STATION" | "CUSTOM">("DELIVERED_SITE");
  const [leadTimeDays, setLeadTimeDays] = useState("7");
  const [warranty, setWarranty] = useState("");
  // Per-line: qty is read-only (from request), only rate is shown by default.
  // Cost components are behind a per-line toggle ("+ costs").
  const [lineData, setLineData] = useState<Record<string, { qty: string; unitPrice: string; discount: string; packing: string; freight: string; loading: string; insurance: string; handling: string; buyerTransport: string }>>(
    Object.fromEntries(lines.map((l) => [l.materialId, { qty: String(l.qtyRequired), unitPrice: "", discount: "0", packing: "0", freight: "0", loading: "0", insurance: "0", handling: "0", buyerTransport: "0" }])),
  );
  const [expandedLines, setExpandedLines] = useState<Set<string>>(new Set());

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
      setFileName(data.fileName ?? file.name);
      setMimeType(data.mimeType ?? file.type);
      toast.success("Quote file uploaded");
    } catch (err: unknown) {
      toast.error(err instanceof Error ? err.message : "Upload failed");
    } finally {
      setUploading(false);
    }
  }

  function updateLine(materialId: string, field: "qty" | "unitPrice" | "discount" | "packing" | "freight" | "loading" | "insurance" | "handling" | "buyerTransport", value: string) {
    setLineData((prev) => {
      const existing = prev[materialId] ?? { qty: "", unitPrice: "", discount: "0", packing: "0", freight: "0", loading: "0", insurance: "0", handling: "0", buyerTransport: "0" };
      return { ...prev, [materialId]: { ...existing, [field]: value } };
    });
  }

  // Auto-fill deliveryTerms text when type changes (non-CUSTOM)
  function changeDeliveryType(type: "DELIVERED_SITE" | "EX_WORKS" | "FOR_STATION" | "CUSTOM") {
    setDeliveryTermsType(type);
    if (type !== "CUSTOM") {
      setDeliveryTerms(DELIVERY_LABELS[type] ?? "");
    }
  }

  // Copy rates from a previous supplier's quote — lets the user adjust from
  // a baseline instead of typing from scratch (SAP "copy quotation" pattern).
  function copyFromQuote(quoteId: string) {
    const q = existingQuotes.find((x) => x.id === quoteId);
    if (!q) return;
    setLineData((prev) => {
      const next = { ...prev };
      for (const l of lines) {
        const ql = q.lines.find((ql) => ql.materialId === l.materialId);
        if (ql) {
          next[l.materialId] = {
            qty: String(l.qtyRequired),
            unitPrice: String(ql.unitPrice),
            discount: String(ql.discountPerUnit),
            packing: String(ql.packingPerUnit),
            freight: String(ql.freightPerUnit),
            loading: String(ql.loadingPerUnit),
            insurance: String(ql.insurancePerUnit),
            handling: String(ql.handlingPerUnit),
            buyerTransport: String(ql.buyerTransportPerUnit),
          };
        }
      }
      return next;
    });
    // Also copy commercial terms as a starting point
    if (q.paymentTerms) setPaymentTerms(q.paymentTerms);
    if (q.deliveryTermsType) changeDeliveryType(q.deliveryTermsType);
    if (q.deliveryTerms && q.deliveryTermsType === "CUSTOM") setDeliveryTerms(q.deliveryTerms);
    if (q.leadTimeDays != null) setLeadTimeDays(String(q.leadTimeDays));
    if (q.warranty) setWarranty(q.warranty);
    if (q.validUntil) setValidUntil(q.validUntil.slice(0, 10));
    toast.success(`Copied rates from ${q.supplierName} — adjust as needed`);
  }

  function toggleLineExpanded(materialId: string) {
    setExpandedLines((prev) => {
      const next = new Set(prev);
      if (next.has(materialId)) next.delete(materialId);
      else next.add(materialId);
      return next;
    });
  }

  // Live per-piece landed cost computation (full real-world formula).
  function computePerPiece(materialId: string, gstRate: number): number {
    const d = lineData[materialId];
    if (!d) return 0;
    const unitPrice = parseFloat(d.unitPrice) || 0;
    const discount = parseFloat(d.discount) || 0;
    const packing = parseFloat(d.packing) || 0;
    const freight = parseFloat(d.freight) || 0;
    const loading = parseFloat(d.loading) || 0;
    const insurance = parseFloat(d.insurance) || 0;
    const handling = parseFloat(d.handling) || 0;
    const buyerTransport = parseFloat(d.buyerTransport) || 0;
    const taxableValuePerUnit = unitPrice - discount + packing;
    const gstPerUnit = (taxableValuePerUnit * gstRate) / 100;
    return taxableValuePerUnit + gstPerUnit + freight + buyerTransport + loading + insurance + handling;
  }

  async function onSubmit() {
    if (!supplierId && !showNewSupplier) {
      toast.error("Select a supplier or create a new one");
      return;
    }
    if (showNewSupplier && !newSupplier.name.trim()) {
      toast.error("Supplier name is required");
      return;
    }
    // File is required for document-based sources; optional for verbal/email.
    const needsFile = ["DOCUMENT", "LETTER", "EXCEL"].includes(quoteSource);
    if (needsFile && !fileUrl) {
      toast.error("Upload a quote file (PDF, image, or Excel)");
      return;
    }
    if (!needsFile && !sourceNote.trim()) {
      toast.error(`A source note is required for ${quoteSource.toLowerCase()} quotes (e.g. "Verbal quote from Ramesh on 15-Aug over phone")`);
      return;
    }
    if (!validUntil) {
      toast.error("Quote validity date is mandatory — expired quotes are invalid");
      return;
    }
    if (!paymentTerms.trim()) {
      toast.error("Payment terms are mandatory (e.g. '30 days credit')");
      return;
    }
    if (deliveryTermsType === "CUSTOM" && !deliveryTerms.trim()) {
      toast.error("Delivery terms detail is required when delivery basis is 'Custom'");
      return;
    }
    if (!leadTimeDays || parseInt(leadTimeDays) < 0) {
      toast.error("Lead time in days is mandatory");
      return;
    }
    // Conditional: if ex-works or FOR-station, buyer transport must be > 0 on every line
    if (deliveryTermsType === "EX_WORKS" || deliveryTermsType === "FOR_STATION") {
      for (const l of lines) {
        const d = lineData[l.materialId];
        const buyerTransport = parseFloat(d?.buyerTransport ?? "0");
        if (!buyerTransport || buyerTransport <= 0) {
          toast.error(`Buyer transport is mandatory for ${deliveryTermsType === "EX_WORKS" ? "ex-works" : "FOR-station"} quotes — enter estimated transport for ${l.materialName}`);
          return;
        }
      }
    }
    for (const l of lines) {
      const d = lineData[l.materialId];
      if (!d) continue;
      const qty = parseFloat(d.qty);
      const unitPrice = parseFloat(d.unitPrice);
      if (!qty || qty <= 0) {
        toast.error(`Enter a valid quantity for ${l.materialName}`);
        return;
      }
      if (isNaN(unitPrice) || unitPrice < 0) {
        toast.error(`Enter a valid unit price for ${l.materialName}`);
        return;
      }
    }

    setSaving(true);
    try {
      const payload: Record<string, unknown> = {
        supplierId: supplierId || undefined,
        newSupplier: showNewSupplier
          ? {
              name: newSupplier.name.trim(),
              gstin: newSupplier.gstin.trim() || null,
              phone: newSupplier.phone.trim() || null,
              email: newSupplier.email.trim() || null,
              address: newSupplier.address.trim() || null,
            }
          : undefined,
        fileUrl: fileUrl || undefined,
        fileName: fileName || undefined,
        mimeType: mimeType || undefined,
        quoteSource,
        sourceNote: sourceNote.trim() || undefined,
        validUntil,
        notes: notes.trim() || null,
        paymentTerms: paymentTerms.trim() || null,
        deliveryTermsType,
        deliveryTerms: deliveryTerms.trim() || null,
        leadTimeDays: leadTimeDays ? parseInt(leadTimeDays) : null,
        warranty: warranty.trim() || null,
        lines: lines.map((l) => {
          const d = lineData[l.materialId]!;
          return {
            materialId: l.materialId,
            qty: parseFloat(d.qty),
            unitPrice: parseFloat(d.unitPrice) || 0,
            discountPerUnit: parseFloat(d.discount) || 0,
            packingPerUnit: parseFloat(d.packing) || 0,
            freightPerUnit: parseFloat(d.freight) || 0,
            loadingPerUnit: parseFloat(d.loading) || 0,
            insurancePerUnit: parseFloat(d.insurance) || 0,
            handlingPerUnit: parseFloat(d.handling) || 0,
            buyerTransportPerUnit: parseFloat(d.buyerTransport) || 0,
          };
        }),
      };
      const res = await fetch(`/api/quotations/${request.id}/quotes`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(payload),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error ?? "Failed to add quote");
      toast.success("Quote added", { description: data.supplierName });
      onAdded();
    } catch (err: unknown) {
      toast.error(err instanceof Error ? err.message : "Failed");
    } finally {
      setSaving(false);
    }
  }

  const inputClass = "w-full rounded-[0.375rem] border px-2.5 py-2 text-[0.75rem] font-medium outline-none focus:ring-2";
  const inputStyle = { borderColor: "var(--color-line)", backgroundColor: "var(--color-paper)", color: "var(--color-ink-950)" };

  return (
    <div className="fixed inset-0 z-50 flex flex-col" style={{ backgroundColor: "var(--color-paper)" }}>
      {/* Header */}
      <div className="flex items-center gap-2 p-3 border-b" style={{ borderColor: "var(--color-line)" }}>
        <button onClick={onClose} className="p-1" style={{ color: "var(--color-ink-700)" }}>
          <X className="size-5" />
        </button>
        <p className="text-[0.875rem] font-bold" style={{ color: "var(--color-ink-950)" }}>
          Add Supplier Quote
        </p>
      </div>

      {/* Body */}
      <div className="flex-1 overflow-y-auto p-3 space-y-3">
        {/* ── Supplier ── */}
        <div className="rounded-[0.625rem] border p-3 space-y-2" style={{ borderColor: "var(--color-line)", backgroundColor: "var(--color-paper)" }}>
          <div className="flex items-center gap-1.5 border-b pb-2" style={{ borderColor: "var(--color-line)" }}>
            <Truck className="size-3.5" style={{ color: "var(--color-steel)" }} />
            <span className="text-[0.5625rem] font-bold uppercase tracking-wide" style={{ color: "var(--color-ink-500)" }}>
              Supplier
            </span>
          </div>

          {showNewSupplier ? (
            <div className="space-y-2">
              <input
                type="text"
                value={newSupplier.name}
                onChange={(e) => setNewSupplier((s) => ({ ...s, name: e.target.value }))}
                placeholder="Supplier name *"
                className={inputClass}
                style={inputStyle}
                autoFocus
              />
              <div className="grid grid-cols-2 gap-2">
                <input
                  type="text"
                  value={newSupplier.gstin}
                  onChange={(e) => setNewSupplier((s) => ({ ...s, gstin: e.target.value.toUpperCase() }))}
                  placeholder="GSTIN"
                  maxLength={15}
                  className={`${inputClass} font-mono`}
                  style={inputStyle}
                />
                <input
                  type="tel"
                  value={newSupplier.phone}
                  onChange={(e) => setNewSupplier((s) => ({ ...s, phone: e.target.value }))}
                  placeholder="Phone"
                  className={`${inputClass} font-mono`}
                  style={inputStyle}
                />
              </div>
              <input
                type="email"
                value={newSupplier.email}
                onChange={(e) => setNewSupplier((s) => ({ ...s, email: e.target.value }))}
                placeholder="Email (optional)"
                className={inputClass}
                style={inputStyle}
              />
              <textarea
                value={newSupplier.address}
                onChange={(e) => setNewSupplier((s) => ({ ...s, address: e.target.value }))}
                placeholder="Address (optional)"
                rows={2}
                className={`${inputClass} resize-none`}
                style={inputStyle}
              />
              <button
                onClick={() => {
                  setShowNewSupplier(false);
                  setNewSupplier({ name: "", gstin: "", phone: "", email: "", address: "" });
                }}
                className="text-[0.625rem] font-semibold"
                style={{ color: "var(--color-steel)" }}
              >
                ← Use existing supplier
              </button>
            </div>
          ) : (
            <div className="space-y-2">
              <select
                value={supplierId}
                onChange={(e) => setSupplierId(e.target.value)}
                className={inputClass}
                style={inputStyle}
              >
                <option value="">Select supplier…</option>
                {suppliers.map((s) => (
                  <option key={s.id} value={s.id}>
                    {s.name}{s.phone ? ` · ${s.phone}` : ""}
                  </option>
                ))}
              </select>
              <button
                onClick={() => setShowNewSupplier(true)}
                className="flex items-center gap-1 text-[0.625rem] font-bold"
                style={{ color: "var(--color-signal-dark)" }}
              >
                <Plus className="size-3" />
                Add new supplier
              </button>
            </div>
          )}
        </div>

        {/* ── Quote source + file upload ── */}
        <div className="rounded-[0.625rem] border p-3 space-y-2" style={{ borderColor: "var(--color-line)", backgroundColor: "var(--color-paper)" }}>
          <div className="flex items-center gap-1.5 border-b pb-2" style={{ borderColor: "var(--color-line)" }}>
            <FileText className="size-3.5" style={{ color: "var(--color-steel)" }} />
            <span className="text-[0.5625rem] font-bold uppercase tracking-wide" style={{ color: "var(--color-ink-500)" }}>
              Quote Source <span style={{ color: "var(--color-stop)" }}>*</span>
            </span>
          </div>

          {/* Source type picker — not all quotes arrive as files */}
          <div>
            <label className="block text-[0.4375rem] font-semibold mb-1" style={{ color: "var(--color-ink-500)" }}>How was this quote received?</label>
            <div className="grid grid-cols-3 gap-1.5">
              {([
                { value: "DOCUMENT", label: "PDF/Photo" },
                { value: "EXCEL", label: "Excel" },
                { value: "LETTER", label: "Letter" },
                { value: "WHATSAPP", label: "WhatsApp" },
                { value: "EMAIL", label: "Email" },
                { value: "VERBAL", label: "Verbal" },
              ] as const).map((opt) => (
                <button
                  key={opt.value}
                  type="button"
                  onClick={() => setQuoteSource(opt.value)}
                  className="rounded-[0.375rem] border px-2 py-1.5 text-[0.5625rem] font-semibold"
                  style={{
                    borderColor: quoteSource === opt.value ? "var(--color-steel)" : "var(--color-line)",
                    backgroundColor: quoteSource === opt.value ? "var(--color-steel-wash)" : "var(--color-paper)",
                    color: quoteSource === opt.value ? "var(--color-steel-dark)" : "var(--color-ink-700)",
                  }}
                >
                  {opt.label}
                </button>
              ))}
            </div>
          </div>

          {/* File upload — only for document-based sources */}
          {["DOCUMENT", "LETTER", "EXCEL", "WHATSAPP"].includes(quoteSource) ? (
            fileUrl ? (
              <div className="flex items-center justify-between rounded-[0.5rem] border p-2" style={{ borderColor: "var(--color-go)", backgroundColor: "var(--color-go-wash)" }}>
                <div className="flex items-center gap-1.5 min-w-0">
                  <Check className="size-3.5 shrink-0" style={{ color: "var(--color-go)" }} />
                  <span className="text-[0.6875rem] font-semibold truncate" style={{ color: "var(--color-go)" }}>
                    {fileName}
                  </span>
                </div>
                <button
                  onClick={() => {
                    setFileUrl("");
                    setFileName("");
                    setMimeType("");
                  }}
                  className="text-[0.5625rem] font-semibold"
                  style={{ color: "var(--color-stop)" }}
                >
                  Remove
                </button>
              </div>
            ) : (
              <div className="grid grid-cols-2 gap-2">
                <label className="flex flex-col items-center justify-center gap-1 rounded-[0.5rem] border-2 border-dashed py-4 cursor-pointer press" style={{ borderColor: "var(--color-line)" }}>
                  {uploading ? <Loader2 className="size-5 animate-spin" style={{ color: "var(--color-steel)" }} /> : <Camera className="size-5" style={{ color: "var(--color-steel)" }} />}
                  <span className="text-[0.5625rem] font-semibold" style={{ color: "var(--color-ink-700)" }}>Camera</span>
                  <input type="file" accept="image/*" capture="environment" onChange={handleFileUpload} className="hidden" disabled={uploading} />
                </label>
                <label className="flex flex-col items-center justify-center gap-1 rounded-[0.5rem] border-2 border-dashed py-4 cursor-pointer press" style={{ borderColor: "var(--color-line)" }}>
                  {uploading ? <Loader2 className="size-5 animate-spin" style={{ color: "var(--color-steel)" }} /> : <Upload className="size-5" style={{ color: "var(--color-steel)" }} />}
                  <span className="text-[0.5625rem] font-semibold" style={{ color: "var(--color-ink-700)" }}>File</span>
                  <input type="file" accept="image/*,application/pdf,.xlsx,.xls,.csv" onChange={handleFileUpload} className="hidden" disabled={uploading} />
                </label>
              </div>
            )
          ) : null}

          {/* Source note — mandatory for non-document sources */}
          {!["DOCUMENT", "LETTER", "EXCEL"].includes(quoteSource) ? (
            <div>
              <label className="block text-[0.4375rem] font-semibold mb-1" style={{ color: "var(--color-ink-500)" }}>
                Source note <span style={{ color: "var(--color-stop)" }}>*</span>
              </label>
              <textarea
                value={sourceNote}
                onChange={(e) => setSourceNote(e.target.value)}
                rows={2}
                placeholder={quoteSource === "VERBAL" ? "e.g. Verbal quote from Ramesh (Ambuja) on 15-Aug-2026 over phone" : quoteSource === "EMAIL" ? "e.g. Email from supplier on 15-Aug-2026, subject: Quote for steel" : "e.g. WhatsApp message from supplier on 15-Aug-2026"}
                className={`${inputClass} resize-none text-[0.6875rem] py-1.5`}
                style={inputStyle}
              />
            </div>
          ) : null}
        </div>

        {/* ── Commercial terms (moved BEFORE prices — mandatory, top of mind) ── */}
        <div className="rounded-[0.625rem] border p-3 space-y-2" style={{ borderColor: "var(--color-line)", backgroundColor: "var(--color-paper)" }}>
          <div className="flex items-center gap-1.5 border-b pb-2" style={{ borderColor: "var(--color-line)" }}>
            <span className="text-[0.5625rem] font-bold uppercase tracking-wide" style={{ color: "var(--color-ink-500)" }}>
              Commercial Terms <span style={{ color: "var(--color-stop)" }}>*</span>
            </span>
          </div>
          <div className="grid grid-cols-2 gap-2">
            <div>
              <label className="block text-[0.4375rem] font-semibold mb-0.5" style={{ color: "var(--color-ink-500)" }}>Valid until <span style={{ color: "var(--color-stop)" }}>*</span></label>
              <input
                type="date"
                value={validUntil}
                onChange={(e) => setValidUntil(e.target.value)}
                className={`${inputClass} font-mono text-[0.6875rem] py-1.5`}
                style={inputStyle}
              />
            </div>
            <div>
              <label className="block text-[0.4375rem] font-semibold mb-0.5" style={{ color: "var(--color-ink-500)" }}>Lead time (days) <span style={{ color: "var(--color-stop)" }}>*</span></label>
              <input
                type="number"
                inputMode="numeric"
                min="0"
                value={leadTimeDays}
                onChange={(e) => setLeadTimeDays(e.target.value)}
                placeholder="e.g. 7"
                className={`${inputClass} font-mono text-[0.6875rem] py-1.5`}
                style={inputStyle}
              />
            </div>
            <div>
              <label className="block text-[0.4375rem] font-semibold mb-0.5" style={{ color: "var(--color-ink-500)" }}>Payment terms <span style={{ color: "var(--color-stop)" }}>*</span></label>
              <input
                type="text"
                value={paymentTerms}
                onChange={(e) => setPaymentTerms(e.target.value)}
                placeholder="e.g. 30 days credit"
                className={`${inputClass} text-[0.6875rem] py-1.5`}
                style={inputStyle}
              />
            </div>
            <div>
              <label className="block text-[0.4375rem] font-semibold mb-0.5" style={{ color: "var(--color-ink-500)" }}>Delivery basis <span style={{ color: "var(--color-stop)" }}>*</span></label>
              <select
                value={deliveryTermsType}
                onChange={(e) => changeDeliveryType(e.target.value as "DELIVERED_SITE" | "EX_WORKS" | "FOR_STATION" | "CUSTOM")}
                className={`${inputClass} text-[0.6875rem] py-1.5`}
                style={inputStyle}
              >
                <option value="DELIVERED_SITE">Delivered to site</option>
                <option value="EX_WORKS">Ex-works (we pick up)</option>
                <option value="FOR_STATION">FOR station</option>
                <option value="CUSTOM">Custom (specify)</option>
              </select>
              {deliveryTermsType === "CUSTOM" ? (
                <input
                  type="text"
                  value={deliveryTerms}
                  onChange={(e) => setDeliveryTerms(e.target.value)}
                  placeholder="Describe delivery terms"
                  className={`${inputClass} text-[0.6875rem] py-1.5 mt-1`}
                  style={inputStyle}
                />
              ) : null}
              {(deliveryTermsType === "EX_WORKS" || deliveryTermsType === "FOR_STATION") ? (
                <p className="text-[0.4375rem] mt-1 font-semibold" style={{ color: "var(--color-signal-dark)" }}>
                  Enter buyer transport per unit for each line below — this normalizes the comparison.
                </p>
              ) : null}
            </div>
            <div className="col-span-2">
              <label className="block text-[0.4375rem] font-semibold mb-0.5" style={{ color: "var(--color-ink-500)" }}>Warranty (optional)</label>
              <input
                type="text"
                value={warranty}
                onChange={(e) => setWarranty(e.target.value)}
                placeholder="e.g. 12 months"
                className={`${inputClass} text-[0.6875rem] py-1.5`}
                style={inputStyle}
              />
            </div>
          </div>
        </div>

        {/* ── Per-line price entry (progressive disclosure) ── */}
        <div className="rounded-[0.625rem] border p-3 space-y-2" style={{ borderColor: "var(--color-line)", backgroundColor: "var(--color-paper)" }}>
          <div className="flex items-center justify-between border-b pb-2" style={{ borderColor: "var(--color-line)" }}>
            <div className="flex items-center gap-1.5">
              <Calculator className="size-3.5" style={{ color: "var(--color-steel)" }} />
              <span className="text-[0.5625rem] font-bold uppercase tracking-wide" style={{ color: "var(--color-ink-500)" }}>
                Prices
              </span>
            </div>
            {/* Copy-from-previous supplier shortcut */}
            {existingQuotes.length > 0 ? (
              <select
                value=""
                onChange={(e) => { if (e.target.value) copyFromQuote(e.target.value); e.target.value = ""; }}
                className="text-[0.5rem] font-semibold rounded-[0.25rem] border px-1.5 py-1"
                style={{ borderColor: "var(--color-line)", backgroundColor: "var(--color-paper)", color: "var(--color-steel-dark)" }}
              >
                <option value="">Copy from…</option>
                {existingQuotes.map((q) => (
                  <option key={q.id} value={q.id}>{q.supplierName}</option>
                ))}
              </select>
            ) : null}
          </div>
          {lines.map((l) => {
            const d = lineData[l.materialId]!;
            const perPiece = computePerPiece(l.materialId, l.gstRate);
            const isExpanded = expandedLines.has(l.materialId);
            const hasCosts = parseFloat(d.discount) > 0 || parseFloat(d.packing) > 0 || parseFloat(d.freight) > 0 || parseFloat(d.loading) > 0 || parseFloat(d.insurance) > 0 || parseFloat(d.handling) > 0 || parseFloat(d.buyerTransport) > 0;
            return (
              <div key={l.id} className="rounded-[0.5rem] border p-2 space-y-1.5" style={{ borderColor: "var(--color-line)", backgroundColor: "var(--color-paper-2)" }}>
                <div className="flex items-start justify-between gap-2">
                  <div className="min-w-0 flex-1">
                    <p className="text-[0.6875rem] font-bold truncate" style={{ color: "var(--color-ink-950)" }}>
                      {l.materialName}
                    </p>
                    <p className="text-[0.5rem] font-mono" style={{ color: "var(--color-ink-500)" }}>
                      {l.materialCode} · HSN {l.hsnCode ?? "—"} · GST {l.gstRate}%
                    </p>
                  </div>
                  {/* Qty is read-only — supplier quotes on the RFQ's quantities */}
                  <div className="shrink-0 text-right">
                    <p className="text-[0.4375rem] font-semibold" style={{ color: "var(--color-ink-500)" }}>Qty (fixed)</p>
                    <p className="text-[0.6875rem] font-bold tabular-nums" style={{ color: "var(--color-ink-700)" }}>
                      {d.qty} {l.unit}
                    </p>
                  </div>
                </div>
                {/* Rate — the only field shown by default */}
                <div className="grid grid-cols-2 gap-1.5 items-end">
                  <div>
                    <label className="block text-[0.4375rem] font-semibold" style={{ color: "var(--color-ink-500)" }}>Rate/{l.unit} <span style={{ color: "var(--color-stop)" }}>*</span></label>
                    <input
                      type="number"
                      inputMode="decimal"
                      step="any"
                      value={d.unitPrice}
                      onChange={(e) => updateLine(l.materialId, "unitPrice", e.target.value)}
                      placeholder="0"
                      autoFocus={lines[0]?.materialId === l.materialId}
                      onFocus={(e) => e.target.select()}
                      className={`${inputClass} font-mono text-[0.75rem] py-2`}
                      style={inputStyle}
                    />
                  </div>
                  {/* Toggle for cost components */}
                  <button
                    type="button"
                    onClick={() => toggleLineExpanded(l.materialId)}
                    className="flex items-center justify-center gap-1 rounded-[0.375rem] border py-2 text-[0.5625rem] font-semibold"
                    style={{
                      borderColor: isExpanded || hasCosts ? "var(--color-steel)" : "var(--color-line)",
                      backgroundColor: isExpanded || hasCosts ? "var(--color-steel-wash)" : "var(--color-paper)",
                      color: isExpanded || hasCosts ? "var(--color-steel-dark)" : "var(--color-ink-500)",
                    }}
                  >
                    {isExpanded ? <ChevronDown className="size-3" /> : <ChevronRight className="size-3" />}
                    {hasCosts ? "Costs" : "+ Costs"}
                  </button>
                </div>
                {/* Collapsible cost components — hidden by default */}
                {isExpanded ? (
                  <div className="grid grid-cols-3 gap-1.5 pt-1 border-t" style={{ borderColor: "var(--color-line)" }}>
                    <div>
                      <label className="block text-[0.4375rem] font-semibold" style={{ color: "var(--color-ink-500)" }}>Disc/{l.unit}</label>
                      <input
                        type="number" inputMode="decimal" step="any"
                        value={d.discount}
                        onChange={(e) => updateLine(l.materialId, "discount", e.target.value)}
                        placeholder="0"
                        onFocus={(e) => e.target.select()}
                        className={`${inputClass} font-mono text-[0.6875rem] py-1.5`}
                        style={inputStyle}
                      />
                    </div>
                    <div>
                      <label className="block text-[0.4375rem] font-semibold" style={{ color: "var(--color-ink-500)" }}>P&F/{l.unit}</label>
                      <input
                        type="number" inputMode="decimal" step="any"
                        value={d.packing}
                        onChange={(e) => updateLine(l.materialId, "packing", e.target.value)}
                        placeholder="0"
                        onFocus={(e) => e.target.select()}
                        className={`${inputClass} font-mono text-[0.6875rem] py-1.5`}
                        style={inputStyle}
                      />
                    </div>
                    <div>
                      <label className="block text-[0.4375rem] font-semibold" style={{ color: "var(--color-ink-500)" }}>Freight</label>
                      <input
                        type="number" inputMode="decimal" step="any"
                        value={d.freight}
                        onChange={(e) => updateLine(l.materialId, "freight", e.target.value)}
                        placeholder="0"
                        onFocus={(e) => e.target.select()}
                        className={`${inputClass} font-mono text-[0.6875rem] py-1.5`}
                        style={inputStyle}
                      />
                    </div>
                    <div>
                      <label className="block text-[0.4375rem] font-semibold" style={{ color: "var(--color-ink-500)" }}>Loading</label>
                      <input
                        type="number" inputMode="decimal" step="any"
                        value={d.loading}
                        onChange={(e) => updateLine(l.materialId, "loading", e.target.value)}
                        placeholder="0"
                        onFocus={(e) => e.target.select()}
                        className={`${inputClass} font-mono text-[0.6875rem] py-1.5`}
                        style={inputStyle}
                      />
                    </div>
                    <div>
                      <label className="block text-[0.4375rem] font-semibold" style={{ color: "var(--color-ink-500)" }}>Insurance</label>
                      <input
                        type="number" inputMode="decimal" step="any"
                        value={d.insurance}
                        onChange={(e) => updateLine(l.materialId, "insurance", e.target.value)}
                        placeholder="0"
                        onFocus={(e) => e.target.select()}
                        className={`${inputClass} font-mono text-[0.6875rem] py-1.5`}
                        style={inputStyle}
                      />
                    </div>
                    <div>
                      <label className="block text-[0.4375rem] font-semibold" style={{ color: "var(--color-ink-500)" }}>Handling</label>
                      <input
                        type="number" inputMode="decimal" step="any"
                        value={d.handling}
                        onChange={(e) => updateLine(l.materialId, "handling", e.target.value)}
                        placeholder="0"
                        onFocus={(e) => e.target.select()}
                        className={`${inputClass} font-mono text-[0.6875rem] py-1.5`}
                        style={inputStyle}
                      />
                    </div>
                    {(deliveryTermsType === "EX_WORKS" || deliveryTermsType === "FOR_STATION") ? (
                      <div className="col-span-3">
                        <label className="block text-[0.4375rem] font-semibold" style={{ color: "var(--color-signal-dark)" }}>
                          Buyer transport per {l.unit} <span style={{ color: "var(--color-stop)" }}>*</span>
                        </label>
                        <input
                          type="number" inputMode="decimal" step="any"
                          value={d.buyerTransport}
                          onChange={(e) => updateLine(l.materialId, "buyerTransport", e.target.value)}
                          placeholder="0"
                          onFocus={(e) => e.target.select()}
                          className={`${inputClass} font-mono text-[0.6875rem] py-1.5`}
                          style={inputStyle}
                        />
                      </div>
                    ) : null}
                  </div>
                ) : null}
                {/* Live per-piece landed cost */}
                {perPiece > 0 ? (
                  <div
                    className="flex items-center justify-between rounded-[0.375rem] px-2 py-1"
                    style={{ backgroundColor: "var(--color-go-wash)" }}
                  >
                    <span className="text-[0.5rem] font-semibold" style={{ color: "var(--color-ink-500)" }}>
                      Per-piece landed cost
                    </span>
                    <span className="text-[0.75rem] font-bold tabular-nums" style={{ color: "var(--color-go)" }}>
                      {formatCurrency(perPiece)}/{l.unit}
                    </span>
                  </div>
                ) : null}
              </div>
            );
          })}
        </div>

        {/* ── Notes ── */}
        <div>
          <label className="block text-[0.5625rem] font-semibold mb-1" style={{ color: "var(--color-ink-500)" }}>
            Notes (optional)
          </label>
          <textarea
            value={notes}
            onChange={(e) => setNotes(e.target.value)}
            rows={2}
            placeholder="Any other remarks…"
            className={`${inputClass} resize-none`}
            style={inputStyle}
          />
        </div>
      </div>

      {/* Footer */}
      <div className="border-t p-3" style={{ borderColor: "var(--color-line)" }}>
        <button
          onClick={onSubmit}
          disabled={saving || uploading}
          className="flex w-full items-center justify-center gap-2 rounded-[0.625rem] py-3.5 text-[0.8125rem] font-bold press active:scale-95 disabled:opacity-50"
          style={{ backgroundColor: "var(--color-ink-950)", color: "#fff" }}
        >
          {saving ? <Loader2 className="size-4 animate-spin" /> : <Check className="size-4" />}
          {saving ? "Saving…" : "Add Quote"}
        </button>
      </div>
    </div>
  );
}

/* ═══════════════════════════════════════════════════════════════════════════
   APPROVE DIALOG — select the winning quote, with reason if not cheapest
   ═══════════════════════════════════════════════════════════════════════════ */
function ApproveDialog({
  quotes,
  cheapestQuoteId,
  selectedQuoteId,
  onSelect,
  reason,
  onReasonChange,
  onConfirm,
  onCancel,
  approving,
}: {
  quotes: Quote[];
  cheapestQuoteId: string | null;
  selectedQuoteId: string | null;
  onSelect: (id: string) => void;
  reason: string;
  onReasonChange: (v: string) => void;
  onConfirm: () => void;
  onCancel: () => void;
  approving: boolean;
}) {
  const selected = quotes.find((q) => q.id === selectedQuoteId);
  const isOverride = selected && cheapestQuoteId && selected.id !== cheapestQuoteId;

  return (
    <div className="fixed inset-0 z-50 flex flex-col" style={{ backgroundColor: "var(--color-paper)" }}>
      {/* Header */}
      <div className="flex items-center gap-2 p-3 border-b" style={{ borderColor: "var(--color-line)" }}>
        <button onClick={onCancel} className="p-1" style={{ color: "var(--color-ink-700)" }}>
          <X className="size-5" />
        </button>
        <p className="text-[0.875rem] font-bold" style={{ color: "var(--color-ink-950)" }}>
          Select Winning Quote
        </p>
      </div>

      {/* Body */}
      <div className="flex-1 overflow-y-auto p-3 space-y-2">
        <p className="text-[0.625rem]" style={{ color: "var(--color-ink-500)" }}>
          Tap the quote you want to select as the winner. The cheapest is recommended.
        </p>
        {quotes.map((q) => (
          <button
            key={q.id}
            onClick={() => onSelect(q.id)}
            className="flex items-center justify-between w-full rounded-[0.625rem] border p-3 text-left press active:scale-[0.98]"
            style={{
              borderColor: selectedQuoteId === q.id ? "var(--color-go)" : "var(--color-line)",
              backgroundColor: selectedQuoteId === q.id ? "var(--color-go-wash)" : "var(--color-paper)",
            }}
          >
            <div className="min-w-0 flex-1">
              <div className="flex items-center gap-1.5">
                {q.id === cheapestQuoteId ? (
                  <Trophy className="size-3.5 shrink-0" style={{ color: "var(--color-go)" }} />
                ) : null}
                <span className="text-[0.75rem] font-bold truncate" style={{ color: "var(--color-ink-950)" }}>
                  {q.supplierName}
                </span>
              </div>
              <p className="text-[0.5625rem] mt-0.5" style={{ color: "var(--color-ink-500)" }}>
                Subtotal: {formatCurrency(q.subtotal)} · GST: {formatCurrency(q.gstTotal)} · Landed: {formatCurrency(q.landedTotal)}
              </p>
            </div>
            <div className="text-right shrink-0 ml-2">
              <p className="text-[0.875rem] font-bold tabular-nums" style={{ color: "var(--color-ink-950)" }}>
                {formatCurrency(q.landedTotal)}
              </p>
              {selectedQuoteId === q.id ? (
                <Check className="size-4 ml-auto mt-1" style={{ color: "var(--color-go)" }} />
              ) : null}
            </div>
          </button>
        ))}

        {/* Reason field (required if not cheapest) */}
        {isOverride ? (
          <div className="mt-3">
            <div
              className="rounded-[0.5rem] p-2.5 mb-2 flex items-start gap-1.5"
              style={{ backgroundColor: "var(--color-signal-wash)" }}
            >
              <AlertCircle className="size-4 shrink-0 mt-0.5" style={{ color: "var(--color-signal-dark)" }} />
              <p className="text-[0.625rem]" style={{ color: "var(--color-signal-dark)" }}>
                You are selecting a quote that is <strong>not the cheapest</strong>. A reason is required.
              </p>
            </div>
            <label className="block text-[0.5625rem] font-semibold mb-1" style={{ color: "var(--color-ink-500)" }}>
              Reason for override *
            </label>
            <textarea
              value={reason}
              onChange={(e) => onReasonChange(e.target.value)}
              rows={3}
              placeholder="e.g. Better delivery time, better payment terms, quality preference…"
              className="w-full rounded-[0.375rem] border px-2.5 py-2 text-[0.75rem] font-medium outline-none focus:ring-2 resize-none"
              style={{ borderColor: "var(--color-line)", backgroundColor: "var(--color-paper)", color: "var(--color-ink-950)" }}
            />
          </div>
        ) : null}
      </div>

      {/* Footer */}
      <div className="border-t p-3" style={{ borderColor: "var(--color-line)" }}>
        <button
          onClick={onConfirm}
          disabled={approving || !selectedQuoteId || (!!isOverride && !reason.trim())}
          className="flex w-full items-center justify-center gap-2 rounded-[0.625rem] py-3.5 text-[0.8125rem] font-bold press active:scale-95 disabled:opacity-50"
          style={{ backgroundColor: "var(--color-go)", color: "#fff" }}
        >
          {approving ? <Loader2 className="size-4 animate-spin" /> : <Trophy className="size-4" />}
          {approving ? "Approving…" : "Approve & Select Winner"}
        </button>
      </div>
    </div>
  );
}

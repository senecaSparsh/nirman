"use client";

import { useEffect, useState, useCallback, useMemo } from "react";
import { toast } from "sonner";
import {
  Plus, Trophy, AlertTriangle, CheckCircle2, Loader2, Trash2,
  ShieldCheck, FileText, Truck, Crown, Printer,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Textarea, Label } from "@/components/ui/input";
import { Dialog } from "@/components/ui/dialog";
import { formatCurrency, formatDate, cn } from "@/lib/utils";
import { QuoteUploadDialog } from "./quote-upload-dialog";
import type { ComparativeStatement, VendorQuoteRow } from "@/lib/types";

type MaterialOption = { id: string; code: string; name: string; unit: string };
type SupplierOption = { id: string; name: string };
type RequisitionLine = {
  materialId: string;
  materialCode: string;
  materialName: string;
  unit: string;
  qtyRequested: number;
};

// ── Color constants (Excel-style semantic coloring) ──
const C = {
  cheapestBg: "bg-emerald-50",
  cheapestText: "text-emerald-700",
  cheapestBorder: "border-emerald-300",
  winnerBg: "bg-green-100",
  winnerText: "text-green-800",
  winnerBorder: "border-green-500",
  highestBg: "bg-red-50",
  highestText: "text-red-600",
  sectionBg: "bg-slate-100",
  sectionText: "text-slate-700",
  totalBg: "bg-slate-200",
  totalText: "text-slate-900",
  headerBg: "bg-slate-800",
  headerText: "text-white",
  subHeaderBg: "bg-slate-50",
  subHeaderText: "text-slate-600",
  materialBg: "bg-blue-50",
  materialText: "text-blue-900",
  muted: "text-slate-400",
  border: "border-slate-200",
} as const;

export function ComparativeQuotePanel({
  requisitionId,
  reqNumber,
  requisitionLines,
  suppliers,
  materials,
  canApprove,
  canCreate,
  onWinnerSelected,
}: {
  requisitionId: string;
  reqNumber: string;
  requisitionLines: RequisitionLine[];
  suppliers: SupplierOption[];
  materials: MaterialOption[];
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

  // ── Derived data ──
  const activeQuotes = useMemo(
    () => statement?.quotes.filter((q) => q.status !== "REJECTED") ?? [],
    [statement],
  );
  const sortedQuotes = useMemo(
    () => [...activeQuotes].sort((a, b) => a.landedTotal - b.landedTotal),
    [activeQuotes],
  );

  // Per-material matrix
  const materialMatrix = useMemo(() => {
    if (!statement) return [];
    return requisitionLines.map((line) => {
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
          isSelected: q.status === "SELECTED",
        };
      }).filter((x): x is NonNullable<typeof x> => x !== null);

      // Find cheapest per-unit landed cost
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
  }, [statement, requisitionLines, sortedQuotes]);

  // Summary KPIs
  const kpis = useMemo(() => {
    if (activeQuotes.length === 0) return null;
    const totals = activeQuotes.map((q) => q.landedTotal);
    const lowest = Math.min(...totals);
    const highest = Math.max(...totals);
    const savings = highest - lowest;
    return { lowest, highest, savings, count: activeQuotes.length };
  }, [activeQuotes]);

  // Check mixed delivery bases
  const deliveryBases = useMemo(
    () => new Set(activeQuotes.map((q) => q.deliveryTermsType)),
    [activeQuotes],
  );
  const mixedDelivery = deliveryBases.size > 1;

  if (loading) {
    return (
      <div className="flex items-center gap-2 py-8 text-body text-muted-foreground">
        <Loader2 className="h-4 w-4 animate-spin" /> Loading comparative statement…
      </div>
    );
  }

  if (!statement) return null;

  const { nonRejectedCount, gateSatisfied, cheapestQuoteId, selectedQuoteId } = statement;
  const minRequired = statement.requisition.minQuotesRequired;
  const waived = statement.requisition.quotesWaived;
  const locked = statement.requisition.quotesLockedAt !== null;
  const winnerQuote = statement.quotes.find((q) => q.id === selectedQuoteId);

  return (
    <div className="space-y-3">
      {/* ═══════════════════════════════════════════════════════════════
          HEADER BAR — title, status, actions
         ═══════════════════════════════════════════════════════════════ */}
      <div className="flex items-center justify-between gap-2 flex-wrap">
        <div className="flex items-center gap-2">
          <div className="flex h-7 w-7 items-center justify-center rounded bg-slate-800">
            <FileText className="h-3.5 w-3.5 text-white" />
          </div>
          <div>
            <h3 className="text-sm font-bold tracking-wide text-foreground uppercase">
              Comparative Statement
            </h3>
            <p className="text-caption text-muted-foreground font-mono">{reqNumber}</p>
          </div>
        </div>
        <div className="flex items-center gap-2 flex-wrap">
          {gateSatisfied ? (
            <span className="inline-flex items-center gap-1 rounded bg-emerald-100 px-2 py-0.5 text-caption font-semibold text-emerald-700">
              <CheckCircle2 className="h-3 w-3" />
              {waived ? "Waived" : `${nonRejectedCount}/${minRequired} Quotes`}
            </span>
          ) : (
            <span className="inline-flex items-center gap-1 rounded bg-amber-100 px-2 py-0.5 text-caption font-semibold text-amber-700">
              <AlertTriangle className="h-3 w-3" />
              {nonRejectedCount}/{minRequired} — Need {minRequired - nonRejectedCount} more
            </span>
          )}
          {selectedQuoteId && (
            <span className="inline-flex items-center gap-1 rounded bg-green-600 px-2 py-0.5 text-caption font-semibold text-white">
              <Crown className="h-3 w-3" /> Winner Selected
            </span>
          )}
          {canCreate && !locked && (
            <Button size="sm" variant="outline" className="h-7" onClick={() => setUploadOpen(true)}>
              <Plus className="h-3.5 w-3.5" /> Add Quote
            </Button>
          )}
          <Button size="sm" variant="ghost" className="h-7" onClick={() => window.print()}>
            <Printer className="h-3.5 w-3.5" /> Print
          </Button>
        </div>
      </div>

      {/* Mixed delivery warning */}
      {mixedDelivery && activeQuotes.length > 0 ? (
        <div className="flex items-start gap-2 rounded border border-amber-300 bg-amber-50 px-3 py-2 text-caption text-amber-700">
          <Truck className="h-4 w-4 shrink-0 mt-0.5" />
          <div>
            <span className="font-semibold">Different delivery bases.</span>{" "}
            Buyer-borne transport is included in landed cost for ex-works / FOR-station quotes.
          </div>
        </div>
      ) : null}

      {/* ═══════════════════════════════════════════════════════════════
          EXCEL-STYLE COMPARATIVE SHEET
          One big grid: materials × suppliers, with cost component sub-rows
         ═══════════════════════════════════════════════════════════════ */}
      {activeQuotes.length > 0 ? (
        <div className="overflow-x-auto rounded-lg border border-slate-300 shadow-sm print:shadow-none print:border-slate-400">
          <table className="w-full border-collapse text-caption print:color-adjust:exact">
            <thead>
              {/* Row 1: Supplier names */}
              <tr>
                <th
                  className={cn(
                    "sticky left-0 z-20 border border-slate-300 px-3 py-2 text-left",
                    C.headerBg, C.headerText,
                  )}
                  style={{ minWidth: 220 }}
                >
                  COMPARATIVE STATEMENT
                </th>
                {sortedQuotes.map((q) => {
                  const isWinner = q.id === selectedQuoteId;
                  const isCheapest = q.id === cheapestQuoteId;
                  return (
                    <th
                      key={q.id}
                      className={cn(
                        "border border-slate-300 px-3 py-2 text-center min-w-[140px]",
                        isWinner ? C.winnerBg : isCheapest ? C.cheapestBg : C.headerBg,
                      )}
                    >
                      <div className="flex flex-col items-center gap-0.5">
                        <div className="flex items-center gap-1">
                          {isWinner && <Crown className="h-3 w-3 text-green-700" />}
                          {isCheapest && !isWinner && <Trophy className="h-3 w-3 text-emerald-600" />}
                          <span
                            className={cn(
                              "font-bold text-sm",
                              isWinner ? C.winnerText : isCheapest ? C.cheapestText : C.headerText,
                            )}
                          >
                            {q.supplierName}
                          </span>
                        </div>
                        <DeliveryBadge type={q.deliveryTermsType} dark={!isWinner && !isCheapest} />
                        {isWinner && (
                          <span className="text-micro font-bold text-green-700 uppercase tracking-wide">Winner</span>
                        )}
                        {isCheapest && !isWinner && (
                          <span className="text-micro font-bold text-emerald-600 uppercase tracking-wide">Lowest</span>
                        )}
                      </div>
                    </th>
                  );
                })}
                <th className={cn("border border-slate-300 px-3 py-2 text-center min-w-[100px]", C.headerBg, C.headerText)}>
                  <div className="flex flex-col items-center gap-0.5">
                    <span className="font-bold text-sm">Remarks</span>
                  </div>
                </th>
              </tr>
            </thead>
            <tbody>
              {/* ── KPI Summary Row ── */}
              <tr className={C.subHeaderBg}>
                <td className={cn("border border-slate-300 px-3 py-1.5 font-bold uppercase text-micro tracking-wide", C.subHeaderText)}>
                  Quotes Received
                </td>
                {sortedQuotes.map((q) => (
                  <td key={q.id} className="border border-slate-300 px-3 py-1.5 text-center text-slate-600">
                    {kpis?.count ?? 0}
                  </td>
                ))}
                <td className="border border-slate-300 px-3 py-1.5 text-center text-slate-500 text-micro">
                  {nonRejectedCount}/{minRequired} gate
                </td>
              </tr>

              {/* ── Per-Material Sections ── */}
              {materialMatrix.map(({ line, entries, cheapestCost, highestCost }) => {
                const hasMultiple = entries.length > 1;
                return (
                  <MatSection
                    key={line.materialId}
                    line={line}
                    entries={entries}
                    cheapestCost={cheapestCost}
                    highestCost={highestCost}
                    hasMultiple={hasMultiple}
                  />
                );
              })}

              {/* ── GRAND TOTALS SECTION ── */}
              <tr>
                <td className={cn("border border-slate-300 px-3 py-2 font-bold uppercase text-caption", C.totalBg, C.totalText)}>
                  Subtotal (ex-GST)
                </td>
                {sortedQuotes.map((q) => {
                  const isCheapest = q.subtotal === Math.min(...sortedQuotes.map((x) => x.subtotal));
                  return (
                    <td
                      key={q.id}
                      className={cn(
                        "border border-slate-300 px-3 py-2 text-right tabular-nums font-semibold",
                        isCheapest ? C.cheapestBg : "bg-white",
                        isCheapest ? C.cheapestText : "text-slate-700",
                      )}
                    >
                      {formatCurrency(q.subtotal)}
                    </td>
                  );
                })}
                <td className="border border-slate-300 px-3 py-2 text-right text-slate-400 text-micro">Basic total</td>
              </tr>

              <tr>
                <td className={cn("border border-slate-300 px-3 py-2 font-bold uppercase text-caption", C.totalBg, C.totalText)}>
                  GST Total
                </td>
                {sortedQuotes.map((q) => (
                  <td key={q.id} className="border border-slate-300 px-3 py-2 text-right tabular-nums text-slate-600 bg-white">
                    {formatCurrency(q.gstTotal)}
                  </td>
                ))}
                <td className="border border-slate-300 px-3 py-2 text-right text-slate-400 text-micro">Input tax</td>
              </tr>

              <tr>
                <td className={cn("border border-slate-300 px-3 py-2 font-bold uppercase text-caption", C.totalBg, C.totalText)}>
                  Freight + Transport
                </td>
                {sortedQuotes.map((q) => {
                  const transport = q.freightTotal + q.buyerTransportTotal;
                  return (
                    <td key={q.id} className="border border-slate-300 px-3 py-2 text-right tabular-nums text-slate-600 bg-white">
                      {transport > 0 ? formatCurrency(transport) : "—"}
                    </td>
                  );
                })}
                <td className="border border-slate-300 px-3 py-2 text-right text-slate-400 text-micro">
                  {mixedDelivery ? "Normalized" : "Incl. freight"}
                </td>
              </tr>

              <tr>
                <td className={cn("border border-slate-300 px-3 py-2 font-bold uppercase text-caption", C.totalBg, C.totalText)}>
                  Other Charges
                </td>
                {sortedQuotes.map((q) => {
                  const other = q.loadingTotal + q.packingTotal + q.insuranceTotal + q.handlingTotal + q.discountTotal;
                  return (
                    <td key={q.id} className="border border-slate-300 px-3 py-2 text-right tabular-nums text-slate-600 bg-white">
                      {other > 0 ? formatCurrency(other) : "—"}
                    </td>
                  );
                })}
                <td className="border border-slate-300 px-3 py-2 text-right text-slate-400 text-micro">
                  Load+Pkg+Ins+Disc
                </td>
              </tr>

              {/* ── LANDED TOTAL (the headline number) ── */}
              <tr>
                <td className={cn("border-2 border-slate-400 px-3 py-2.5 font-bold uppercase text-sm", C.totalBg, C.totalText)}>
                  Landed Total
                </td>
                {sortedQuotes.map((q, idx) => {
                  const isWinner = q.id === selectedQuoteId;
                  const isCheapest = idx === 0;
                  const isHighest = idx === sortedQuotes.length - 1 && sortedQuotes.length > 1;
                  return (
                    <td
                      key={q.id}
                      className={cn(
                        "border-2 border-slate-400 px-3 py-2.5 text-right tabular-nums",
                        isWinner
                          ? cn(C.winnerBg, C.winnerText)
                          : isCheapest
                            ? cn(C.cheapestBg, C.cheapestText)
                            : isHighest
                              ? cn(C.highestBg, C.highestText)
                              : "bg-white text-slate-700",
                      )}
                    >
                      <div className="flex flex-col items-end">
                        <span className="text-sm font-bold">{formatCurrency(q.landedTotal)}</span>
                        {isCheapest && !isWinner && (
                          <span className="text-micro font-bold uppercase">Lowest</span>
                        )}
                        {isWinner && (
                          <span className="text-micro font-bold uppercase">★ Winner</span>
                        )}
                        {isHighest && !isCheapest && (
                          <span className="text-micro font-bold uppercase">Highest</span>
                        )}
                      </div>
                    </td>
                  );
                })}
                <td className="border-2 border-slate-400 px-3 py-2.5 text-center text-micro text-slate-500">
                  Delivered to site
                </td>
              </tr>

              {/* ── VARIANCE ROW ── */}
              {sortedQuotes.length > 1 ? (
                <tr>
                  <td className={cn("border border-slate-300 px-3 py-2 font-semibold uppercase text-caption", C.subHeaderBg, C.subHeaderText)}>
                    Variance vs Lowest
                  </td>
                  {sortedQuotes.map((q, idx) => {
                    const isCheapest = idx === 0;
                    const variance = q.varianceVsCheapest;
                    const pct = kpis && kpis.lowest > 0 ? (variance / kpis.lowest) * 100 : 0;
                    return (
                      <td
                        key={q.id}
                        className={cn(
                          "border border-slate-300 px-3 py-2 text-right tabular-nums",
                          isCheapest ? "bg-white text-slate-400" : variance > 0 ? "bg-red-50 text-red-600" : "bg-white text-slate-600",
                        )}
                      >
                        {isCheapest ? (
                          <span className="text-micro">— baseline —</span>
                        ) : (
                          <div className="flex flex-col items-end">
                            <span className="font-semibold">+{formatCurrency(variance)}</span>
                            <span className="text-micro">+{pct.toFixed(1)}%</span>
                          </div>
                        )}
                      </td>
                    );
                  })}
                  <td className="border border-slate-300 px-3 py-2 text-right text-slate-400 text-micro">
                    {kpis && kpis.savings > 0 ? `Save ${formatCurrency(kpis.savings)}` : "—"}
                  </td>
                </tr>
              ) : null}

              {/* ── COMMERCIAL TERMS ROWS ── */}
              <tr>
                <td className={cn("border border-slate-300 px-3 py-2 font-semibold uppercase text-caption", C.subHeaderBg, C.subHeaderText)}>
                  Payment Terms
                </td>
                {sortedQuotes.map((q) => (
                  <td key={q.id} className="border border-slate-300 px-3 py-2 text-center text-slate-700 bg-white">
                    {q.paymentTerms ?? "—"}
                  </td>
                ))}
                <td className="border border-slate-300 px-3 py-2 text-center text-slate-400 text-micro">Credit period</td>
              </tr>

              <tr>
                <td className={cn("border border-slate-300 px-3 py-2 font-semibold uppercase text-caption", C.subHeaderBg, C.subHeaderText)}>
                  Delivery Basis
                </td>
                {sortedQuotes.map((q) => (
                  <td key={q.id} className="border border-slate-300 px-3 py-2 text-center bg-white">
                    <div className="flex flex-col items-center gap-0.5">
                      <DeliveryBadge type={q.deliveryTermsType} />
                      {q.deliveryTerms && (
                        <span className="text-micro text-slate-500">{q.deliveryTerms}</span>
                      )}
                    </div>
                  </td>
                ))}
                <td className="border border-slate-300 px-3 py-2 text-center text-slate-400 text-micro">Who bears freight</td>
              </tr>

              <tr>
                <td className={cn("border border-slate-300 px-3 py-2 font-semibold uppercase text-caption", C.subHeaderBg, C.subHeaderText)}>
                  Lead Time
                </td>
                {sortedQuotes.map((q) => {
                  const isFastest = q.leadTimeDays === Math.min(...sortedQuotes.filter((x) => x.leadTimeDays != null).map((x) => x.leadTimeDays!));
                  return (
                    <td
                      key={q.id}
                      className={cn(
                        "border border-slate-300 px-3 py-2 text-center tabular-nums",
                        isFastest && q.leadTimeDays != null ? cn(C.cheapestBg, C.cheapestText, "font-semibold") : "bg-white text-slate-700",
                      )}
                    >
                      {q.leadTimeDays != null ? `${q.leadTimeDays} days` : "—"}
                    </td>
                  );
                })}
                <td className="border border-slate-300 px-3 py-2 text-center text-slate-400 text-micro">Days from PO</td>
              </tr>

              <tr>
                <td className={cn("border border-slate-300 px-3 py-2 font-semibold uppercase text-caption", C.subHeaderBg, C.subHeaderText)}>
                  Warranty
                </td>
                {sortedQuotes.map((q) => (
                  <td key={q.id} className="border border-slate-300 px-3 py-2 text-center text-slate-700 bg-white">
                    {q.warranty ?? "—"}
                  </td>
                ))}
                <td className="border border-slate-300 px-3 py-2 text-center text-slate-400 text-micro">Coverage</td>
              </tr>

              <tr>
                <td className={cn("border border-slate-300 px-3 py-2 font-semibold uppercase text-caption", C.subHeaderBg, C.subHeaderText)}>
                  Valid Until
                </td>
                {sortedQuotes.map((q) => {
                  if (!q.validUntil) return <td key={q.id} className="border border-slate-300 px-3 py-2 text-center text-slate-400 bg-white">—</td>;
                  const date = new Date(q.validUntil);
                  const now = new Date();
                  const expired = date < now;
                  const daysLeft = Math.ceil((date.getTime() - now.getTime()) / (1000 * 60 * 60 * 24));
                  return (
                    <td
                      key={q.id}
                      className={cn(
                        "border border-slate-300 px-3 py-2 text-center tabular-nums",
                        expired ? "bg-red-50 text-red-600" : daysLeft <= 7 ? "bg-amber-50 text-amber-700" : "bg-white text-slate-700",
                      )}
                    >
                      <div className="flex flex-col items-center">
                        <span>{formatDate(q.validUntil)}</span>
                        <span className="text-micro">
                          {expired ? "(expired)" : `(${daysLeft}d left)`}
                        </span>
                      </div>
                    </td>
                  );
                })}
                <td className="border border-slate-300 px-3 py-2 text-center text-slate-400 text-micro">Quote expiry</td>
              </tr>

              <tr>
                <td className={cn("border border-slate-300 px-3 py-2 font-semibold uppercase text-caption", C.subHeaderBg, C.subHeaderText)}>
                  Quote Document
                </td>
                {sortedQuotes.map((q) => (
                  <td key={q.id} className="border border-slate-300 px-3 py-2 text-center bg-white">
                    {q.fileUrl ? (
                      <a
                        href={q.fileUrl}
                        target="_blank"
                        rel="noopener noreferrer"
                        className="inline-flex items-center gap-1 text-blue-600 hover:underline"
                      >
                        <FileText className="h-3 w-3" /> View
                      </a>
                    ) : (
                      <span className="text-slate-400">—</span>
                    )}
                  </td>
                ))}
                <td className="border border-slate-300 px-3 py-2 text-center text-slate-400 text-micro">PDF/Image</td>
              </tr>

              {/* ── ACTION ROW ── */}
              {(canApprove || canCreate) && !locked ? (
                <tr>
                  <td className={cn("border border-slate-300 px-3 py-2.5 font-bold uppercase text-caption", C.totalBg, C.totalText)}>
                    Action
                  </td>
                  {sortedQuotes.map((q) => {
                    const isWinner = q.id === selectedQuoteId;
                    return (
                      <td key={q.id} className="border border-slate-300 px-3 py-2.5 text-center bg-white">
                        <div className="flex items-center justify-center gap-1.5">
                          {canApprove && !isWinner && q.status !== "REJECTED" && (
                            <Button
                              size="sm"
                              variant="outline"
                              className="h-7 text-caption"
                              disabled={selectingId === q.id}
                              onClick={() => selectWinner(q.id)}
                            >
                              {selectingId === q.id ? (
                                <Loader2 className="h-3 w-3 animate-spin" />
                              ) : (
                                "Select Winner"
                              )}
                            </Button>
                          )}
                          {isWinner && q.selectionReason && (
                            <span className="text-micro text-slate-500 italic" title={q.selectionReason}>
                              override
                            </span>
                          )}
                          {canCreate && !isWinner && (
                            <Button
                              variant="ghost"
                              size="icon"
                              className="h-6 w-6 text-slate-400 hover:text-red-600"
                              onClick={() => deleteQuote(q.id)}
                              title="Delete quote"
                            >
                              <Trash2 className="h-3 w-3" />
                            </Button>
                          )}
                        </div>
                      </td>
                    );
                  })}
                  <td className="border border-slate-300 px-3 py-2.5 text-center text-micro text-slate-400">
                    {selectedQuoteId ? "Locked" : "Select to lock"}
                  </td>
                </tr>
              ) : null}
            </tbody>
          </table>
        </div>
      ) : null}

      {/* ═══════════════════════════════════════════════════════════════
          EMPTY STATE
         ═══════════════════════════════════════════════════════════════ */}
      {activeQuotes.length === 0 ? (
        <div className="rounded-lg border border-dashed border-slate-300 py-12 text-center">
          <FileText className="h-8 w-8 mx-auto text-slate-300" />
          <p className="mt-2 text-body text-slate-500">No quotes uploaded yet</p>
          <p className="text-caption text-slate-400 mt-1">
            Upload {minRequired} vendor quotes to enable comparison and PO conversion
          </p>
          {canCreate && (
            <Button size="sm" variant="outline" className="mt-3" onClick={() => setUploadOpen(true)}>
              <Plus className="h-3.5 w-3.5" /> Upload First Quote
            </Button>
          )}
        </div>
      ) : null}

      {/* ═══════════════════════════════════════════════════════════════
          FOOTER — audit trail + waive
         ═══════════════════════════════════════════════════════════════ */}
      {winnerQuote?.selectedBy && (
        <div className="flex items-center gap-2 text-caption text-slate-500">
          <Crown className="h-3.5 w-3.5 text-green-600" />
          Selected by <span className="font-medium text-slate-700">{winnerQuote.selectedBy.name}</span>
          {winnerQuote.selectedAt && <> on {formatDate(winnerQuote.selectedAt)}</>}
          {winnerQuote.selectionReason && <> — <span className="italic">{winnerQuote.selectionReason}</span></>}
        </div>
      )}

      {canApprove && !gateSatisfied && !waived && (
        <div className="flex items-center gap-2">
          <Button size="sm" variant="ghost" onClick={() => setWaiveOpen(true)}>
            <ShieldCheck className="h-3.5 w-3.5" /> Waive quote requirement
          </Button>
          <span className="text-caption text-slate-400">For emergency / single-source buys</span>
        </div>
      )}
      {waived && (
        <div className="rounded bg-slate-100 px-3 py-2 text-caption text-slate-500">
          Quote requirement waived: {statement.requisition.quotesWaivedReason}
        </div>
      )}

      {/* Upload dialog */}
      <QuoteUploadDialog
        open={uploadOpen}
        onOpenChange={setUploadOpen}
        requisitionId={requisitionId}
        reqNumber={reqNumber}
        requisitionLines={requisitionLines}
        suppliers={suppliers}
        materials={materials}
        onUploaded={fetchStatement}
      />

      {/* Waive dialog */}
      <Dialog
        open={waiveOpen}
        onOpenChange={setWaiveOpen}
        title="Waive Quote Requirement"
        description={`${reqNumber} — bypass the ${minRequired}-quote minimum`}
        className="max-w-md"
      >
        <div className="space-y-3">
          <div className="space-y-1.5">
            <Label>Reason *</Label>
            <Textarea
              value={waiveReason}
              onChange={(e) => setWaiveReason(e.target.value)}
              rows={3}
              placeholder="e.g. Emergency buy, single-source item, low value…"
            />
          </div>
          <div className="flex justify-end gap-2">
            <Button variant="outline" onClick={() => setWaiveOpen(false)} disabled={waiving}>Cancel</Button>
            <Button onClick={confirmWaive} disabled={waiving || !waiveReason.trim()}>
              {waiving ? "Waiving…" : "Waive"}
            </Button>
          </div>
        </div>
      </Dialog>
    </div>
  );
}

// ── Per-material section (sub-rows for each cost component) ──

function MatSection({
  line, entries, cheapestCost, highestCost, hasMultiple,
}: {
  line: RequisitionLine;
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
  cheapestCost: number;
  highestCost: number;
  hasMultiple: boolean;
}) {
  // Cost component rows to show for each material
  const componentRows: {
    label: string;
    getValue: (e: typeof entries[0]) => number;
    showIfZero?: boolean;
    prefix?: string;
  }[] = [
    { label: "Basic Price", getValue: (e) => e.unitPrice, showIfZero: true },
    { label: "Discount", getValue: (e) => -e.discountPerUnit, prefix: "−" },
    { label: "Packing", getValue: (e) => e.packingPerUnit },
    { label: "GST", getValue: (e) => e.gstAmount / e.qty },
    { label: "Freight", getValue: (e) => e.freightPerUnit },
    { label: "Buyer Transport", getValue: (e) => e.buyerTransportPerUnit },
    { label: "Loading", getValue: (e) => e.loadingPerUnit },
    { label: "Insurance", getValue: (e) => e.insurancePerUnit },
    { label: "Handling", getValue: (e) => e.handlingPerUnit },
  ];

  return (
    <>
      {/* Material header row — blue band */}
      <tr>
        <td
          className={cn("border border-slate-300 px-3 py-2 font-bold", C.materialBg, C.materialText)}
        >
          <div className="flex items-center gap-1.5">
            <span className="text-sm">{line.materialName}</span>
          </div>
          <div className="text-micro font-mono font-normal text-blue-600 mt-0.5">
            {line.materialCode} · Qty: {line.qtyRequested} {line.unit}
          </div>
        </td>
        {entries.map((e) => {
          const isWinner = e.isSelected;
          const isCheapest = e.isCheapest;
          const isHighest = hasMultiple && e.unitLandedCost === highestCost && !isCheapest;
          return (
            <td
              key={e.quoteId}
              className={cn(
                "border border-slate-300 px-3 py-2 text-center",
                isWinner ? C.winnerBg : isCheapest ? C.cheapestBg : "bg-white",
              )}
            >
              <div className="flex flex-col items-center gap-0.5">
                <div className="flex items-center gap-1">
                  {isWinner && <Crown className="h-3 w-3 text-green-700" />}
                  {isCheapest && !isWinner && <Trophy className="h-3 w-3 text-emerald-600" />}
                  <span
                    className={cn(
                      "font-bold text-sm tabular-nums",
                      isWinner ? C.winnerText : isCheapest ? C.cheapestText : "text-slate-700",
                    )}
                  >
                    {formatCurrency(e.unitLandedCost)}
                  </span>
                  <span className="text-micro text-slate-500 font-normal">/{line.unit}</span>
                </div>
                <span className="text-micro text-slate-500 tabular-nums">
                  Total: {formatCurrency(e.lineTotal)}
                </span>
              </div>
            </td>
          );
        })}
        {entries.length < 1 && <td className="border border-slate-300 bg-white" />}
        <td className="border border-slate-300 px-3 py-2 text-center text-micro text-slate-400 bg-slate-50">
          Landed/unit
        </td>
      </tr>

      {/* Cost component sub-rows */}
      {componentRows.map((row) => {
        // Only show rows where at least one supplier has a non-zero value
        const anyNonZero = entries.some((e) => {
          const v = row.getValue(e);
          return Math.abs(v) > 0.001;
        });
        if (!anyNonZero && !row.showIfZero) return null;

        // Find cheapest value for this component across suppliers
        const values = entries.map((e) => row.getValue(e));
        const minVal = Math.min(...values.filter((v) => v > 0).length > 0 ? values.filter((v) => v > 0) : [0]);

        return (
          <tr key={row.label} className="hover:bg-slate-50/50">
            <td className={cn("border border-slate-300 px-3 py-1.5 pl-6 text-slate-500 text-micro")}>
              {row.label}
            </td>
            {entries.map((e) => {
              const v = row.getValue(e);
              const isZero = Math.abs(v) < 0.001;
              const isCheapestComponent = !isZero && v === minVal && v > 0 && hasMultiple;
              return (
                <td
                  key={e.quoteId}
                  className={cn(
                    "border border-slate-300 px-3 py-1.5 text-right tabular-nums text-micro",
                    isZero ? "text-slate-300" : "text-slate-600",
                    isCheapestComponent && C.cheapestBg,
                  )}
                >
                  {isZero ? "—" : `${row.prefix ?? ""}${formatCurrency(Math.abs(v))}`}
                </td>
              );
            })}
            <td className="border border-slate-300 px-3 py-1.5 text-center text-slate-300 text-micro bg-slate-50">
              /{line.unit}
            </td>
          </tr>
        );
      })}
    </>
  );
}

// ── Delivery badge ──

function DeliveryBadge({
  type,
  dark = false,
}: {
  type: "DELIVERED_SITE" | "EX_WORKS" | "FOR_STATION" | "CUSTOM";
  dark?: boolean;
}) {
  const config = {
    DELIVERED_SITE: { label: "Delivered", light: "bg-slate-100 text-slate-600", dark: "bg-slate-700 text-slate-200" },
    EX_WORKS: { label: "Ex-works", light: "bg-amber-100 text-amber-700", dark: "bg-amber-900/40 text-amber-300" },
    FOR_STATION: { label: "FOR stn", light: "bg-amber-100 text-amber-700", dark: "bg-amber-900/40 text-amber-300" },
    CUSTOM: { label: "Custom", light: "bg-slate-100 text-slate-600", dark: "bg-slate-700 text-slate-200" },
  } as const;
  const c = config[type];
  return (
    <span className={cn("inline-flex items-center gap-0.5 rounded px-1.5 py-0.5 text-micro font-medium", dark ? c.dark : c.light)}>
      <Truck className="h-2.5 w-2.5" /> {c.label}
    </span>
  );
}

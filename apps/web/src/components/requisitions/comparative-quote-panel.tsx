"use client";

import { useEffect, useState, useCallback } from "react";
import { toast } from "sonner";
import { Plus, Trophy, AlertTriangle, CheckCircle2, Loader2, Trash2, ShieldCheck, FileText } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Textarea, Label } from "@/components/ui/input";
import { Dialog } from "@/components/ui/dialog";
import { DataTable, type Column } from "@/components/ui/data-table";
import { formatCurrency, formatDate } from "@/lib/utils";
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

  if (loading) {
    return (
      <div className="flex items-center gap-2 py-4 text-body text-muted-foreground">
        <Loader2 className="h-4 w-4 animate-spin" /> Loading quotes…
      </div>
    );
  }

  if (!statement) return null;

  const { quotes, nonRejectedCount, gateSatisfied, cheapestQuoteId, selectedQuoteId } = statement;
  const minRequired = statement.requisition.minQuotesRequired;
  const waived = statement.requisition.quotesWaived;
  const locked = statement.requisition.quotesLockedAt !== null;

  const quoteColumns: Column<VendorQuoteRow>[] = [
    {
      key: "supplierName",
      label: "Supplier",
      render: (q) => (
        <div>
          <div className="font-medium">{q.supplierName}</div>
          {q.supplierPhone && <div className="text-caption text-muted-foreground">{q.supplierPhone}</div>}
        </div>
      ),
      sortValue: (q) => q.supplierName,
    },
    {
      key: "landedTotal",
      label: "Landed Total",
      align: "right",
      render: (q) => (
        <>
          {formatCurrency(q.landedTotal)}
          {q.isCheapest && (
            <span className="ml-1.5 inline-flex items-center gap-0.5 rounded-full bg-success/10 px-1.5 py-0.5 text-micro font-semibold text-success">
              <Trophy className="h-2.5 w-2.5" /> Cheapest
            </span>
          )}
        </>
      ),
      sortValue: (q) => q.landedTotal,
    },
    {
      key: "varianceVsCheapest",
      label: "Variance",
      align: "right",
      render: (q) => (
        <span className="text-muted-foreground">
          {q.varianceVsCheapest > 0 ? `+${formatCurrency(q.varianceVsCheapest)}` : "—"}
        </span>
      ),
      sortValue: (q) => q.varianceVsCheapest,
    },
    {
      key: "status",
      label: "Status",
      cellClassName: "text-center",
      render: (q) => {
        const isWinner = q.status === "SELECTED";
        if (isWinner) {
          return (
            <span className="inline-flex items-center gap-1 rounded-full bg-primary/10 px-2 py-0.5 text-caption font-medium text-primary">
              <Trophy className="h-3 w-3" /> Winner
            </span>
          );
        }
        if (q.status === "REJECTED") {
          return <span className="text-caption text-muted-foreground">Rejected</span>;
        }
        return <span className="text-caption text-muted-foreground">Pending</span>;
      },
    },
    {
      key: "fileName",
      label: "Quote File",
      render: (q) => (
        <a href={q.fileUrl} target="_blank" rel="noopener noreferrer" className="inline-flex items-center gap-1 text-caption text-primary hover:underline">
          <FileText className="h-3.5 w-3.5" /> {q.fileName.length > 20 ? q.fileName.slice(0, 17) + "…" : q.fileName}
        </a>
      ),
    },
  ];
  if (canApprove) {
    quoteColumns.push({
      key: "action",
      label: "Action",
      align: "right",
      render: (q) => {
        const isWinner = q.status === "SELECTED";
        if (!isWinner && !locked && q.status !== "REJECTED") {
          return (
            <Button size="sm" variant="outline" className="h-7" disabled={selectingId === q.id} onClick={() => selectWinner(q.id)}>
              {selectingId === q.id ? <Loader2 className="h-3 w-3 animate-spin" /> : "Select"}
            </Button>
          );
        }
        if (isWinner && q.selectionReason) {
          return <span className="text-caption text-muted-foreground" title={q.selectionReason}>override</span>;
        }
        return null;
      },
    });
  }
  if (canCreate && !locked) {
    quoteColumns.push({
      key: "delete",
      label: "",
      align: "right",
      render: (q) =>
        q.status !== "SELECTED" ? (
          <Button variant="ghost" size="icon" className="h-6 w-6 text-muted-foreground hover:text-danger" onClick={() => deleteQuote(q.id)} title="Delete quote">
            <Trash2 className="h-3 w-3" />
          </Button>
        ) : null,
    });
  }

  return (
    <div className="space-y-3">
      {/* Header row: gate status + upload button */}
      <div className="flex items-center justify-between gap-2">
        <div className="flex items-center gap-2">
          {gateSatisfied ? (
            <span className="flex items-center gap-1.5 text-body text-success">
              <CheckCircle2 className="h-4 w-4" />
              {waived ? "Quote requirement waived" : `${nonRejectedCount}/${minRequired} quotes collected`}
            </span>
          ) : (
            <span className="flex items-center gap-1.5 text-body text-warning">
              <AlertTriangle className="h-4 w-4" />
              {nonRejectedCount}/{minRequired} quotes — need {minRequired - nonRejectedCount} more
            </span>
          )}
          {selectedQuoteId && (
            <span className="flex items-center gap-1 rounded-full bg-primary/10 px-2 py-0.5 text-caption font-medium text-primary">
              <Trophy className="h-3 w-3" /> Winner selected
            </span>
          )}
        </div>
        {canCreate && !locked && (
          <Button size="sm" variant="outline" onClick={() => setUploadOpen(true)}>
            <Plus className="h-3.5 w-3.5" /> Add Quote
          </Button>
        )}
      </div>

      {/* Quote comparison table */}
      {quotes.length === 0 ? (
        <div className="rounded-md border border-dashed py-6 text-center text-body text-muted-foreground">
          No quotes uploaded yet. {canCreate && "Click \"Add Quote\" to upload the first vendor quote."}
        </div>
      ) : (
        <DataTable
          columns={quoteColumns}
          data={quotes}
          className="rounded-md border"
        />
      )}

      {/* Waive button (approvers only, when gate not satisfied and not already waived) */}
      {canApprove && !gateSatisfied && !waived && (
        <div className="flex items-center gap-2">
          <Button size="sm" variant="ghost" onClick={() => setWaiveOpen(true)}>
            <ShieldCheck className="h-3.5 w-3.5" /> Waive quote requirement
          </Button>
          <span className="text-caption text-muted-foreground">For emergency / single-source buys</span>
        </div>
      )}
      {waived && (
        <div className="rounded-md bg-muted/40 px-3 py-2 text-caption text-muted-foreground">
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

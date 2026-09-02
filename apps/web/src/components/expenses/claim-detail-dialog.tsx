"use client";

import { useState, useEffect } from "react";
import { useRouter } from "next/navigation";
import { toast } from "sonner";
import { Plus, Trash2, Loader2, FileText, Receipt } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Input, Label, Select } from "@/components/ui/input";
import { Dialog } from "@/components/ui/dialog";
import { formatCurrency, formatDate } from "@/lib/utils";
import type { ExpenseCategoryRow } from "@/lib/types";
import { EmptyState } from "@/components/empty-state";

type ClaimLine = {
  id: string;
  categoryId: string | null;
  categoryName: string | null;
  category: string;
  amount: number;
  date: string;
  receiptUrl: string | null;
  notes: string | null;
};

type ClaimDetail = {
  id: string;
  claimantName: string;
  projectName: string | null;
  status: string;
  totalAmount: number;
  description: string | null;
  submittedAt: string | null;
  approvedAt: string | null;
  rejectedReason: string | null;
  paidAt: string | null;
  paymentMode: string | null;
  lines: ClaimLine[];
};

/**
 * Claim detail dialog — shows all claim lines and allows adding/removing
 * lines (only when DRAFT). Also shows approval/rejection info for
 * submitted/approved/rejected claims.
 */
export function ClaimDetailDialog({
  claimId,
  open,
  onOpenChange,
  categories,
  canEdit,
}: {
  claimId: string | null;
  open: boolean;
  onOpenChange: (open: boolean) => void;
  categories: ExpenseCategoryRow[];
  canEdit: boolean;
}) {
  const router = useRouter();
  const [detail, setDetail] = useState<ClaimDetail | null>(null);
  const [loading, setLoading] = useState(false);
  const [adding, setAdding] = useState(false);
  const [deletingLine, setDeletingLine] = useState<string | null>(null);
  const [lineForm, setLineForm] = useState({
    categoryId: "",
    category: "",
    amount: "",
    date: new Date().toISOString().slice(0, 10),
    notes: "",
  });

  useEffect(() => {
    if (open && claimId) {
      fetchDetail();
    }
  }, [open, claimId]);

  async function fetchDetail() {
    if (!claimId) return;
    setLoading(true);
    try {
      const res = await fetch(`/api/expense-claims/${claimId}`);
      const data = await res.json();
      if (!res.ok) throw new Error(data.error ?? "Failed to load claim");
      setDetail(data);
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Load failed");
    } finally {
      setLoading(false);
    }
  }

  async function addLine() {
    if (!claimId) return;
    if (!lineForm.category.trim() || !lineForm.amount) {
      toast.error("Category and amount are required");
      return;
    }
    setAdding(true);
    try {
      const res = await fetch(`/api/expense-claims/${claimId}/lines`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          categoryId: lineForm.categoryId || null,
          category: lineForm.category.trim(),
          amount: Number(lineForm.amount),
          date: lineForm.date,
          notes: lineForm.notes || null,
        }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error ?? "Failed to add line");
      toast.success("Line added");
      setLineForm({ categoryId: "", category: "", amount: "", date: new Date().toISOString().slice(0, 10), notes: "" });
      await fetchDetail();
      router.refresh();
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Add failed");
    } finally {
      setAdding(false);
    }
  }

  async function removeLine(lineId: string) {
    setDeletingLine(lineId);
    try {
      const res = await fetch(`/api/expense-claims/${claimId}/lines?lineId=${lineId}`, { method: "DELETE" });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error ?? "Failed to remove line");
      toast.success("Line removed");
      await fetchDetail();
      router.refresh();
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Remove failed");
    } finally {
      setDeletingLine(null);
    }
  }

  const isDraft = detail?.status === "DRAFT";
  const isRejected = detail?.status === "REJECTED";

  return (
    <Dialog
      open={open}
      onOpenChange={onOpenChange}
      title={detail ? `Claim — ${detail.claimantName}` : "Claim Details"}
      description={detail ? `${detail.projectName ?? "Company-wide"} · ${formatCurrency(detail.totalAmount)} total` : "Loading…"}
      className="max-w-2xl"
    >
      {loading ? (
        <div className="flex items-center justify-center py-8">
          <Loader2 className="h-5 w-5 animate-spin text-muted-foreground" />
        </div>
      ) : detail ? (
        <div className="space-y-4">
          {/* Status + meta */}
          <div className="flex items-center gap-2 flex-wrap">
            <Badge variant={STATUS_VARIANT[detail.status] ?? "default"} dot>
              {detail.status}
            </Badge>
            {detail.description && <span className="text-caption text-muted-foreground">{detail.description}</span>}
          </div>

          {/* Rejection reason */}
          {isRejected && detail.rejectedReason && (
            <div className="rounded-md border border-danger-border bg-danger-soft p-3">
              <div className="text-caption font-medium text-danger">Rejection Reason</div>
              <div className="text-body text-foreground mt-0.5">{detail.rejectedReason}</div>
            </div>
          )}

          {/* Approval info */}
          {detail.approvedAt && (
            <div className="text-caption text-muted-foreground">
              {detail.status === "REJECTED" ? "Rejected" : "Approved"} on {formatDate(detail.approvedAt)}
              {detail.paidAt && ` · Paid on ${formatDate(detail.paidAt)}${detail.paymentMode ? ` via ${detail.paymentMode}` : ""}`}
            </div>
          )}

          {/* Lines */}
          <div className="space-y-2">
            <div className="flex items-center justify-between">
              <h4 className="text-subhead font-medium">Expense Lines ({detail.lines.length})</h4>
              {canEdit && isDraft && (
                <span className="text-caption text-muted-foreground">Add lines below</span>
              )}
            </div>

            {detail.lines.length === 0 ? (
              <EmptyState
                icon={<Receipt />}
                title="No expense lines yet"
                description={isDraft && canEdit ? "Add one below." : undefined}
                size="compact"
              />
            ) : (
              <div className="space-y-1.5">
                {detail.lines.map((line) => (
                  <div key={line.id} className="flex items-center justify-between rounded-md border border-border/60 px-3 py-2">
                    <div className="min-w-0 flex-1">
                      <div className="flex items-center gap-2">
                        <span className="font-medium text-foreground truncate">{line.category}</span>
                        {line.receiptUrl && (
                          <a href={line.receiptUrl} target="_blank" rel="noreferrer" className="text-muted-foreground hover:text-foreground" title="View receipt">
                            <FileText className="h-3.5 w-3.5" />
                          </a>
                        )}
                      </div>
                      <div className="text-caption text-muted-foreground">
                        {formatDate(line.date)}{line.notes ? ` · ${line.notes}` : ""}
                      </div>
                    </div>
                    <div className="flex items-center gap-2 shrink-0">
                      <span className="tnum font-medium text-foreground">{formatCurrency(line.amount)}</span>
                      {canEdit && isDraft && (
                        <button
                          type="button"
                          onClick={() => removeLine(line.id)}
                          disabled={deletingLine === line.id}
                          className="rounded p-1 text-muted-foreground hover:bg-danger-soft hover:text-danger"
                          title="Remove line"
                        >
                          {deletingLine === line.id ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Trash2 className="h-3.5 w-3.5" />}
                        </button>
                      )}
                    </div>
                  </div>
                ))}
                <div className="flex justify-between border-t border-border pt-2 mt-2">
                  <span className="font-medium text-foreground">Total</span>
                  <span className="tnum font-semibold text-foreground">{formatCurrency(detail.totalAmount)}</span>
                </div>
              </div>
            )}
          </div>

          {/* Add line form (only in DRAFT) */}
          {canEdit && isDraft && (
            <div className="rounded-lg border border-border bg-muted/20 p-3 space-y-3">
              <h4 className="text-subhead font-medium flex items-center gap-1.5">
                <Plus className="h-3.5 w-3.5" /> Add Expense Line
              </h4>
              <div className="grid grid-cols-3 gap-3">
                <div className="space-y-1.5 col-span-2">
                  <Label htmlFor="cl-line-cat">Category *</Label>
                  {categories.length > 0 ? (
                    <Select
                      id="cl-line-cat"
                      value={lineForm.categoryId}
                      onChange={(e) => {
                        const cat = categories.find((c) => c.id === e.target.value);
                        setLineForm((f) => ({ ...f, categoryId: e.target.value, category: cat?.name ?? f.category }));
                      }}
                    >
                      <option value="">— Select —</option>
                      {categories.filter((c) => c.isActive).map((c) => (
                        <option key={c.id} value={c.id}>{c.name}</option>
                      ))}
                    </Select>
                  ) : (
                    <Input
                      id="cl-line-cat"
                      value={lineForm.category}
                      onChange={(e) => setLineForm((f) => ({ ...f, category: e.target.value }))}
                      placeholder="e.g. Travel"
                    />
                  )}
                </div>
                <div className="space-y-1.5">
                  <Label htmlFor="cl-line-amt">Amount *</Label>
                  <Input
                    id="cl-line-amt"
                    type="number"
                    min="0"
                    step="0.01"
                    value={lineForm.amount}
                    onChange={(e) => setLineForm((f) => ({ ...f, amount: e.target.value }))}
                  />
                </div>
              </div>
              <div className="grid grid-cols-2 gap-3">
                <div className="space-y-1.5">
                  <Label htmlFor="cl-line-date">Date</Label>
                  <Input
                    id="cl-line-date"
                    type="date"
                    value={lineForm.date}
                    onChange={(e) => setLineForm((f) => ({ ...f, date: e.target.value }))}
                  />
                </div>
                <div className="space-y-1.5">
                  <Label htmlFor="cl-line-notes">Notes</Label>
                  <Input
                    id="cl-line-notes"
                    value={lineForm.notes}
                    onChange={(e) => setLineForm((f) => ({ ...f, notes: e.target.value }))}
                    placeholder="Optional"
                  />
                </div>
              </div>
              <div className="flex justify-end">
                <Button size="sm" onClick={addLine} disabled={adding}>
                  {adding ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Plus className="h-3.5 w-3.5" />}
                  Add Line
                </Button>
              </div>
            </div>
          )}

          {!isDraft && !isRejected && (
            <p className="text-caption text-muted-foreground italic">
              This claim is {detail.status.toLowerCase()} — lines can no longer be modified.
            </p>
          )}
        </div>
      ) : (
        <EmptyState
          icon={<Receipt />}
          title="No claim data"
          size="compact"
        />
      )}
    </Dialog>
  );
}

const STATUS_VARIANT: Record<string, "default" | "warning" | "success" | "danger" | "muted"> = {
  DRAFT: "default",
  SUBMITTED: "warning",
  APPROVED: "success",
  REJECTED: "danger",
  PAID: "muted",
};

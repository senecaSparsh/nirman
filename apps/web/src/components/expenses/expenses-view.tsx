"use client";

import { useState, useMemo } from "react";
import { useRouter } from "next/navigation";
import { toast } from "sonner";
import {
  Plus, Settings2, RefreshCw, Pencil, Send, Check, X, Trash2,
  FileText, Receipt as ReceiptIcon, Loader2,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Label, Select } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { EmptyState } from "@/components/empty-state";
import { DeleteConfirmDialog } from "@/components/delete-confirm-dialog";
import { Dialog } from "@/components/ui/dialog";
import { DataTable, type Column } from "@/components/ui/data-table";
import { Tabs, TabsList, TabsTrigger, TabsContent } from "@/components/ui/tabs";
import { formatCurrency, formatDate, } from "@/lib/utils";
import { ExpenseFormDialog, type ExpenseFormValues } from "./expense-form-dialog";
import { ExpenseCategoryDialog } from "./expense-category-dialog";
import type { ExpenseRow, ExpenseCategoryRow, GlAccountOption, ProjectOption } from "@/lib/types";

type Status = ExpenseRow["status"];

const STATUS_BADGE: Record<Status, { variant: "default" | "warning" | "success" | "danger"; label: string }> = {
  DRAFT: { variant: "default", label: "Draft" },
  PENDING: { variant: "warning", label: "Pending" },
  APPROVED: { variant: "success", label: "Approved" },
  REJECTED: { variant: "danger", label: "Rejected" },
};

export function ExpensesView({
  expenses,
  categories,
  projects,
  suppliers,
  glAccounts,
  permissions,
}: {
  expenses: ExpenseRow[];
  categories: ExpenseCategoryRow[];
  projects: ProjectOption[];
  suppliers: { id: string; name: string }[];
  glAccounts: GlAccountOption[];
  permissions: { canCreate: boolean; canApprove: boolean; canManage: boolean; canView: boolean };
}) {
  const router = useRouter();
  const [formOpen, setFormOpen] = useState(false);
  const [editing, setEditing] = useState<ExpenseFormValues | null>(null);
  const [categoryOpen, setCategoryOpen] = useState(false);
  const [deleting, setDeleting] = useState<ExpenseRow | null>(null);
  const [rejecting, setRejecting] = useState<ExpenseRow | null>(null);
  const [rejectReason, setRejectReason] = useState("");
  const [actionLoading, setActionLoading] = useState<string | null>(null);
  const [statusFilter, setStatusFilter] = useState<"ALL" | Status>("ALL");
  const [projectFilter, setProjectFilter] = useState("");
  const [categoryFilter, setCategoryFilter] = useState("");

  const counts = useMemo(() => {
    const c: Record<string, number> = { ALL: expenses.length, DRAFT: 0, PENDING: 0, APPROVED: 0, REJECTED: 0 };
    for (const e of expenses) c[e.status] = (c[e.status] ?? 0) + 1;
    return c;
  }, [expenses]);

  const filtered = useMemo(() => {
    return expenses.filter((e) => {
      if (statusFilter !== "ALL" && e.status !== statusFilter) return false;
      if (projectFilter && e.projectId !== projectFilter) return false;
      if (categoryFilter && e.categoryId !== categoryFilter) return false;
      return true;
    });
  }, [expenses, statusFilter, projectFilter, categoryFilter]);

  function openCreate() {
    setEditing(null);
    setFormOpen(true);
  }

  function openEdit(e: ExpenseRow) {
    setEditing({
      id: e.id,
      projectId: e.projectId,
      categoryId: e.categoryId,
      category: e.category,
      amount: e.amount,
      subtotal: e.subtotal,
      cgst: e.cgst,
      sgst: e.sgst,
      igst: e.igst,
      tdsAmount: e.tdsAmount,
      supplierId: e.supplierId,
      payeeName: e.payeeName,
      paymentMode: e.paymentMode,
      bankAccount: e.bankAccount,
      chequeNo: e.chequeNo,
      chequeDate: e.chequeDate,
      chequePhotoUrl: e.chequePhotoUrl,
      referenceNo: e.referenceNo,
      receiptUrl: e.receiptUrl,
      date: e.date,
      notes: e.notes,
      status: e.status,
      rejectedReason: e.rejectedReason,
      approvedByName: e.approvedByName,
      approvedAt: e.approvedAt,
      submittedByName: e.submittedByName,
      submittedAt: e.submittedAt,
    });
    setFormOpen(true);
  }

  async function doAction(e: ExpenseRow, action: "submit" | "approve", body?: Record<string, unknown>) {
    setActionLoading(`${e.id}-${action}`);
    try {
      const res = await fetch(`/api/expenses/${e.id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ action, ...body }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error ?? `Failed to ${action}`);
      toast.success(action === "submit" ? "Expense submitted for approval" : "Expense approved — GL posted");
      router.refresh();
    } catch (err) {
      const msg = err instanceof Error ? err.message : "Action failed";
      // If the error is a budget overrun, offer to approve with explicit override.
      if (action === "approve" && msg.includes("exceed the budget")) {
        toast.error(msg, {
          duration: 8000,
          action: {
            label: "Override & Approve",
            onClick: () => doAction(e, "approve", { ...body, allowBudgetOverrun: true }),
          },
        });
      } else {
        toast.error(msg);
      }
    } finally {
      setActionLoading(null);
    }
  }

  async function confirmReject() {
    if (!rejecting) return;
    if (!rejectReason.trim()) {
      toast.error("A rejection reason is required");
      return;
    }
    setActionLoading(`${rejecting.id}-reject`);
    try {
      const res = await fetch(`/api/expenses/${rejecting.id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ action: "reject", rejectionReason: rejectReason.trim() }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error ?? "Failed to reject");
      toast.success("Expense rejected");
      setRejecting(null);
      setRejectReason("");
      router.refresh();
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Reject failed");
    } finally {
      setActionLoading(null);
    }
  }

  const filterBar = (
    <div className="flex flex-wrap items-center gap-2">
      <Select value={projectFilter} onChange={(e) => setProjectFilter(e.target.value)} className="h-8 w-auto text-[13px] min-w-[140px]">
        <option value="">All projects</option>
        {projects.map((p) => (
          <option key={p.id} value={p.id}>{p.name}</option>
        ))}
      </Select>
      <Select value={categoryFilter} onChange={(e) => setCategoryFilter(e.target.value)} className="h-8 w-auto text-[13px] min-w-[140px]">
        <option value="">All categories</option>
        {categories.filter((c) => c.isActive).map((c) => (
          <option key={c.id} value={c.id}>{c.name}</option>
        ))}
      </Select>
      {(projectFilter || categoryFilter) && (
        <button
          type="button"
          onClick={() => { setProjectFilter(""); setCategoryFilter(""); }}
          className="text-caption text-muted-foreground hover:text-foreground"
        >
          ✕ clear
        </button>
      )}
    </div>
  );

  const toolbar = (
    <div className="flex items-center gap-2">
      {filterBar}
      <div className="ml-auto flex items-center gap-2">
        <Button variant="outline" size="icon" onClick={() => router.refresh()} title="Refresh">
          <RefreshCw className="h-4 w-4" />
        </Button>
        {permissions.canManage && (
          <Button variant="outline" size="sm" onClick={() => setCategoryOpen(true)}>
            <Settings2 className="h-3.5 w-3.5" /> Categories
          </Button>
        )}
        {permissions.canCreate && (
          <Button size="sm" onClick={openCreate}>
            <Plus className="h-3.5 w-3.5" /> Add Expense
          </Button>
        )}
      </div>
    </div>
  );

  return (
    <div className="space-y-4">
      {toolbar}

      <Tabs defaultValue="ALL" onValueChange={(v) => setStatusFilter(v as "ALL" | Status)}>
        <TabsList>
          <TabsTrigger value="ALL" count={counts.ALL}>All</TabsTrigger>
          <TabsTrigger value="DRAFT" count={counts.DRAFT}>Drafts</TabsTrigger>
          <TabsTrigger value="PENDING" count={counts.PENDING}>Pending</TabsTrigger>
          <TabsTrigger value="APPROVED" count={counts.APPROVED}>Approved</TabsTrigger>
          <TabsTrigger value="REJECTED" count={counts.REJECTED}>Rejected</TabsTrigger>
        </TabsList>

        <TabsContent value={statusFilter}>
          {filtered.length === 0 ? (
            <EmptyState
              icon={<ReceiptIcon className="h-5 w-5" />}
              title="No expenses"
              description={statusFilter === "ALL" ? "Add an expense to get started." : `No ${statusFilter.toLowerCase()} expenses.`}
            />
          ) : (
            <div className="rounded-lg border border-border overflow-hidden">
              <DataTable
                data={filtered}
                initialSort={{ key: "date", direction: "desc" }}
                columns={expenseColumns}
                storageKey="expenses-list"
                hideable
                exportFileName="expenses"
                searchable
                searchPlaceholder="Search by category, payee, notes…"
                onRowClick={(e) => openEdit(e)}
                showTotals
                sumColumns={["amount"]}
                totalFormat={(_key, sum) => formatCurrency(sum)}
                pageSize={50}
                rowActions={(e) => (
                  <ExpenseActions
                    expense={e}
                    permissions={permissions}
                    actionLoading={actionLoading}
                    onEdit={() => openEdit(e)}
                    onSubmit={() => doAction(e, "submit")}
                    onApprove={() => doAction(e, "approve")}
                    onReject={() => { setRejecting(e); setRejectReason(""); }}
                    onDelete={() => setDeleting(e)}
                  />
                )}
              />
            </div>
          )}
        </TabsContent>
      </Tabs>

      <ExpenseFormDialog
        open={formOpen}
        onOpenChange={(o) => { setFormOpen(o); if (!o) setEditing(null); }}
        projects={projects}
        categories={categories}
        suppliers={suppliers}
        editing={editing}
      />

      <ExpenseCategoryDialog
        open={categoryOpen}
        onOpenChange={setCategoryOpen}
        categories={categories}
        glAccounts={glAccounts}
      />

      {deleting && (
        <DeleteConfirmDialog
          open={deleting !== null}
          onOpenChange={(o) => !o && setDeleting(null)}
          endpoint={`/api/expenses/${deleting.id}`}
          title="Delete expense"
          description={`Delete ${deleting.category} expense of ${formatCurrency(deleting.amount)}?${deleting.status === "APPROVED" ? " The GL entry will be reversed." : ""}`}
          successMessage="Expense deleted"
        />
      )}

      {rejecting && (
        <Dialog
          open={rejecting !== null}
          onOpenChange={(o) => !o && setRejecting(null)}
          title="Reject Expense"
          description={`Reject ${rejecting.category} expense of ${formatCurrency(rejecting.amount)}? A reason is required.`}
          className="max-w-md"
        >
          <div className="space-y-3">
            <div className="space-y-1.5">
              <Label htmlFor="reject-reason">Reason *</Label>
              <Textarea
                id="reject-reason"
                value={rejectReason}
                onChange={(e) => setRejectReason(e.target.value)}
                rows={3}
                placeholder="Why is this expense being rejected?"
                autoFocus
              />
            </div>
            <div className="flex justify-end gap-2">
              <Button variant="outline" onClick={() => setRejecting(null)}>Cancel</Button>
              <Button variant="destructive" onClick={confirmReject} disabled={actionLoading === `${rejecting.id}-reject`}>
                {actionLoading === `${rejecting.id}-reject` ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <X className="h-3.5 w-3.5" />}
                Reject Expense
              </Button>
            </div>
          </div>
        </Dialog>
      )}
    </div>
  );
}

// ── Row actions ──────────────────────────────────────────────────

function ExpenseActions({
  expense,
  permissions,
  actionLoading,
  onEdit,
  onSubmit,
  onApprove,
  onReject,
  onDelete,
}: {
  expense: ExpenseRow;
  permissions: { canCreate: boolean; canApprove: boolean; canManage: boolean };
  actionLoading: string | null;
  onEdit: () => void;
  onSubmit: () => void;
  onApprove: () => void;
  onReject: () => void;
  onDelete: () => void;
}) {
  const isLoading = (a: string) => actionLoading === `${expense.id}-${a}`;
  const canEdit = (expense.status === "DRAFT" || expense.status === "REJECTED") && permissions.canCreate;
  const canSubmit = (expense.status === "DRAFT" || expense.status === "REJECTED") && permissions.canCreate;
  const canApprove = expense.status === "PENDING" && permissions.canApprove;
  const canDelete = permissions.canManage && expense.status !== "PENDING";

  return (
    <div className="flex items-center justify-end gap-0.5">
      {expense.receiptUrl && (
        <a
          href={expense.receiptUrl}
          target="_blank"
          rel="noreferrer"
          onClick={(e) => e.stopPropagation()}
          className="rounded p-1.5 text-muted-foreground hover:bg-muted hover:text-foreground"
          title="View receipt"
        >
          <FileText className="h-3.5 w-3.5" />
        </a>
      )}
      {canEdit && (
        <button type="button" onClick={(e) => { e.stopPropagation(); onEdit(); }} className="rounded p-1.5 text-muted-foreground hover:bg-muted hover:text-foreground" title="Edit">
          <Pencil className="h-3.5 w-3.5" />
        </button>
      )}
      {canSubmit && (
        <button type="button" onClick={(e) => { e.stopPropagation(); onSubmit(); }} disabled={isLoading("submit")} className="rounded p-1.5 text-muted-foreground hover:bg-warning-soft hover:text-warning" title="Submit for approval">
          {isLoading("submit") ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Send className="h-3.5 w-3.5" />}
        </button>
      )}
      {canApprove && (
        <button type="button" onClick={(e) => { e.stopPropagation(); onApprove(); }} disabled={isLoading("approve")} className="rounded p-1.5 text-muted-foreground hover:bg-success-soft hover:text-success" title="Approve">
          {isLoading("approve") ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Check className="h-3.5 w-3.5" />}
        </button>
      )}
      {canApprove && (
        <button type="button" onClick={(e) => { e.stopPropagation(); onReject(); }} className="rounded p-1.5 text-muted-foreground hover:bg-danger-soft hover:text-danger" title="Reject">
          <X className="h-3.5 w-3.5" />
        </button>
      )}
      {canDelete && (
        <button type="button" onClick={(e) => { e.stopPropagation(); onDelete(); }} className="rounded p-1.5 text-muted-foreground hover:bg-danger-soft hover:text-danger" title="Delete">
          <Trash2 className="h-3.5 w-3.5" />
        </button>
      )}
    </div>
  );
}

// ── Columns ──────────────────────────────────────────────────────

const expenseColumns: Column<ExpenseRow>[] = [
  {
    key: "date",
    label: "Date",
    sortable: true,
    sortValue: (e) => new Date(e.date),
    width: "110px",
    render: (e) => <span className="tnum text-muted-foreground">{formatDate(e.date)}</span>,
    exportValue: (e) => e.date,
  },
  {
    key: "category",
    label: "Category",
    sortable: true,
    filterable: true,
    render: (e) => (
      <div className="min-w-0">
        <span className="font-medium text-foreground">{e.category}</span>
        {e.projectName && <div className="text-caption text-muted-foreground truncate">{e.projectName}</div>}
      </div>
    ),
    filterValue: (e) => e.category,
    exportValue: (e) => e.category,
  },
  {
    key: "payee",
    label: "Payee / Vendor",
    sortable: true,
    render: (e) => (
      <span className="text-muted-foreground">{e.supplierName ?? e.payeeName ?? "—"}</span>
    ),
    exportValue: (e) => e.supplierName ?? e.payeeName ?? "",
  },
  {
    key: "paymentMode",
    label: "Mode",
    sortable: true,
    filterable: true,
    width: "90px",
    render: (e) => e.paymentMode ? <Badge variant="outline">{e.paymentMode}</Badge> : <span className="text-muted-foreground">—</span>,
    filterValue: (e) => e.paymentMode ?? "—",
    exportValue: (e) => e.paymentMode ?? "",
  },
  {
    key: "amount",
    label: "Amount",
    align: "right",
    sortable: true,
    width: "130px",
    render: (e) => {
      const gst = e.cgst + e.sgst + e.igst;
      return (
        <div className="text-right">
          <span className="tnum font-semibold text-foreground">{formatCurrency(e.amount)}</span>
          {gst > 0 && <div className="text-caption text-muted-foreground tnum">incl. {formatCurrency(gst)} GST</div>}
        </div>
      );
    },
    exportValue: (e) => e.amount,
  },
  {
    key: "status",
    label: "Status",
    sortable: true,
    filterable: true,
    width: "110px",
    render: (e) => {
      const s = STATUS_BADGE[e.status];
      return <Badge variant={s.variant} dot>{s.label}</Badge>;
    },
    filterValue: (e) => STATUS_BADGE[e.status].label,
    exportValue: (e) => STATUS_BADGE[e.status].label,
  },
];

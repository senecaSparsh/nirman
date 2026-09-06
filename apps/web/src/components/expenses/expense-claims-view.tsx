"use client";

import { useState, } from "react";
import { useRouter } from "next/navigation";
import { toast } from "sonner";
import { Plus, RefreshCw, Send, Check, X, Loader2, FileText, Receipt } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Input, Label, Select } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Dialog } from "@/components/ui/dialog";
import { DataTable, type Column } from "@/components/ui/data-table";
import { EmptyState } from "@/components/empty-state";
import { formatCurrency, formatDate } from "@/lib/utils";
import type { ProjectOption, ExpenseCategoryRow } from "@/lib/types";
import { ClaimDetailDialog } from "./claim-detail-dialog";

type ClaimStatus = "DRAFT" | "SUBMITTED" | "APPROVED" | "REJECTED" | "PAID";

const STATUS_BADGE: Record<ClaimStatus, { variant: "default" | "warning" | "success" | "danger" | "muted"; label: string }> = {
  DRAFT: { variant: "default", label: "Draft" },
  SUBMITTED: { variant: "warning", label: "Submitted" },
  APPROVED: { variant: "success", label: "Approved" },
  REJECTED: { variant: "danger", label: "Rejected" },
  PAID: { variant: "muted", label: "Paid" },
};

type ClaimRow = {
  id: string;
  claimantId: string;
  claimantName: string;
  projectId: string | null;
  projectName: string | null;
  status: ClaimStatus;
  totalAmount: number;
  description: string | null;
  submittedAt: string | null;
  approvedAt: string | null;
  paidAt: string | null;
  paymentMode: string | null;
  referenceNo: string | null;
  lineCount: number;
  createdAt: string;
};

export function ExpenseClaimsView({
  claims,
  employees,
  projects,
  categories,
  permissions,
}: {
  claims: ClaimRow[];
  employees: { id: string; name: string }[];
  projects: ProjectOption[];
  categories: ExpenseCategoryRow[];
  permissions: { canCreate: boolean; canApprove: boolean; canManage: boolean };
}) {
  const router = useRouter();
  const [createOpen, setCreateOpen] = useState(false);
  const [detailOpen, setDetailOpen] = useState<ClaimRow | null>(null);
  const [rejecting, setRejecting] = useState<ClaimRow | null>(null);
  const [rejectReason, setRejectReason] = useState("");
  const [paying, setPaying] = useState<ClaimRow | null>(null);
  const [payMode, setPayMode] = useState("NEFT");
  const [payRef, setPayRef] = useState("");
  const [actionLoading, setActionLoading] = useState<string | null>(null);
  const [createForm, setCreateForm] = useState({ claimantId: "", projectId: "", description: "" });

  async function createClaim() {
    if (!createForm.claimantId) {
      toast.error("Select a claimant");
      return;
    }
    setActionLoading("create");
    try {
      const res = await fetch("/api/expense-claims", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          claimantId: createForm.claimantId,
          projectId: createForm.projectId || null,
          description: createForm.description || null,
        }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error ?? "Failed to create claim");
      toast.success("Claim created — add expense lines to it");
      setCreateOpen(false);
      setCreateForm({ claimantId: "", projectId: "", description: "" });
      router.refresh();
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Create failed");
    } finally {
      setActionLoading(null);
    }
  }

  async function doAction(claim: ClaimRow, action: "submit" | "approve" | "reject" | "pay", extra?: Record<string, unknown>) {
    setActionLoading(`${claim.id}-${action}`);
    try {
      const res = await fetch(`/api/expense-claims/${claim.id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ action, ...extra }),
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(data.error ?? `Failed to ${action}`);
      toast.success(action === "submit" ? "Claim submitted" : action === "approve" ? "Claim approved" : action === "reject" ? "Claim rejected" : "Claim paid");
      if (action === "reject") setRejecting(null);
      if (action === "pay") setPaying(null);
      router.refresh();
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Action failed");
    } finally {
      setActionLoading(null);
    }
  }

  const columns: Column<ClaimRow>[] = [
    {
      key: "claimantName",
      label: "Claimant",
      sortable: true,
      render: (c) => (
        <div className="min-w-0">
          <span className="font-medium text-foreground">{c.claimantName}</span>
          {c.projectName && <div className="text-caption text-muted-foreground truncate">{c.projectName}</div>}
        </div>
      ),
      exportValue: (c) => c.claimantName,
    },
    {
      key: "description",
      label: "Description",
      render: (c) => <span className="text-muted-foreground">{c.description ?? "—"}</span>,
      exportValue: (c) => c.description ?? "",
    },
    {
      key: "lineCount",
      label: "Lines",
      align: "center",
      width: "70px",
      render: (c) => <span className="tnum text-muted-foreground">{c.lineCount}</span>,
      exportValue: (c) => c.lineCount,
    },
    {
      key: "totalAmount",
      label: "Total",
      align: "right",
      sortable: true,
      width: "120px",
      render: (c) => <span className="tnum font-semibold text-foreground">{formatCurrency(c.totalAmount)}</span>,
      exportValue: (c) => c.totalAmount,
    },
    {
      key: "status",
      label: "Status",
      sortable: true,
      filterable: true,
      width: "110px",
      render: (c) => {
        const s = STATUS_BADGE[c.status];
        return <Badge variant={s.variant} dot>{s.label}</Badge>;
      },
      filterValue: (c) => STATUS_BADGE[c.status].label,
      exportValue: (c) => STATUS_BADGE[c.status].label,
    },
    {
      key: "createdAt",
      label: "Created",
      sortable: true,
      width: "110px",
      render: (c) => <span className="tnum text-muted-foreground">{formatDate(c.createdAt)}</span>,
      exportValue: (c) => c.createdAt,
    },
  ];

  return (
    <div className="space-y-4">
      <div className="flex items-center gap-2">
        <Button variant="outline" size="icon" onClick={() => router.refresh()} title="Refresh">
          <RefreshCw className="h-4 w-4" />
        </Button>
        {permissions.canCreate && (
          <Button size="sm" className="ml-auto" onClick={() => setCreateOpen(true)}>
            <Plus className="h-3.5 w-3.5" /> New Claim
          </Button>
        )}
      </div>

      {claims.length === 0 ? (
        <EmptyState
          icon={<Receipt className="h-5 w-5" />}
          title="No expense claims"
          description="Create a claim to bundle employee expenses for approval and payment."
        />
      ) : (
        <div className="rounded-lg border border-border overflow-hidden">
          <DataTable
            data={claims}
            columns={columns}
            initialSort={{ key: "createdAt", direction: "desc" }}
            storageKey="expense-claims-list"
            hideable
            exportFileName="expense-claims"
            searchable
            searchPlaceholder="Search by claimant, description…"
            onRowClick={(c) => setDetailOpen(c)}
            pageSize={50}
            rowActions={(c) => (
              <div className="flex items-center justify-end gap-0.5">
                {c.status === "DRAFT" && permissions.canCreate && (
                  <button
                    type="button"
                    onClick={(e) => { e.stopPropagation(); doAction(c, "submit"); }}
                    disabled={actionLoading === `${c.id}-submit`}
                    className="rounded p-1.5 text-muted-foreground hover:bg-warning-soft hover:text-warning"
                    title="Submit for approval"
                  >
                    {actionLoading === `${c.id}-submit` ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Send className="h-3.5 w-3.5" />}
                  </button>
                )}
                {c.status === "SUBMITTED" && permissions.canApprove && (
                  <>
                    <button
                      type="button"
                      onClick={(e) => { e.stopPropagation(); setRejecting(c); setRejectReason(""); }}
                      className="rounded p-1.5 text-muted-foreground hover:bg-danger-soft hover:text-danger"
                      title="Reject"
                    >
                      <X className="h-3.5 w-3.5" />
                    </button>
                    <button
                      type="button"
                      onClick={(e) => { e.stopPropagation(); doAction(c, "approve"); }}
                      disabled={actionLoading === `${c.id}-approve`}
                      className="rounded p-1.5 text-muted-foreground hover:bg-success-soft hover:text-success"
                      title="Approve"
                    >
                      {actionLoading === `${c.id}-approve` ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Check className="h-3.5 w-3.5" />}
                    </button>
                  </>
                )}
                {c.status === "APPROVED" && permissions.canManage && (
                  <button
                    type="button"
                    onClick={(e) => { e.stopPropagation(); setPaying(c); setPayMode("NEFT"); setPayRef(""); }}
                    className="rounded p-1.5 text-muted-foreground hover:bg-brand-soft hover:text-brand"
                    title="Mark as paid"
                  >
                    <FileText className="h-3.5 w-3.5" />
                  </button>
                )}
              </div>
            )}
          />
        </div>
      )}

      {/* Create dialog */}
      <Dialog
        open={createOpen}
        onOpenChange={setCreateOpen}
        title="New Expense Claim"
        description="Create a reimbursement claim. You'll add expense lines to it next."
        className="max-w-md"
      >
        <div className="space-y-3">
          <div className="space-y-1.5">
            <Label htmlFor="cl-claimant">Claimant *</Label>
            <Select id="cl-claimant" value={createForm.claimantId} onChange={(e) => setCreateForm((f) => ({ ...f, claimantId: e.target.value }))}>
              <option value="">— Select employee —</option>
              {employees.map((e) => (
                <option key={e.id} value={e.id}>{e.name}</option>
              ))}
            </Select>
          </div>
          <div className="space-y-1.5">
            <Label htmlFor="cl-project">Project (optional)</Label>
            <Select id="cl-project" value={createForm.projectId} onChange={(e) => setCreateForm((f) => ({ ...f, projectId: e.target.value }))}>
              <option value="">— None —</option>
              {projects.map((p) => (
                <option key={p.id} value={p.id}>{p.name}</option>
              ))}
            </Select>
          </div>
          <div className="space-y-1.5">
            <Label htmlFor="cl-desc">Description</Label>
            <Textarea id="cl-desc" value={createForm.description} onChange={(e) => setCreateForm((f) => ({ ...f, description: e.target.value }))} rows={2} placeholder="e.g. Site travel for March" />
          </div>
          <div className="flex justify-end gap-2 pt-2">
            <Button variant="outline" onClick={() => setCreateOpen(false)}>Cancel</Button>
            <Button onClick={createClaim} disabled={actionLoading === "create"}>
              {actionLoading === "create" ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Plus className="h-3.5 w-3.5" />}
              Create Claim
            </Button>
          </div>
        </div>
      </Dialog>

      {/* Reject dialog */}
      {rejecting && (
        <Dialog
          open={rejecting !== null}
          onOpenChange={(o) => !o && setRejecting(null)}
          title="Reject Claim"
          description={`Reject ${rejecting.claimantName}'s claim of ${formatCurrency(rejecting.totalAmount)}? A reason is required.`}
          className="max-w-md"
        >
          <div className="space-y-3">
            <div className="space-y-1.5">
              <Label htmlFor="cl-reject">Reason *</Label>
              <Textarea id="cl-reject" value={rejectReason} onChange={(e) => setRejectReason(e.target.value)} rows={3} autoFocus />
            </div>
            <div className="flex justify-end gap-2">
              <Button variant="outline" onClick={() => setRejecting(null)}>Cancel</Button>
              <Button variant="destructive" onClick={() => doAction(rejecting, "reject", { rejectionReason: rejectReason })} disabled={actionLoading === `${rejecting.id}-reject`}>
                {actionLoading === `${rejecting.id}-reject` ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <X className="h-3.5 w-3.5" />}
                Reject
              </Button>
            </div>
          </div>
        </Dialog>
      )}

      {/* Pay dialog */}
      {paying && (
        <Dialog
          open={paying !== null}
          onOpenChange={(o) => !o && setPaying(null)}
          title="Pay Claim"
          description={`Mark ${paying.claimantName}'s claim of ${formatCurrency(paying.totalAmount)} as paid.`}
          className="max-w-md"
        >
          <div className="space-y-3">
            <div className="grid grid-cols-2 gap-3">
              <div className="space-y-1.5">
                <Label htmlFor="pay-mode">Payment Mode</Label>
                <Select id="pay-mode" value={payMode} onChange={(e) => setPayMode(e.target.value)}>
                  {["NEFT", "UPI", "BANK", "CHEQUE", "CASH"].map((m) => (
                    <option key={m} value={m}>{m}</option>
                  ))}
                </Select>
              </div>
              <div className="space-y-1.5">
                <Label htmlFor="pay-ref">Reference No.</Label>
                <Input id="pay-ref" value={payRef} onChange={(e) => setPayRef(e.target.value)} placeholder="UTR / Txn ID" />
              </div>
            </div>
            <div className="flex justify-end gap-2">
              <Button variant="outline" onClick={() => setPaying(null)}>Cancel</Button>
              <Button onClick={() => doAction(paying, "pay", { paymentMode: payMode, referenceNo: payRef || null })} disabled={actionLoading === `${paying.id}-pay`}>
                {actionLoading === `${paying.id}-pay` ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Check className="h-3.5 w-3.5" />}
                Mark as Paid
              </Button>
            </div>
          </div>
        </Dialog>
      )}

      {/* Detail dialog — view/add/remove lines */}
      <ClaimDetailDialog
        claimId={detailOpen?.id ?? null}
        open={detailOpen !== null}
        onOpenChange={(o) => !o && setDetailOpen(null)}
        categories={categories}
        canEdit={permissions.canCreate}
      />
    </div>
  );
}

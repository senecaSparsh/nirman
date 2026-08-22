"use client";

import { useState, useEffect, useMemo, useCallback } from "react";
import { toast } from "sonner";
import { Dialog } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input, Select, Textarea } from "@/components/ui/input";
import { Field } from "@/components/field";
import { EmptyState } from "@/components/empty-state";
import { PageLoading } from "@/components/page-loading";
import { SelectWithCreate } from "@/components/ui/select-with-create";
import { ProjectFormDialog } from "@/components/projects/project-form-dialog";
import { cn, formatCurrency, formatDate, formatNumber } from "@/lib/utils";
import type { ProjectOption } from "@/lib/types";
import {
  HardHat,
  Plus,
  Send,
  XCircle,
  Lock,
  Info,
  FileText,
  CheckCircle,
  ShieldCheck,
  Banknote,
  ChevronRight,
  ChevronDown,
} from "lucide-react";

type Project = ProjectOption;

type WorkOrder = {
  id: string;
  workOrderNumber: string;
  workTitle: string;
  status: "DRAFT" | "ISSUED" | "ACTIVE" | "COMPLETED" | "CLOSED" | "CANCELLED";
  retentionPct: number;
  tdsPct: number;
  tdsCategory: string;
  advanceAmount: number;
  advanceRecoveryPct: number;
  totalWorkDone: number;
  totalDeductions: number;
  totalPaid: number;
  retentionBalance: number;
  startDate: string | null;
  endDate: string | null;
  subcontractor: { id: string; name: string; trade: string | null };
  project: { id: string; name: string };
  _count: { raBills: number; lines: number };
};

type WorkOrderDetail = WorkOrder & {
  description: string | null;
  defectLiabilityMonths: number;
  issueDate: string;
  phase: { id: string; name: string } | null;
  lines: Array<{
    id: string;
    agreedRate: number;
    cumulativeQty: number;
    cumulativeAmount: number;
    boqItem: { id: string; serialNo: string; description: string; unit: string | null; estimatedQty: number | null; rate: number | null };
  }>;
  raBills: Array<{
    id: string;
    raBillNumber: string;
    billDate: string;
    status: "DRAFT" | "SUBMITTED" | "APPROVED" | "PAID" | "REJECTED";
    grossAmount: number;
    netPayable: number;
  }>;
};

type RaBill = {
  id: string;
  raBillNumber: string;
  workOrderId: string;
  billDate: string;
  status: "DRAFT" | "SUBMITTED" | "APPROVED" | "PAID" | "REJECTED";
  grossAmount: number;
  netPayable: number;
  periodFrom: string;
  periodTo: string;
  workOrder: { workOrderNumber: string; workTitle: string; subcontractor: { name: string } };
};

const STATUS_CONFIG: Record<WorkOrder["status"], { label: string; color: string; dot: string }> = {
  DRAFT:     { label: "Draft",     color: "text-muted-foreground",  dot: "bg-slate-400" },
  ISSUED:    { label: "Issued",    color: "text-blue-600",          dot: "bg-blue-500" },
  ACTIVE:    { label: "Active",    color: "text-emerald-600",       dot: "bg-emerald-500" },
  COMPLETED: { label: "Completed", color: "text-indigo-600",        dot: "bg-indigo-500" },
  CLOSED:    { label: "Closed",    color: "text-slate-600",         dot: "bg-slate-500" },
  CANCELLED: { label: "Cancelled", color: "text-red-600",           dot: "bg-red-500" },
};

const RA_STATUS_CONFIG: Record<RaBill["status"], { label: string; color: string; bg: string }> = {
  DRAFT:     { label: "Draft",     color: "text-muted-foreground",  bg: "bg-muted" },
  SUBMITTED: { label: "Submitted", color: "text-blue-600",          bg: "bg-blue-100 dark:bg-blue-900/30" },
  APPROVED:  { label: "Approved",  color: "text-emerald-600",       bg: "bg-emerald-100 dark:bg-emerald-900/30" },
  PAID:      { label: "Paid",      color: "text-indigo-600",        bg: "bg-indigo-100 dark:bg-indigo-900/30" },
  REJECTED:  { label: "Rejected",  color: "text-red-600",           bg: "bg-red-100 dark:bg-red-900/30" },
};

const STATUS_FILTERS: Array<{ key: WorkOrder["status"] | "ALL"; label: string }> = [
  { key: "ALL", label: "All" },
  { key: "DRAFT", label: "Draft" },
  { key: "ISSUED", label: "Issued" },
  { key: "ACTIVE", label: "Active" },
  { key: "COMPLETED", label: "Completed" },
  { key: "CLOSED", label: "Closed" },
];

// ════════════════════════════════════════════════════════════
// Print certificate helper — opens a clean print window
// ════════════════════════════════════════════════════════════
type RaBillDetailData = {
  id: string;
  raBillNumber: string;
  billDate: string;
  periodFrom: string;
  periodTo: string;
  status: RaBill["status"];
  grossAmount: number;
  cumulativeGross: number;
  retentionAmount: number;
  tdsAmount: number;
  advanceRecovery: number;
  otherDeductions: number;
  netPayable: number;
  notes: string | null;
  rejectReason: string | null;
  approvedBy: { id: string; name: string } | null;
  approvedAt: string | null;
  workOrder: {
    id: string;
    workOrderNumber: string;
    workTitle: string;
    retentionPct: number;
    tdsPct: number;
    tdsCategory: string;
    advanceAmount: number;
    advanceRecoveryPct: number;
    subcontractor: { id: string; name: string; trade: string | null; gstin: string | null };
  };
  project: { id: string; name: string };
  lines: Array<{
    id: string;
    prevQty: number;
    thisQty: number;
    totalQty: number;
    rate: number;
    prevAmount: number;
    thisAmount: number;
    totalAmount: number;
    boqItem: { id: string; serialNo: string; description: string; unit: string | null };
    mbEntries: Array<{ id: string; mbNumber: string; measuredQty: number; measureDate: string }>;
  }>;
};

// ════════════════════════════════════════════════════════════
// Print certificate helper — opens a clean print window
// ════════════════════════════════════════════════════════════
function printCertificate(detail: RaBillDetailData, raBillNumber: string) {
  const wo = detail.workOrder;
  const linesHtml = detail.lines.map((l) => `
    <tr>
      <td>${l.boqItem.serialNo}</td>
      <td>${l.boqItem.description}</td>
      <td style="text-align:right">${l.prevQty.toFixed(3)}</td>
      <td style="text-align:right">${l.thisQty.toFixed(3)}</td>
      <td style="text-align:right">${l.totalQty.toFixed(3)}</td>
      <td style="text-align:right">${formatCurrency(l.rate)}</td>
      <td style="text-align:right">${formatCurrency(l.prevAmount)}</td>
      <td style="text-align:right">${formatCurrency(l.thisAmount)}</td>
      <td style="text-align:right">${formatCurrency(l.totalAmount)}</td>
    </tr>
  `).join("");

  const html = `<!DOCTYPE html>
<html><head><meta charset="utf-8"><title>Payment Certificate — ${raBillNumber}</title>
<style>
  body { font-family: system-ui, sans-serif; padding: 24px; color: #1a1a1a; font-size: 12px; }
  h1 { font-size: 18px; margin: 0 0 4px; }
  h2 { font-size: 14px; margin: 16px 0 8px; border-bottom: 1px solid #ddd; padding-bottom: 4px; }
  .meta { display: grid; grid-template-columns: 1fr 1fr; gap: 4px 24px; margin: 12px 0; font-size: 11px; }
  .meta div { display: flex; justify-content: space-between; }
  .meta .label { color: #666; }
  table { width: 100%; border-collapse: collapse; margin: 8px 0; }
  th, td { border: 1px solid #ddd; padding: 6px 8px; font-size: 11px; }
  th { background: #f5f5f5; text-align: left; }
  .deductions { margin: 12px 0; }
  .deductions table { max-width: 400px; margin-left: auto; }
  .total-row { font-weight: bold; background: #f9f9f9; }
  .signature { margin-top: 40px; display: flex; justify-content: space-between; }
  .signature div { border-top: 1px solid #333; padding-top: 4px; width: 200px; font-size: 10px; color: #666; }
</style></head><body>
  <h1>Payment Certificate</h1>
  <p style="margin:0;font-size:12px;color:#666">RA Bill ${raBillNumber}</p>

  <div class="meta">
    <div><span class="label">Subcontractor:</span> <span>${wo.subcontractor.name}</span></div>
    <div><span class="label">Work Order:</span> <span>${wo.workOrderNumber}</span></div>
    <div><span class="label">Project:</span> <span>${detail.project.name}</span></div>
    <div><span class="label">Bill Date:</span> <span>${formatDate(detail.billDate)}</span></div>
    <div><span class="label">Billing Period:</span> <span>${formatDate(detail.periodFrom)} → ${formatDate(detail.periodTo)}</span></div>
    <div><span class="label">Status:</span> <span>${detail.status}</span></div>
  </div>

  <h2>Bill Lines</h2>
  <table>
    <thead><tr>
      <th>Serial</th><th>Description</th>
      <th style="text-align:right">Prev Qty</th><th style="text-align:right">This Qty</th><th style="text-align:right">Total Qty</th>
      <th style="text-align:right">Rate</th><th style="text-align:right">Prev Amt</th><th style="text-align:right">This Amt</th><th style="text-align:right">Total Amt</th>
    </tr></thead>
    <tbody>${linesHtml}</tbody>
    <tfoot><tr class="total-row">
      <td colspan="7" style="text-align:right">Gross Amount (this bill)</td>
      <td style="text-align:right">${formatCurrency(detail.grossAmount)}</td>
      <td style="text-align:right">${formatCurrency(detail.cumulativeGross)}</td>
    </tr></tfoot>
  </table>

  <h2>Deductions</h2>
  <div class="deductions">
    <table>
      <tr><td>Retention (${wo.retentionPct}%)</td><td style="text-align:right">${formatCurrency(detail.retentionAmount)}</td></tr>
      <tr><td>TDS (${wo.tdsPct}% — ${wo.tdsCategory})</td><td style="text-align:right">${formatCurrency(detail.tdsAmount)}</td></tr>
      <tr><td>Advance Recovery</td><td style="text-align:right">${formatCurrency(detail.advanceRecovery)}</td></tr>
      ${detail.otherDeductions > 0 ? `<tr><td>Other Deductions</td><td style="text-align:right">${formatCurrency(detail.otherDeductions)}</td></tr>` : ""}
      <tr class="total-row"><td>Total Deductions</td><td style="text-align:right">${formatCurrency(detail.retentionAmount + detail.tdsAmount + detail.advanceRecovery + detail.otherDeductions)}</td></tr>
      <tr class="total-row"><td>Net Payable</td><td style="text-align:right">${formatCurrency(detail.netPayable)}</td></tr>
    </table>
  </div>

  ${detail.approvedBy ? `<p style="font-size:11px;color:#666">Approved by ${detail.approvedBy.name} on ${detail.approvedAt ? formatDate(detail.approvedAt) : ""}</p>` : ""}

  <div class="signature">
    <div>Prepared by</div>
    <div>Approved by</div>
    <div>Received by (Subcontractor)</div>
  </div>
</body></html>`;

  const printWindow = window.open("", "_blank", "width=800,height=600");
  if (!printWindow) {
    toast.error("Pop-up blocked. Please allow pop-ups to print the certificate.");
    return;
  }
  printWindow.document.write(html);
  printWindow.document.close();
  printWindow.focus();
  setTimeout(() => { printWindow.print(); }, 300);
}

// ════════════════════════════════════════════════════════════
// Main component
// ════════════════════════════════════════════════════════════
export function WorkOrdersView({ projects, canCreate, permissions }: {
  projects: Project[];
  canCreate: boolean;
  permissions: { canManage: boolean; canSubmit: boolean; canApprove: boolean; canPay: boolean };
}) {
  const [projectId, setProjectId] = useState(projects[0]?.id ?? "");
  const [workOrders, setWorkOrders] = useState<WorkOrder[]>([]);
  const [loading, setLoading] = useState(false);
  const [statusFilter, setStatusFilter] = useState<WorkOrder["status"] | "ALL">("ALL");
  const [search, setSearch] = useState("");
  const [dialogOpen, setDialogOpen] = useState(false);
  const [detailWO, setDetailWO] = useState<WorkOrder | null>(null);
  const [actionLoading, setActionLoading] = useState(false);
  const [retentionRelease, setRetentionRelease] = useState<{ woId: string; error: string } | null>(null);
  const [overrideReason, setOverrideReason] = useState("");
  // Local copy so freshly created projects appear in the dropdown without
  // waiting for router.refresh.
  const [localProjects, setLocalProjects] = useState<Project[]>(projects);
  useEffect(() => { setLocalProjects(projects); }, [projects]);

  const fetchWOs = useCallback(() => {
    if (!projectId) return;
    setLoading(true);
    fetch(`/api/work-orders?projectId=${projectId}`)
      .then((r) => r.json())
      .then((data) => setWorkOrders(data ?? []))
      .catch(() => toast.error("Failed to load work orders"))
      .finally(() => setLoading(false));
  }, [projectId]);

  useEffect(() => { fetchWOs(); }, [fetchWOs]);

  // ── Stats ──
  const stats = useMemo(() => {
    const total = workOrders.length;
    const active = workOrders.filter((w) => w.status === "ACTIVE").length;
    const draft = workOrders.filter((w) => w.status === "DRAFT").length;
    const issued = workOrders.filter((w) => w.status === "ISSUED").length;
    const totalWorkDone = workOrders.reduce((s, w) => s + w.totalWorkDone, 0);
    const totalPaid = workOrders.reduce((s, w) => s + w.totalPaid, 0);
    const retentionHeld = workOrders.reduce((s, w) => s + w.retentionBalance, 0);
    const raBills = workOrders.reduce((s, w) => s + w._count.raBills, 0);
    return { total, active, draft, issued, totalWorkDone, totalPaid, retentionHeld, raBills };
  }, [workOrders]);

  // ── Filtered WOs ──
  const filteredWOs = useMemo(() => {
    let result = workOrders;
    if (statusFilter !== "ALL") result = result.filter((w) => w.status === statusFilter);
    if (search.trim()) {
      const q = search.toLowerCase();
      result = result.filter((w) =>
        w.workOrderNumber.toLowerCase().includes(q) ||
        w.workTitle.toLowerCase().includes(q) ||
        w.subcontractor.name.toLowerCase().includes(q)
      );
    }
    return result;
  }, [workOrders, statusFilter, search]);

  async function onAction(id: string, action: string, body?: Record<string, unknown>) {
    if (actionLoading) return;
    setActionLoading(true);
    try {
      const res = await fetch(`/api/work-orders/${id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ action, ...body }),
      });
      const data = await res.json();
      if (!res.ok) {
        // If retention release fails due to defect period, open override dialog
        if (action === "release-retention" && data.error?.includes("Defect liability period")) {
          setRetentionRelease({ woId: id, error: data.error });
          setOverrideReason("");
        }
        throw new Error(data.error ?? "Failed");
      }
      toast.success(`Work order ${action === "issue" ? "issued" : action === "complete" ? "marked complete" : action === "release-retention" ? "retention released" : action === "pay-advance" ? "advance paid" : "updated"}`);
      fetchWOs();
      if (detailWO?.id === id) setDetailWO(null);
    } catch (err: unknown) {
      // Don't double-toast if we already opened the override dialog
      if (action === "release-retention" && retentionRelease) return;
      toast.error(err instanceof Error ? err.message : "Failed");
    } finally {
      setActionLoading(false);
    }
  }

  async function onRetentionOverride() {
    if (!retentionRelease || !overrideReason.trim()) return;
    setRetentionRelease(null);
    await onAction(retentionRelease.woId, "release-retention", { overrideReason: overrideReason.trim() });
  }

  if (projects.length === 0) {
    return <EmptyState icon={<HardHat />} title="No projects" description="Create a project to start issuing work orders." />;
  }

  return (
    <div className="space-y-4">
      {/* ── Header ── */}
      <header className="flex flex-wrap items-center justify-between gap-3 min-w-0">
        <div className="flex items-center gap-3 min-w-0">
          <SelectWithCreate
            value={projectId}
            onChange={setProjectId}
            placeholder="Select project…"
            createLabel="project"
            className="h-7 min-w-[180px] text-caption"
            options={localProjects.map((p) => ({ value: p.id, label: p.name }))}
            renderCreateDialog={({ open: o, onCreated, onClose }) => (
              <ProjectFormDialog
                open={o}
                onOpenChange={onClose}
                onCreated={(e) => {
                  setLocalProjects((p) => [...p, { id: e.id, name: e.label ?? "", type: "RESIDENTIAL", status: "PLANNED" }]);
                  onCreated(e);
                }}
              />
            )}
          />
        </div>
        <div className="flex items-center gap-2">
          {canCreate && (
            <Button size="sm" onClick={() => setDialogOpen(true)}>
              <Plus className="mr-1 h-4 w-4" /> New Work Order
            </Button>
          )}
        </div>
      </header>

      {/* ── Stats bar ── */}
      {workOrders.length > 0 && (
        <div className="flex flex-wrap items-center gap-x-4 gap-y-1.5 text-xs text-muted-foreground border-b border-border pb-2">
          <span><strong className="text-foreground tabular-nums">{stats.total}</strong> work orders</span>
          <span className="text-border">·</span>
          <span><strong className="text-foreground tabular-nums">{stats.active}</strong> active</span>
          <span className="text-border">·</span>
          <span><strong className="text-foreground tabular-nums">{stats.issued}</strong> issued</span>
          <span className="text-border">·</span>
          <span><strong className="text-foreground tabular-nums">{stats.draft}</strong> draft</span>
          <span className="text-border">·</span>
          <span><strong className="text-foreground tabular-nums">{stats.raBills}</strong> RA bills</span>
          <span className="text-border">·</span>
          <span><strong className="text-foreground tabular-nums">{formatCurrency(stats.totalWorkDone)}</strong> work done</span>
          <span className="text-border">·</span>
          <span><strong className="text-foreground tabular-nums">{formatCurrency(stats.totalPaid)}</strong> paid</span>
          {stats.retentionHeld > 0 && (
            <>
              <span className="text-border">·</span>
              <span className="text-amber-600"><strong className="tabular-nums">{formatCurrency(stats.retentionHeld)}</strong> retention held</span>
            </>
          )}
        </div>
      )}

      {/* ── Main content ── */}
      {loading && workOrders.length === 0 ? (
        <PageLoading label="Loading work orders…" variant="default" />
      ) : workOrders.length === 0 ? (
        <EmptyState
          icon={<HardHat />}
          title="No work orders"
          description="Create a subcontractor work order against BOQ items to track scope, rates, retention, and TDS."
          action={canCreate ? (
            <Button size="sm" onClick={() => setDialogOpen(true)}>
              <Plus className="mr-1 h-3.5 w-3.5" /> New Work Order
            </Button>
          ) : undefined}
        />
      ) : (
        <>
          {/* ── WO table ── */}
          {filteredWOs.length === 0 ? (
            <div className="rounded-lg border border-border p-8 text-center text-sm text-muted-foreground">
              No work orders match the current filter.
            </div>
          ) : (
            <div className="rounded-lg border border-border overflow-hidden">
              <table className="w-full text-sm">
                <thead className="bg-muted/40 text-[11px] font-medium text-muted-foreground uppercase tracking-wide">
                  <tr>
                    <th className="px-3 py-2 text-left">WO No.</th>
                    <th className="px-3 py-2 text-left">Title / Subcontractor</th>
                    <th className="px-3 py-2 text-right">Scope</th>
                    <th className="px-3 py-2 text-right">Work Done</th>
                    <th className="px-3 py-2 text-right">Paid</th>
                    <th className="px-3 py-2 text-right">Retention</th>
                    <th className="px-3 py-2 text-center">RA Bills</th>
                    <th className="px-3 py-2 text-left">Status</th>
                    <th className="px-2 py-2"></th>
                  </tr>
                </thead>
                <tbody>
                  {filteredWOs.map((wo) => {
                    const cfg = STATUS_CONFIG[wo.status];
                    return (
                      <tr
                        key={wo.id}
                        className="group border-t border-border/30 hover:bg-muted/20 transition-colors cursor-pointer"
                        onClick={() => setDetailWO(wo)}
                      >
                        <td className="px-3 py-2.5 font-mono text-xs font-semibold text-foreground whitespace-nowrap">
                          <span className={cn("inline-block h-1.5 w-1.5 rounded-full mr-1.5 align-middle", cfg.dot)} />
                          {wo.workOrderNumber}
                        </td>
                        <td className="px-3 py-2.5">
                          <div className="truncate max-w-[280px]">{wo.workTitle}</div>
                          <div className="text-[11px] text-muted-foreground">{wo.subcontractor.name}{wo.subcontractor.trade && ` · ${wo.subcontractor.trade}`}</div>
                        </td>
                        <td className="px-3 py-2.5 text-right text-[11px] text-muted-foreground tabular-nums">{wo._count.lines} items</td>
                        <td className="px-3 py-2.5 text-right tabular-nums font-medium">{formatCurrency(wo.totalWorkDone)}</td>
                        <td className="px-3 py-2.5 text-right tabular-nums text-muted-foreground">{formatCurrency(wo.totalPaid)}</td>
                        <td className="px-3 py-2.5 text-right tabular-nums">
                          {wo.retentionBalance > 0 ? <span className="text-amber-600">{formatCurrency(wo.retentionBalance)}</span> : <span className="text-muted-foreground">—</span>}
                        </td>
                        <td className="px-3 py-2.5 text-center tabular-nums text-muted-foreground">{wo._count.raBills}</td>
                        <td className="px-3 py-2.5">
                          <div className="flex items-center gap-1.5">
                            <span className={cn("h-2 w-2 rounded-full shrink-0", cfg.dot)} />
                            <span className={cn("text-xs", cfg.color)}>{cfg.label}</span>
                          </div>
                        </td>
                        <td className="px-2 py-2.5" onClick={(e) => e.stopPropagation()}>
                          <div className="flex items-center gap-0.5 opacity-0 group-hover:opacity-100 transition-opacity">
                            <button onClick={() => setDetailWO(wo)} className="p-1 text-muted-foreground hover:text-primary rounded" title="Details">
                              <Info className="h-3.5 w-3.5" />
                            </button>
                            {canCreate && wo.status === "DRAFT" && (
                              <button onClick={() => onAction(wo.id, "issue")} className="p-1 text-muted-foreground hover:text-primary rounded" title="Issue">
                                <Send className="h-3.5 w-3.5" />
                              </button>
                            )}
                            {canCreate && wo.status === "ACTIVE" && (
                              <button onClick={() => onAction(wo.id, "complete")} className="p-1 text-muted-foreground hover:text-indigo-600 rounded" title="Mark complete">
                                <CheckCircle className="h-3.5 w-3.5" />
                              </button>
                            )}
                            {canCreate && wo.status === "COMPLETED" && (
                              <button onClick={() => onAction(wo.id, "release-retention")} className="p-1 text-muted-foreground hover:text-emerald-600 rounded" title="Release retention">
                                <Lock className="h-3.5 w-3.5" />
                              </button>
                            )}
                          </div>
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
                <tfoot className="border-t border-border bg-muted/20 text-xs">
                  <tr>
                    <td className="px-3 py-2 font-medium" colSpan={3}>Total ({filteredWOs.length})</td>
                    <td className="px-3 py-2 text-right tabular-nums font-medium">{formatCurrency(filteredWOs.reduce((s, w) => s + w.totalWorkDone, 0))}</td>
                    <td className="px-3 py-2 text-right tabular-nums text-muted-foreground">{formatCurrency(filteredWOs.reduce((s, w) => s + w.totalPaid, 0))}</td>
                    <td className="px-3 py-2 text-right tabular-nums text-amber-600">{formatCurrency(filteredWOs.reduce((s, w) => s + w.retentionBalance, 0))}</td>
                    <td className="px-3 py-2 text-center tabular-nums text-muted-foreground">{filteredWOs.reduce((s, w) => s + w._count.raBills, 0)}</td>
                    <td colSpan={2}></td>
                  </tr>
                </tfoot>
              </table>
            </div>
          )}
        </>
      )}

      <WorkOrderDialog
        open={dialogOpen}
        onOpenChange={setDialogOpen}
        projectId={projectId}
        onSaved={fetchWOs}
      />

      <WorkOrderDetailDialog
        wo={detailWO}
        onClose={() => setDetailWO(null)}
        canCreate={canCreate}
        permissions={permissions}
        onAction={onAction}
        onRefresh={fetchWOs}
        actionLoading={actionLoading}
      />

      {/* ── Retention release override dialog ── */}
      <Dialog
        open={!!retentionRelease}
        onOpenChange={(open) => { if (!open) setRetentionRelease(null); }}
        title="Defect Liability Period Not Elapsed"
        description="Override retention release requires a reason"
        className="max-w-md"
      >
        <div className="space-y-3">
          <div className="rounded-md bg-amber-50 dark:bg-amber-900/20 border border-amber-200 dark:border-amber-800 p-3 text-xs text-amber-800 dark:text-amber-200">
            {retentionRelease?.error}
          </div>
          <Field label="Override reason" required>
            <Textarea
              value={overrideReason}
              onChange={(e) => setOverrideReason(e.target.value)}
              placeholder="e.g. Management approval to release early, all defects rectified…"
              rows={3}
              autoFocus
            />
          </Field>
          <div className="flex justify-end gap-2">
            <Button type="button" variant="ghost" onClick={() => setRetentionRelease(null)}>Cancel</Button>
            <Button
              type="button"
              disabled={!overrideReason.trim() || actionLoading}
              onClick={onRetentionOverride}
            >
              <Lock className="mr-1 h-3.5 w-3.5" /> Override & Release
            </Button>
          </div>
        </div>
      </Dialog>
    </div>
  );
}

// ════════════════════════════════════════════════════════════
// WO Detail Dialog — scope, RA bills, financials
// ════════════════════════════════════════════════════════════
function WorkOrderDetailDialog({
  wo,
  onClose,
  canCreate,
  permissions,
  onAction,
  onRefresh,
  actionLoading,
}: {
  wo: WorkOrder | null;
  onClose: () => void;
  canCreate: boolean;
  permissions: { canManage: boolean; canSubmit: boolean; canApprove: boolean; canPay: boolean };
  onAction: (id: string, action: string, body?: Record<string, unknown>) => void;
  onRefresh: () => void;
  actionLoading: boolean;
}) {
  const [detail, setDetail] = useState<WorkOrderDetail | null>(null);
  const [loading, setLoading] = useState(false);
  const [raBillDialogOpen, setRaBillDialogOpen] = useState(false);
  const [raBillDetail, setRaBillDetail] = useState<{ id: string; number: string } | null>(null);
  const [advanceOpen, setAdvanceOpen] = useState(false);
  const [advanceAmount, setAdvanceAmount] = useState("");
  const [advanceMode, setAdvanceMode] = useState("BANK_TRANSFER");
  const [advanceRef, setAdvanceRef] = useState("");

  useEffect(() => {
    if (!wo) { setDetail(null); return; }
    setLoading(true);
    fetch(`/api/work-orders/${wo.id}`)
      .then((r) => r.json())
      .then((data) => setDetail(data))
      .catch(() => setDetail(null))
      .finally(() => setLoading(false));
  }, [wo]);

  if (!wo) return null;

  const cfg = STATUS_CONFIG[wo.status];

  return (
    <>
      <Dialog
        open={!!wo}
        onOpenChange={(open) => { if (!open) onClose(); }}
        title={`${wo.workOrderNumber} — ${wo.workTitle}`}
        description={`${wo.subcontractor.name}${wo.subcontractor.trade ? ` · ${wo.subcontractor.trade}` : ""} · ${wo.project.name}`}
        className="max-w-4xl"
      >
        {loading ? (
          <div className="py-12 text-center text-sm text-muted-foreground">Loading…</div>
        ) : detail ? (
          <div className="space-y-5">
            {/* ── Hero metrics row ── */}
            <div className="grid grid-cols-5 gap-3">
              <div className="rounded-lg border border-border p-3">
                <div className="text-[10px] uppercase text-muted-foreground tracking-wider mb-1">Status</div>
                <div className="flex items-center gap-1.5">
                  <span className={cn("h-2 w-2 rounded-full", cfg.dot)} />
                  <span className={cn("text-sm font-semibold", cfg.color)}>{cfg.label}</span>
                </div>
              </div>
              <div className="rounded-lg border border-border p-3">
                <div className="text-[10px] uppercase text-muted-foreground tracking-wider mb-1">Work Done</div>
                <div className="text-base font-bold tabular-nums">{formatCurrency(detail.totalWorkDone)}</div>
              </div>
              <div className="rounded-lg border border-border p-3">
                <div className="text-[10px] uppercase text-muted-foreground tracking-wider mb-1">Advance Paid</div>
                <div className="text-base font-bold tabular-nums text-indigo-600">{formatCurrency(detail.advanceAmount)}</div>
              </div>
              <div className="rounded-lg border border-border p-3">
                <div className="text-[10px] uppercase text-muted-foreground tracking-wider mb-1">Paid</div>
                <div className="text-base font-bold tabular-nums text-muted-foreground">{formatCurrency(detail.totalPaid)}</div>
              </div>
              <div className="rounded-lg border border-border p-3">
                <div className="text-[10px] uppercase text-muted-foreground tracking-wider mb-1">Retention Held</div>
                <div className="text-base font-bold tabular-nums text-amber-600">{formatCurrency(detail.retentionBalance)}</div>
              </div>
            </div>

            {/* ── Financial terms ── */}
            <div>
              <h3 className="text-xs font-semibold text-foreground uppercase tracking-wider mb-2.5">Financial Terms</h3>
              <div className="grid grid-cols-4 gap-3 text-sm">
                <div className="rounded-md bg-muted/30 px-3 py-2">
                  <div className="text-[10px] text-muted-foreground mb-0.5">Retention</div>
                  <div className="tabular-nums font-medium">{detail.retentionPct}%</div>
                </div>
                <div className="rounded-md bg-muted/30 px-3 py-2">
                  <div className="text-[10px] text-muted-foreground mb-0.5">TDS <span className="text-[9px]">({detail.tdsCategory})</span></div>
                  <div className="tabular-nums font-medium">{detail.tdsPct}%</div>
                </div>
                <div className="rounded-md bg-muted/30 px-3 py-2">
                  <div className="text-[10px] text-muted-foreground mb-0.5">Advance</div>
                  <div className="tabular-nums font-medium">{formatCurrency(detail.advanceAmount)}</div>
                </div>
                <div className="rounded-md bg-muted/30 px-3 py-2">
                  <div className="text-[10px] text-muted-foreground mb-0.5">Recovery %</div>
                  <div className="tabular-nums font-medium">{detail.advanceRecoveryPct}%</div>
                </div>
              </div>
              {/* Advance balance tracker */}
              {detail.advanceAmount > 0 && (
                <div className="mt-2 flex items-center justify-between rounded-md border border-amber-200 dark:border-amber-800/50 bg-amber-50 dark:bg-amber-900/10 px-3 py-2">
                  <span className="text-xs text-muted-foreground">Advance balance</span>
                  <div className="flex items-center gap-2.5">
                    <div className="h-1.5 w-28 rounded-full bg-amber-200 dark:bg-amber-900/40 overflow-hidden">
                      <div
                        className="h-full bg-amber-500 rounded-full"
                        style={{ width: `${Math.max(((detail.advanceAmount - detail.totalPaid) / detail.advanceAmount) * 100, 0)}%` }}
                      />
                    </div>
                    <span className="text-xs tabular-nums font-semibold">
                      {formatCurrency(Math.max(detail.advanceAmount - detail.totalPaid, 0))}
                      <span className="text-muted-foreground font-normal"> / {formatCurrency(detail.advanceAmount)}</span>
                    </span>
                  </div>
                </div>
              )}
              <div className="flex gap-4 mt-2 text-[11px] text-muted-foreground">
                <span>Issued: <span className="text-foreground">{formatDate(detail.issueDate)}</span></span>
                <span>Start: <span className="text-foreground">{detail.startDate ? formatDate(detail.startDate) : "—"}</span></span>
                <span>Defect liability: <span className="text-foreground">{detail.defectLiabilityMonths}mo</span></span>
              </div>
            </div>

            {/* ── Scope (BOQ lines) ── */}
            <div>
              <h3 className="text-xs font-semibold text-foreground uppercase tracking-wider mb-2.5">
                Scope <span className="text-muted-foreground font-normal">— BOQ Items ({detail.lines.length})</span>
              </h3>
              <div className="rounded-lg border border-border overflow-x-auto">
                <table className="w-full table-fixed">
                  <colgroup>
                    <col className="w-[60px]" />
                    <col />
                    <col className="w-[90px]" />
                    <col className="w-[100px]" />
                    <col className="w-[180px]" />
                    <col className="w-[110px]" />
                  </colgroup>
                  <thead className="bg-muted/50 text-[10px] uppercase text-muted-foreground tracking-wide">
                    <tr>
                      <th className="px-3 py-2 text-left font-medium">BOQ</th>
                      <th className="px-3 py-2 text-left font-medium">Description</th>
                      <th className="px-3 py-2 text-right font-medium">BOQ Rate</th>
                      <th className="px-3 py-2 text-right font-medium">Agreed</th>
                      <th className="px-3 py-2 text-left font-medium">Progress</th>
                      <th className="px-3 py-2 text-right font-medium">Cum. Amount</th>
                    </tr>
                  </thead>
                  <tbody>
                    {detail.lines.map((l) => {
                      const boqRate = l.boqItem.rate;
                      const rateDiff = boqRate != null ? l.agreedRate - boqRate : null;
                      const estQty = l.boqItem.estimatedQty;
                      const progressPct = estQty != null && estQty > 0 ? Math.min((l.cumulativeQty / estQty) * 100, 100) : 0;
                      const isOverBudget = estQty != null && l.cumulativeQty > estQty;
                      return (
                        <tr key={l.id} className="border-t border-border/40">
                          <td className="px-3 py-2 font-mono text-[11px] text-muted-foreground whitespace-nowrap">{l.boqItem.serialNo}</td>
                          <td className="px-3 py-2 text-xs truncate">{l.boqItem.description}</td>
                          <td className="px-3 py-2 text-right tabular-nums text-[11px] text-muted-foreground whitespace-nowrap">{boqRate != null ? formatCurrency(boqRate) : "—"}</td>
                          <td className="px-3 py-2 text-right tabular-nums text-xs font-medium whitespace-nowrap">
                            {formatCurrency(l.agreedRate)}
                            {rateDiff != null && rateDiff !== 0 && (
                              <span className={cn("text-[9px] ml-1", rateDiff < 0 ? "text-emerald-600" : "text-red-600")}>
                                {rateDiff < 0 ? "▼" : "▲"}{Math.abs(rateDiff).toFixed(0)}
                              </span>
                            )}
                          </td>
                          <td className="px-3 py-2">
                            <div className="flex flex-col gap-1">
                              <div className="h-2 rounded-full bg-border overflow-hidden">
                                <div
                                  className={cn("h-full rounded-full transition-all", isOverBudget ? "bg-red-500" : progressPct >= 100 ? "bg-emerald-500" : "bg-primary")}
                                  style={{ width: `${Math.max(progressPct, 3)}%` }}
                                />
                              </div>
                              <span className={cn("text-[11px] tabular-nums", isOverBudget ? "text-red-600 font-medium" : "text-muted-foreground")}>
                                {formatNumber(l.cumulativeQty, 0)}{estQty != null ? `/${formatNumber(estQty, 0)}` : ""} {l.boqItem.unit ?? ""}
                              </span>
                            </div>
                          </td>
                          <td className="px-3 py-2 text-right tabular-nums text-xs font-semibold whitespace-nowrap">{formatCurrency(l.cumulativeAmount)}</td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              </div>
            </div>

            {/* ── RA Bills ── */}
            <div>
              <div className="flex items-center justify-between mb-2.5">
                <h3 className="text-xs font-semibold text-foreground uppercase tracking-wider">
                  RA Bills <span className="text-muted-foreground font-normal">({detail.raBills.length})</span>
                </h3>
                {canCreate && (detail.status === "ISSUED" || detail.status === "ACTIVE") && (
                  <Button size="sm" variant="ghost" onClick={() => setRaBillDialogOpen(true)}>
                    <Plus className="mr-1 h-3.5 w-3.5" /> Create RA Bill
                  </Button>
                )}
              </div>
              {detail.raBills.length === 0 ? (
                <div className="text-xs text-muted-foreground py-6 text-center rounded-lg border border-dashed border-border">
                  No RA bills yet. Create one to bill for completed work measured in MB entries.
                </div>
              ) : (
                <div className="rounded-lg border border-border overflow-hidden">
                  <table className="w-full">
                    <thead className="bg-muted/50 text-[10px] uppercase text-muted-foreground tracking-wide">
                      <tr>
                        <th className="px-3 py-2 text-left font-medium">RA No.</th>
                        <th className="px-3 py-2 text-left font-medium">Date</th>
                        <th className="px-3 py-2 text-right font-medium">Gross</th>
                        <th className="px-3 py-2 text-right font-medium">Net Payable</th>
                        <th className="px-3 py-2 text-left font-medium">Status</th>
                        <th className="px-3 py-2"></th>
                      </tr>
                    </thead>
                    <tbody>
                      {detail.raBills.map((rb) => {
                        const rCfg = RA_STATUS_CONFIG[rb.status];
                        return (
                          <tr key={rb.id} className="border-t border-border/40 hover:bg-muted/20 cursor-pointer" onClick={() => setRaBillDetail({ id: rb.id, number: rb.raBillNumber })}>
                            <td className="px-3 py-2 font-mono text-[11px] whitespace-nowrap">{rb.raBillNumber}</td>
                            <td className="px-3 py-2 tabular-nums text-[11px] text-muted-foreground whitespace-nowrap">{formatDate(rb.billDate)}</td>
                            <td className="px-3 py-2 text-right tabular-nums text-xs whitespace-nowrap">{formatCurrency(rb.grossAmount)}</td>
                            <td className="px-3 py-2 text-right tabular-nums text-xs font-semibold whitespace-nowrap">{formatCurrency(rb.netPayable)}</td>
                            <td className="px-3 py-2">
                              <span className={cn("text-[10px] px-2 py-0.5 rounded-full whitespace-nowrap", rCfg.bg, rCfg.color)}>{rCfg.label}</span>
                            </td>
                            <td className="px-3 py-2" onClick={(e) => e.stopPropagation()}>
              <div className="flex items-center gap-0.5">
                {canCreate && permissions.canSubmit && rb.status === "DRAFT" && (
                  <button disabled={actionLoading} onClick={() => onRaBillAction(rb.id, "submit", onRefresh)} className="p-1 text-muted-foreground hover:text-primary disabled:opacity-50" title="Submit">
                    <Send className="h-3.5 w-3.5" />
                  </button>
                )}
                {canCreate && permissions.canApprove && rb.status === "SUBMITTED" && (
                  <button disabled={actionLoading} onClick={() => onRaBillAction(rb.id, "approve", onRefresh)} className="p-1 text-muted-foreground hover:text-emerald-600 disabled:opacity-50" title="Approve">
                    <ShieldCheck className="h-3.5 w-3.5" />
                  </button>
                )}
                {canCreate && permissions.canPay && rb.status === "APPROVED" && (
                  <button disabled={actionLoading} onClick={() => onRaBillAction(rb.id, "pay", onRefresh)} className="p-1 text-muted-foreground hover:text-indigo-600 disabled:opacity-50" title="Mark paid">
                    <Banknote className="h-3.5 w-3.5" />
                  </button>
                )}
              </div>
            </td>
                          </tr>
                        );
                      })}
                    </tbody>
                  </table>
                </div>
              )}
            </div>

            {/* ── Actions ── */}
            <div className="flex justify-end gap-2 pt-1 border-t border-border">
              {canCreate && permissions.canManage && detail.status === "DRAFT" && (
                <Button size="sm" disabled={actionLoading} onClick={() => { onAction(detail.id, "issue"); }}>
                  <Send className="mr-1 h-3.5 w-3.5" /> Issue Work Order
                </Button>
              )}
              {canCreate && permissions.canManage && (detail.status === "ISSUED" || detail.status === "ACTIVE") && (
                <Button size="sm" variant="outline" disabled={actionLoading} onClick={() => { setAdvanceAmount(""); setAdvanceRef(""); setAdvanceOpen(true); }}>
                  <Banknote className="mr-1 h-3.5 w-3.5" /> Pay Advance
                </Button>
              )}
              {canCreate && permissions.canManage && detail.status === "ACTIVE" && (
                <Button size="sm" disabled={actionLoading} onClick={() => { onAction(detail.id, "complete"); }}>
                  <CheckCircle className="mr-1 h-3.5 w-3.5" /> Mark Complete
                </Button>
              )}
              {canCreate && permissions.canPay && detail.status === "COMPLETED" && (
                <Button size="sm" disabled={actionLoading} onClick={() => { onAction(detail.id, "release-retention"); }}>
                  <Lock className="mr-1 h-3.5 w-3.5" /> Release Retention
                </Button>
              )}
              <Button type="button" variant="ghost" onClick={onClose}>Close</Button>
            </div>
          </div>
        ) : (
          <div className="py-8 text-center text-sm text-muted-foreground">Failed to load details.</div>
        )}
      </Dialog>

      {raBillDialogOpen && detail && (
        <RaBillDialog
          open={raBillDialogOpen}
          onOpenChange={setRaBillDialogOpen}
          workOrderId={detail.id}
          workOrderNumber={detail.workOrderNumber}
          onSaved={() => { onRefresh(); setRaBillDialogOpen(false); }}
        />
      )}

      {raBillDetail && (
        <RaBillDetailDialog
          raBillId={raBillDetail.id}
          raBillNumber={raBillDetail.number}
          onClose={() => setRaBillDetail(null)}
          canCreate={canCreate}
          permissions={permissions}
          onAction={(action, rejectReason) => { onRaBillAction(raBillDetail.id, action, onRefresh, rejectReason); setRaBillDetail(null); }}
        />
      )}

      {/* ── Pay advance dialog ── */}
      <Dialog
        open={advanceOpen}
        onOpenChange={setAdvanceOpen}
        title="Pay Advance to Subcontractor"
        description={detail ? `${detail.workOrderNumber} — ${detail.subcontractor.name}` : ""}
        className="max-w-md"
      >
        <form
          onSubmit={(e) => {
            e.preventDefault();
            if (!detail || !advanceAmount || Number(advanceAmount) <= 0) return;
            setAdvanceOpen(false);
            onAction(detail.id, "pay-advance", {
              amount: Number(advanceAmount),
              paymentMode: advanceMode,
              paymentReference: advanceRef || undefined,
            });
          }}
          className="space-y-3"
        >
          <Field label="Advance amount (₹)" required>
            <Input
              type="number"
              min="1"
              step="0.01"
              value={advanceAmount}
              onChange={(e) => setAdvanceAmount(e.target.value)}
              placeholder="e.g. 50000"
              required
              autoFocus
            />
          </Field>
          <Field label="Payment mode" required>
            <select
              value={advanceMode}
              onChange={(e) => setAdvanceMode(e.target.value)}
              className="flex h-9 w-full rounded-md border border-input bg-transparent px-3 py-1 text-sm shadow-sm focus:outline-none focus:ring-1 focus:ring-ring"
            >
              <option value="BANK_TRANSFER">Bank Transfer</option>
              <option value="CHEQUE">Cheque</option>
              <option value="CASH">Cash</option>
              <option value="DEMAND_DRAFT">Demand Draft</option>
              <option value="NEFT">NEFT</option>
              <option value="RTGS">RTGS</option>
              <option value="UPI">UPI</option>
            </select>
          </Field>
          <Field label="Payment reference">
            <Input
              value={advanceRef}
              onChange={(e) => setAdvanceRef(e.target.value)}
              placeholder="e.g. NEFT-ADV-001, Cheque No. 123456"
            />
          </Field>
          <div className="flex justify-end gap-2">
            <Button type="button" variant="ghost" onClick={() => setAdvanceOpen(false)}>Cancel</Button>
            <Button type="submit" disabled={!advanceAmount || Number(advanceAmount) <= 0 || actionLoading}>
              <Banknote className="mr-1 h-3.5 w-3.5" /> Pay Advance
            </Button>
          </div>
        </form>
      </Dialog>
    </>
  );
}

// ── RA Bill action helper ──
async function onRaBillAction(id: string, action: string, onRefresh: () => void, rejectReason?: string) {
  try {
    const body: Record<string, unknown> = { action };
    if (action === "reject") {
      if (!rejectReason?.trim()) return;
      body.reason = rejectReason.trim();
    }
    const res = await fetch(`/api/ra-bills/${id}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(body),
    });
    const data = await res.json();
    if (!res.ok) throw new Error(data.error ?? "Failed");
    toast.success(`RA bill ${action}ed`);
    onRefresh();
  } catch (err: unknown) {
    toast.error(err instanceof Error ? err.message : "Failed");
  }
}

// ════════════════════════════════════════════════════════════
// RA Bill Creation Dialog — with pre-creation preview
// ════════════════════════════════════════════════════════════
function RaBillDialog({
  open,
  onOpenChange,
  workOrderId,
  workOrderNumber,
  onSaved,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  workOrderId: string;
  workOrderNumber: string;
  onSaved: () => void;
}) {
  const [periodFrom, setPeriodFrom] = useState("");
  const [periodTo, setPeriodTo] = useState("");
  const [notes, setNotes] = useState("");
  const [saving, setSaving] = useState(false);
  const [preview, setPreview] = useState<PreviewData | null>(null);
  const [previewLoading, setPreviewLoading] = useState(false);

  // Fetch preview when dialog opens
  useEffect(() => {
    if (!open || !workOrderId) return;
    setPreviewLoading(true);
    fetch(`/api/ra-bills?preview=unbilled&workOrderId=${workOrderId}`)
      .then((r) => r.json())
      .then((data) => setPreview(data))
      .catch(() => setPreview(null))
      .finally(() => setPreviewLoading(false));
  }, [open, workOrderId]);

  const totalUnbilledEntries = preview?.lines.reduce((s, l) => s + l.unbilledEntries.length, 0) ?? 0;
  const hasUnbilled = totalUnbilledEntries > 0;
  const estNet = preview ? preview.summary.estimatedGross - preview.summary.estimatedRetention - preview.summary.estimatedTds - preview.summary.estimatedAdvanceRecovery : 0;

  async function onSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (!periodFrom || !periodTo) {
      toast.error("Billing period is required");
      return;
    }
    if (new Date(periodFrom) > new Date(periodTo)) {
      toast.error("Period 'From' date cannot be after 'To' date");
      return;
    }
    setSaving(true);
    try {
      const res = await fetch("/api/ra-bills", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          workOrderId,
          periodFrom: new Date(periodFrom).toISOString(),
          periodTo: new Date(periodTo).toISOString(),
          notes: notes || undefined,
        }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error ?? "Failed");
      toast.success(`RA bill ${data.raBillNumber} created`, {
        description: `Gross: ${formatCurrency(data.grossAmount)} · Net: ${formatCurrency(data.netPayable)}`,
      });
      onOpenChange(false);
      onSaved();
    } catch (err: unknown) {
      toast.error(err instanceof Error ? err.message : "Failed");
    } finally {
      setSaving(false);
    }
  }

  return (
    <Dialog
      open={open}
      onOpenChange={onOpenChange}
      title="Create RA Bill"
      description={`${workOrderNumber} — billing period for completed work`}
      className="max-w-2xl"
    >
      <form onSubmit={onSubmit} className="space-y-3">
        <div className="grid grid-cols-2 gap-3">
          <Field label="Period From" required>
            <Input type="date" value={periodFrom} onChange={(e) => setPeriodFrom(e.target.value)} required />
          </Field>
          <Field label="Period To" required>
            <Input type="date" value={periodTo} onChange={(e) => setPeriodTo(e.target.value)} required />
          </Field>
        </div>
        <Field label="Notes">
          <Textarea value={notes} onChange={(e) => setNotes(e.target.value)} rows={2} placeholder="e.g. RA Bill 1 — Ground floor brickwork" />
        </Field>

        {/* ── Pre-creation preview ── */}
        {previewLoading ? (
          <div className="rounded-md bg-muted/40 p-3 text-xs text-muted-foreground text-center">Loading available MB entries…</div>
        ) : preview ? (
          hasUnbilled ? (
            <div className="space-y-2">
              <div className="text-[11px] font-medium text-muted-foreground uppercase tracking-wide">
                Available Unbilled MB Entries ({totalUnbilledEntries})
              </div>
              <div className="rounded-md border border-border overflow-hidden">
                <table className="w-full text-xs">
                  <thead className="bg-muted/40 text-[10px] uppercase text-muted-foreground">
                    <tr>
                      <th className="px-2 py-1.5 text-left">BOQ Item</th>
                      <th className="px-2 py-1.5 text-left">MB No.</th>
                      <th className="px-2 py-1.5 text-right">Qty</th>
                      <th className="px-2 py-1.5 text-right">Rate</th>
                      <th className="px-2 py-1.5 text-right">Amount</th>
                    </tr>
                  </thead>
                  <tbody>
                    {preview.lines.filter((l) => l.unbilledEntries.length > 0).map((l) =>
                      l.unbilledEntries.map((e, i) => (
                        <tr key={`${l.boqItemId}-${e.id}`} className="border-t border-border/30">
                          {i === 0 ? (
                            <td className="px-2 py-1.5" rowSpan={l.unbilledEntries.length}>
                              <div className="font-mono text-[10px] text-muted-foreground">{l.serialNo}</div>
                              <div className="truncate max-w-[140px]">{l.description}</div>
                            </td>
                          ) : null}
                          <td className="px-2 py-1.5 font-mono text-[10px]">{e.mbNumber}</td>
                          <td className="px-2 py-1.5 text-right tabular-nums">{formatNumber(e.measuredQty, 3)} {l.unit ?? ""}</td>
                          <td className="px-2 py-1.5 text-right tabular-nums">{formatCurrency(l.agreedRate)}</td>
                          <td className="px-2 py-1.5 text-right tabular-nums font-medium">{formatCurrency(e.measuredQty * l.agreedRate)}</td>
                        </tr>
                      ))
                    )}
                  </tbody>
                  <tfoot className="border-t border-border bg-muted/20">
                    <tr>
                      <td className="px-2 py-1.5 font-medium" colSpan={4}>Estimated Gross</td>
                      <td className="px-2 py-1.5 text-right tabular-nums font-bold">{formatCurrency(preview.summary.estimatedGross)}</td>
                    </tr>
                  </tfoot>
                </table>
              </div>

              {/* Estimated deductions */}
              <div className="rounded-md bg-muted/30 p-3 text-xs space-y-1">
                <div className="flex justify-between">
                  <span className="text-muted-foreground">Retention ({preview.retentionPct}%)</span>
                  <span className="tabular-nums text-amber-600">−{formatCurrency(preview.summary.estimatedRetention)}</span>
                </div>
                <div className="flex justify-between">
                  <span className="text-muted-foreground">TDS ({preview.tdsPct}%)</span>
                  <span className="tabular-nums text-red-600">−{formatCurrency(preview.summary.estimatedTds)}</span>
                </div>
                {preview.summary.estimatedAdvanceRecovery > 0 && (
                  <div className="flex justify-between">
                    <span className="text-muted-foreground">Advance recovery ({preview.advanceRecoveryPct}%)</span>
                    <span className="tabular-nums text-red-600">−{formatCurrency(preview.summary.estimatedAdvanceRecovery)}</span>
                  </div>
                )}
                <div className="flex justify-between border-t border-border/50 pt-1">
                  <span className="font-medium">Estimated Net Payable</span>
                  <span className="tabular-nums font-bold text-emerald-600">{formatCurrency(estNet)}</span>
                </div>
              </div>

              {/* Previous bills */}
              {preview.previousBills.length > 0 && (
                <div className="text-[11px] text-muted-foreground">
                  Previous bills: {preview.previousBills.map((b) => `${b.raBillNumber} (${formatCurrency(b.grossAmount)})`).join(", ")}
                </div>
              )}
            </div>
          ) : (
            <div className="rounded-md border border-amber-300 dark:border-amber-700 bg-amber-50 dark:bg-amber-900/20 p-3 text-xs text-amber-700 dark:text-amber-400">
              <strong>No unbilled MB entries found.</strong> All approved Measurement Book entries for this work order's BOQ items have already been billed. Create and approve new MB entries first.
            </div>
          )
        ) : null}

        <div className="flex justify-end gap-2">
          <Button type="button" variant="ghost" onClick={() => onOpenChange(false)}>Cancel</Button>
          <Button type="submit" disabled={saving || !hasUnbilled}>
            {saving ? "Creating…" : hasUnbilled ? "Create RA Bill" : "No entries to bill"}
          </Button>
        </div>
      </form>
    </Dialog>
  );
}

// ════════════════════════════════════════════════════════════
// Work Order Creation Dialog
// ════════════════════════════════════════════════════════════
function WorkOrderDialog({
  open,
  onOpenChange,
  projectId,
  onSaved,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  projectId: string;
  onSaved: () => void;
}) {
  const [form, setForm] = useState({
    subcontractorId: "",
    workTitle: "",
    description: "",
    retentionPct: "5",
    tdsCategory: "COMPANY",
    advanceAmount: "0",
    advanceRecoveryPct: "10",
    defectLiabilityMonths: "12",
  });
  const [lines, setLines] = useState([{ boqItemId: "", agreedRate: "" }]);
  const [subcontractors, setSubcontractors] = useState<{ id: string; name: string; trade: string | null }[]>([]);
  const [boqItems, setBoqItems] = useState<{ id: string; serialNo: string; description: string; unit: string | null; rate: number | null; estimatedQty: number | null }[]>([]);
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    fetch("/api/subcontractors").then((r) => r.json()).then((d) => setSubcontractors(d ?? [])).catch(() => {});
  }, []);

  useEffect(() => {
    if (!projectId) return;
    fetch(`/api/boq/tree?projectId=${projectId}`)
      .then((r) => r.json())
      .then((data) => {
        const items: typeof boqItems = [];
        function collect(nodes: any[]) {
          for (const n of nodes) {
            if (n.type === "LINE_ITEM") items.push({ id: n.id, serialNo: n.serialNo, description: n.description, unit: n.unit, rate: n.rate, estimatedQty: n.estimatedQty });
            if (n.children) collect(n.children);
          }
        }
        collect(data.tree ?? []);
        setBoqItems(items);
      });
  }, [projectId]);

  function set<K extends keyof typeof form>(key: K, value: (typeof form)[K]) {
    setForm((f) => ({ ...f, [key]: value }));
  }

  function setLine(idx: number, key: "boqItemId" | "agreedRate", value: string) {
    setLines((prev) => prev.map((l, i) => i === idx ? { ...l, [key]: value } : l));
  }

  function addLine() { setLines((prev) => [...prev, { boqItemId: "", agreedRate: "" }]); }
  function removeLine(idx: number) { setLines((prev) => prev.filter((_, i) => i !== idx)); }

  // Auto-fill agreed rate from BOQ rate when BOQ item selected
  function onBoqSelect(idx: number, boqItemId: string) {
    const boq = boqItems.find((b) => b.id === boqItemId);
    setLines((prev) => prev.map((l, i) => i === idx ? { boqItemId, agreedRate: l.agreedRate || (boq?.rate?.toString() ?? "") } : l));
  }

  async function onSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (!projectId || !form.subcontractorId || !form.workTitle.trim()) {
      toast.error("Subcontractor and title are required");
      return;
    }
    const validLines = lines.filter((l) => l.boqItemId && l.agreedRate);
    if (validLines.length === 0) {
      toast.error("At least one BOQ line item with an agreed rate is required");
      return;
    }
    setSaving(true);
    try {
      const res = await fetch("/api/work-orders", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          projectId,
          ...form,
          retentionPct: parseFloat(form.retentionPct),
          advanceAmount: parseFloat(form.advanceAmount),
          advanceRecoveryPct: parseFloat(form.advanceRecoveryPct),
          defectLiabilityMonths: parseInt(form.defectLiabilityMonths),
          lines: validLines.map((l) => ({
            boqItemId: l.boqItemId,
            agreedRate: parseFloat(l.agreedRate),
          })),
        }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error ?? "Failed");
      toast.success(`Work order ${data.workOrderNumber} created`);
      onOpenChange(false);
      setForm({ subcontractorId: "", workTitle: "", description: "", retentionPct: "5", tdsCategory: "COMPANY", advanceAmount: "0", advanceRecoveryPct: "10", defectLiabilityMonths: "12" });
      setLines([{ boqItemId: "", agreedRate: "" }]);
      onSaved();
    } catch (err: unknown) {
      toast.error(err instanceof Error ? err.message : "Unknown error");
    } finally {
      setSaving(false);
    }
  }

  return (
    <Dialog
      open={open}
      onOpenChange={onOpenChange}
      title="New Subcontractor Work Order"
      description="Issue a work order against BOQ items with agreed rates, retention %, and TDS category."
      className="max-w-3xl"
    >
      <form onSubmit={onSubmit} className="space-y-3">
        <div className="grid gap-3 sm:grid-cols-2">
          <Field label="Subcontractor" required>
            <Select value={form.subcontractorId} onChange={(e) => set("subcontractorId", e.target.value)} required>
              <option value="">— Select subcontractor —</option>
              {subcontractors.map((s) => <option key={s.id} value={s.id}>{s.name}{s.trade ? ` (${s.trade})` : ""}</option>)}
            </Select>
          </Field>
          <Field label="Work Title" required>
            <Input value={form.workTitle} onChange={(e) => set("workTitle", e.target.value)} placeholder="e.g. Plumbing for Tower A" required />
          </Field>
        </div>
        <Field label="Description">
          <Textarea value={form.description} onChange={(e) => set("description", e.target.value)} rows={2} placeholder="Scope description…" />
        </Field>
        <div className="grid gap-3 sm:grid-cols-4">
          <Field label="Retention %">
            <Input type="number" step="0.01" value={form.retentionPct} onChange={(e) => set("retentionPct", e.target.value)} />
          </Field>
          <Field label="TDS Category">
            <Select value={form.tdsCategory} onChange={(e) => set("tdsCategory", e.target.value)}>
              <option value="INDIVIDUAL">Individual (1%)</option>
              <option value="COMPANY">Company (2%)</option>
              <option value="OTHER">Other (2%)</option>
            </Select>
          </Field>
          <Field label="Advance Amount">
            <Input type="number" step="0.01" value={form.advanceAmount} onChange={(e) => set("advanceAmount", e.target.value)} />
          </Field>
          <Field label="Advance Recovery %">
            <Input type="number" step="0.01" value={form.advanceRecoveryPct} onChange={(e) => set("advanceRecoveryPct", e.target.value)} />
          </Field>
        </div>

        <div className="space-y-2">
          <div className="flex items-center justify-between">
            <span className="text-sm font-medium">Scope (BOQ Items)</span>
            <Button type="button" variant="ghost" size="sm" onClick={addLine}>+ Add line</Button>
          </div>
          {lines.map((line, idx) => {
            const boq = boqItems.find((b) => b.id === line.boqItemId);
            const agreedRate = parseFloat(line.agreedRate) || 0;
            const rateDiff = boq?.rate != null ? agreedRate - boq.rate : null;
            return (
              <div key={idx} className="space-y-1">
                <div className="grid grid-cols-[1fr_120px_auto] gap-2">
                  <Select value={line.boqItemId} onChange={(e) => onBoqSelect(idx, e.target.value)}>
                    <option value="">— Select BOQ item —</option>
                    {boqItems.map((b) => <option key={b.id} value={b.id}>{b.serialNo} — {b.description}</option>)}
                  </Select>
                  <Input type="number" step="0.01" placeholder="Rate ₹" value={line.agreedRate} onChange={(e) => setLine(idx, "agreedRate", e.target.value)} />
                  {lines.length > 1 && (
                    <button type="button" onClick={() => removeLine(idx)} className="text-muted-foreground hover:text-destructive">
                      <XCircle className="h-4 w-4" />
                    </button>
                  )}
                </div>
                {boq && (
                  <div className="flex items-center gap-3 text-[11px] text-muted-foreground pl-1">
                    <span>BOQ rate: <span className="tabular-nums text-foreground">{formatCurrency(boq.rate ?? 0)}</span></span>
                    <span>Est qty: <span className="tabular-nums text-foreground">{formatNumber(boq.estimatedQty ?? 0, 3)} {boq.unit ?? ""}</span></span>
                    {rateDiff != null && rateDiff !== 0 && (
                      <span className={rateDiff < 0 ? "text-emerald-600" : "text-red-600"}>
                        {rateDiff < 0 ? "▼" : "▲"} {formatCurrency(Math.abs(rateDiff))} vs BOQ
                      </span>
                    )}
                    {agreedRate > 0 && boq.estimatedQty != null && (
                      <span className="ml-auto">Est. value: <span className="tabular-nums text-foreground font-medium">{formatCurrency(agreedRate * boq.estimatedQty)}</span></span>
                    )}
                  </div>
                )}
              </div>
            );
          })}
        </div>

        <div className="flex justify-end gap-2 pt-1">
          <Button type="button" variant="ghost" onClick={() => onOpenChange(false)}>Cancel</Button>
          <Button type="submit" disabled={saving}>{saving ? "Saving…" : "Create Work Order"}</Button>
        </div>
      </form>
    </Dialog>
  );
}

// ════════════════════════════════════════════════════════════
// RA Bill Detail Dialog — line-by-line breakdown, deduction
// calculation transparency, payment certificate preview
// ════════════════════════════════════════════════════════════

function RaBillDetailDialog({
  raBillId,
  raBillNumber,
  onClose,
  canCreate,
  permissions,
  onAction,
}: {
  raBillId: string;
  raBillNumber: string;
  onClose: () => void;
  canCreate: boolean;
  permissions: { canManage: boolean; canSubmit: boolean; canApprove: boolean; canPay: boolean };
  onAction: (action: string, rejectReason?: string) => void;
}) {
  const [detail, setDetail] = useState<RaBillDetailData | null>(null);
  const [loading, setLoading] = useState(true);
  const [showCalc, setShowCalc] = useState(false);
  const [rejectOpen, setRejectOpen] = useState(false);
  const [rejectReason, setRejectReason] = useState("");
  const [actionLoading, setActionLoading] = useState(false);

  useEffect(() => {
    fetch(`/api/ra-bills/${raBillId}`)
      .then((r) => r.json())
      .then((data) => setDetail(data))
      .catch(() => setDetail(null))
      .finally(() => setLoading(false));
  }, [raBillId]);

  const rCfg = detail ? RA_STATUS_CONFIG[detail.status] : null;

  return (
    <Dialog
      open={!!raBillId}
      onOpenChange={(open) => { if (!open) onClose(); }}
      title={`${raBillNumber} — RA Bill`}
      description={detail ? `${detail.workOrder.subcontractor.name} · ${detail.workOrder.workTitle}` : "Loading…"}
      className="max-w-3xl"
    >
      {loading ? (
        <div className="py-8 text-center text-xs text-muted-foreground">Loading RA bill…</div>
      ) : detail ? (
        <div className="space-y-3">
          {/* ── Header: status + period ── */}
          <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
            <div>
              <div className="text-[9px] uppercase text-muted-foreground tracking-wide">Status</div>
              <div className="mt-0.5">
                <span className={cn("text-[10px] px-1.5 py-0.5 rounded-full", rCfg!.bg, rCfg!.color)}>{rCfg!.label}</span>
              </div>
            </div>
            <div>
              <div className="text-[9px] uppercase text-muted-foreground tracking-wide">Billing Period</div>
              <div className="text-xs tabular-nums">{formatDate(detail.periodFrom)} → {formatDate(detail.periodTo)}</div>
            </div>
            <div>
              <div className="text-[9px] uppercase text-muted-foreground tracking-wide">Bill Date</div>
              <div className="text-xs tabular-nums">{formatDate(detail.billDate)}</div>
            </div>
            <div>
              <div className="text-[9px] uppercase text-muted-foreground tracking-wide">Cumulative Gross</div>
              <div className="text-xs tabular-nums font-medium">{formatCurrency(detail.cumulativeGross)}</div>
            </div>
          </div>

          {/* ── RA Bill Lines (the heart of the bill) ── */}
          <div className="border-t border-border pt-2.5">
            <div className="text-[10px] font-medium text-muted-foreground uppercase tracking-wide mb-1.5">
              Bill Lines ({detail.lines.length})
            </div>
            <div className="rounded-md border border-border overflow-x-auto">
              <table className="w-full text-xs">
                <thead className="bg-muted/40 text-[9px] uppercase text-muted-foreground">
                  <tr>
                    <th className="px-2 py-1 text-left">BOQ Item</th>
                    <th className="px-2 py-1 text-right">Prev Qty</th>
                    <th className="px-2 py-1 text-right">This Qty</th>
                    <th className="px-2 py-1 text-right">Total Qty</th>
                    <th className="px-2 py-1 text-right">Rate</th>
                    <th className="px-2 py-1 text-right">Prev Amt</th>
                    <th className="px-2 py-1 text-right">This Amt</th>
                    <th className="px-2 py-1 text-right">Total Amt</th>
                  </tr>
                </thead>
                <tbody>
                  {detail.lines.map((l) => (
                    <tr key={l.id} className="border-t border-border/30">
                      <td className="px-2 py-1">
                        <div className="font-mono text-[10px] text-muted-foreground">{l.boqItem.serialNo}</div>
                        <div className="text-[11px] truncate max-w-[180px]">{l.boqItem.description}</div>
                        {l.mbEntries.length > 0 && (
                          <div className="mt-0.5 text-[9px] text-blue-600 dark:text-blue-400">
                            {l.mbEntries.length} MB entr{l.mbEntries.length === 1 ? "y" : "ies"}:
                            {" "}{l.mbEntries.map((e) => e.mbNumber).join(", ")}
                          </div>
                        )}
                      </td>
                      <td className="px-2 py-1 text-right tabular-nums text-muted-foreground">{formatNumber(l.prevQty, 3)}</td>
                      <td className="px-2 py-1 text-right tabular-nums font-medium">{formatNumber(l.thisQty, 3)} {l.boqItem.unit ?? ""}</td>
                      <td className="px-2 py-1 text-right tabular-nums">{formatNumber(l.totalQty, 3)}</td>
                      <td className="px-2 py-1 text-right tabular-nums">{formatCurrency(l.rate)}</td>
                      <td className="px-2 py-1 text-right tabular-nums text-muted-foreground">{formatCurrency(l.prevAmount)}</td>
                      <td className="px-2 py-1 text-right tabular-nums font-medium">{formatCurrency(l.thisAmount)}</td>
                      <td className="px-2 py-1 text-right tabular-nums">{formatCurrency(l.totalAmount)}</td>
                    </tr>
                  ))}
                </tbody>
                <tfoot className="border-t border-border bg-muted/20">
                  <tr>
                    <td className="px-2 py-1.5 text-[11px] font-medium" colSpan={6}>Gross Amount (this bill)</td>
                    <td className="px-2 py-1.5 text-right tabular-nums font-bold text-primary" colSpan={2}>{formatCurrency(detail.grossAmount)}</td>
                  </tr>
                </tfoot>
              </table>
            </div>
          </div>

          {/* ── Deduction breakdown (toggle) ── */}
          <div className="border-t border-border pt-2.5">
            <button
              onClick={() => setShowCalc(!showCalc)}
              className="flex items-center gap-1 text-[10px] font-medium text-muted-foreground uppercase tracking-wide hover:text-foreground"
            >
              {showCalc ? <ChevronDown className="h-3 w-3" /> : <ChevronRight className="h-3 w-3" />}
              Deduction Calculation
            </button>
            {showCalc && (
              <div className="mt-1.5 rounded-md bg-muted/30 p-2.5 text-xs space-y-1">
                <div className="flex justify-between">
                  <span className="text-muted-foreground">Gross amount</span>
                  <span className="tabular-nums font-medium">{formatCurrency(detail.grossAmount)}</span>
                </div>
                <div className="flex justify-between">
                  <span className="text-muted-foreground">
                    Retention ({detail.workOrder.retentionPct}% of gross)
                  </span>
                  <span className="tabular-nums text-amber-600">−{formatCurrency(detail.retentionAmount)}</span>
                </div>
                <div className="flex justify-between">
                  <span className="text-muted-foreground">
                    TDS ({detail.workOrder.tdsPct}% · {detail.workOrder.tdsCategory} · Sec 194C)
                  </span>
                  <span className="tabular-nums text-red-600">−{formatCurrency(detail.tdsAmount)}</span>
                </div>
                {detail.advanceRecovery > 0 && (
                  <div className="flex justify-between">
                    <span className="text-muted-foreground">
                      Advance recovery ({detail.workOrder.advanceRecoveryPct}% of gross, from {formatCurrency(detail.workOrder.advanceAmount)} advance)
                    </span>
                    <span className="tabular-nums text-red-600">−{formatCurrency(detail.advanceRecovery)}</span>
                  </div>
                )}
                {detail.otherDeductions > 0 && (
                  <div className="flex justify-between">
                    <span className="text-muted-foreground">Other deductions</span>
                    <span className="tabular-nums text-red-600">−{formatCurrency(detail.otherDeductions)}</span>
                  </div>
                )}
                <div className="flex justify-between border-t border-border/50 pt-1">
                  <span className="font-medium">Net Payable</span>
                  <span className="tabular-nums font-bold text-emerald-600">{formatCurrency(detail.netPayable)}</span>
                </div>
              </div>
            )}
          </div>

          {/* ── Summary card ── */}
          <div className="grid grid-cols-3 gap-2 border-t border-border pt-2.5">
            <div className="rounded-md bg-muted/30 p-2">
              <div className="text-[9px] uppercase text-muted-foreground tracking-wide">Gross</div>
              <div className="text-xs font-semibold tabular-nums">{formatCurrency(detail.grossAmount)}</div>
            </div>
            <div className="rounded-md bg-red-50 dark:bg-red-900/10 p-2">
              <div className="text-[9px] uppercase text-muted-foreground tracking-wide">Deductions</div>
              <div className="text-xs font-semibold tabular-nums text-red-600">
                −{formatCurrency(detail.retentionAmount + detail.tdsAmount + detail.advanceRecovery + detail.otherDeductions)}
              </div>
            </div>
            <div className="rounded-md bg-emerald-50 dark:bg-emerald-900/10 p-2">
              <div className="text-[9px] uppercase text-muted-foreground tracking-wide">Net Payable</div>
              <div className="text-xs font-bold tabular-nums text-emerald-600">{formatCurrency(detail.netPayable)}</div>
            </div>
          </div>

          {/* ── Approval info ── */}
          {detail.approvedBy && (
            <div className="border-t border-border pt-3 text-xs text-muted-foreground">
              Approved by <span className="text-foreground font-medium">{detail.approvedBy.name}</span>
              {detail.approvedAt && <> on {formatDate(detail.approvedAt)}</>}
            </div>
          )}
          {detail.rejectReason && (
            <div className="border-t border-border pt-3 text-xs text-red-600">
              Rejected: {detail.rejectReason}
            </div>
          )}
          {detail.notes && (
            <div className="border-t border-border pt-3 text-xs text-muted-foreground">
              <span className="font-medium text-foreground">Notes:</span> {detail.notes}
            </div>
          )}

          {/* ── Actions ── */}
          <div className="flex justify-between items-center pt-1 border-t border-border no-print">
            <div>
              {(detail.status === "APPROVED" || detail.status === "PAID") && (
                <Button size="sm" variant="outline" onClick={() => printCertificate(detail, raBillNumber)}>
                  <FileText className="mr-1 h-3.5 w-3.5" /> Print Certificate
                </Button>
              )}
            </div>
            <div className="flex gap-2">
              {canCreate && permissions.canSubmit && detail.status === "DRAFT" && (
                <Button size="sm" disabled={actionLoading} onClick={() => { setActionLoading(true); onAction("submit"); }}>
                  <Send className="mr-1 h-3.5 w-3.5" /> Submit for Approval
                </Button>
              )}
              {canCreate && permissions.canApprove && detail.status === "SUBMITTED" && (
                <>
                  <Button size="sm" variant="ghost" disabled={actionLoading} onClick={() => { setRejectReason(""); setRejectOpen(true); }}>
                    <XCircle className="mr-1 h-3.5 w-3.5" /> Reject
                  </Button>
                  <Button size="sm" disabled={actionLoading} onClick={() => { setActionLoading(true); onAction("approve"); }}>
                    <ShieldCheck className="mr-1 h-3.5 w-3.5" /> Approve
                  </Button>
                </>
              )}
              {canCreate && permissions.canPay && detail.status === "APPROVED" && (
                <Button size="sm" disabled={actionLoading} onClick={() => { setActionLoading(true); onAction("pay"); }}>
                  <Banknote className="mr-1 h-3.5 w-3.5" /> Mark as Paid
                </Button>
              )}
              <Button type="button" variant="ghost" onClick={onClose}>Close</Button>
            </div>
          </div>
        </div>
      ) : (
        <div className="py-8 text-center text-sm text-muted-foreground">Failed to load RA bill.</div>
      )}

      {/* ── Rejection reason sub-dialog ── */}
      <Dialog
        open={rejectOpen}
        onOpenChange={setRejectOpen}
        title="Reject RA Bill"
        description={`Provide a reason for rejecting ${raBillNumber}`}
        className="max-w-md"
      >
        <div className="space-y-3">
          <Field label="Rejection reason" required>
            <Textarea
              value={rejectReason}
              onChange={(e) => setRejectReason(e.target.value)}
              placeholder="e.g. Quantities need re-measurement, rate mismatch with BOQ…"
              rows={3}
              autoFocus
            />
          </Field>
          <div className="flex justify-end gap-2">
            <Button type="button" variant="ghost" onClick={() => setRejectOpen(false)}>Cancel</Button>
            <Button
              type="button"
              variant="destructive"
              disabled={!rejectReason.trim() || actionLoading}
              onClick={() => { setActionLoading(true); onAction("reject", rejectReason); setRejectOpen(false); }}
            >
              <XCircle className="mr-1 h-3.5 w-3.5" /> Confirm Rejection
            </Button>
          </div>
        </div>
      </Dialog>
    </Dialog>
  );
}

// ════════════════════════════════════════════════════════════
// Enhanced RA Bill Creation Dialog — with pre-creation preview
// of available unbilled MB entries
// ════════════════════════════════════════════════════════════
type PreviewData = {
  workOrderNumber: string;
  retentionPct: number;
  tdsPct: number;
  advanceAmount: number;
  advanceRecoveryPct: number;
  totalPaid: number;
  lines: Array<{
    boqItemId: string;
    serialNo: string;
    description: string;
    unit: string | null;
    estimatedQty: number;
    agreedRate: number;
    cumulativeQty: number;
    unbilledEntries: Array<{
      id: string;
      mbNumber: string;
      measuredQty: number;
      measureDate: string;
      description: string;
    }>;
  }>;
  previousBills: Array<{
    id: string;
    raBillNumber: string;
    grossAmount: number;
    netPayable: number;
    status: string;
  }>;
  summary: {
    totalUnbilledQty: number;
    estimatedGross: number;
    estimatedRetention: number;
    estimatedTds: number;
    estimatedAdvanceRecovery: number;
  };
};

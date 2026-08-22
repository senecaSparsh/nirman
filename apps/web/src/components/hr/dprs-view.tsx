"use client";

import { useState, useEffect } from "react";
import { useRouter } from "next/navigation";
import { ClipboardList, Plus, Cloud, Pencil, Trash2, CheckCircle2, XCircle, ShieldCheck, RotateCw, Ruler, RefreshCw, Recycle, Loader2, SearchX, Wallet } from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Input, Select, Label, Textarea } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import { Table, THead, TBody, TR, TH, TD } from "@/components/ui/table";
import { DataTable, type Column } from "@/components/ui/data-table";
import { Dialog } from "@/components/ui/dialog";
import { EmptyState } from "@/components/empty-state";
import { DeleteConfirmDialog } from "@/components/delete-confirm-dialog";
import { SelectWithCreate } from "@/components/ui/select-with-create";
import { ProjectFormDialog } from "@/components/projects/project-form-dialog";
import { EmployeeQuickCreateDialog } from "@/components/hr/employee-quick-create-dialog";
import { formatDate, formatNumber, formatCurrency, formatCurrencyCompact, formatCurrencyDetailed, cn } from "@/lib/utils";

export type DprApprovalStatus = "SUBMITTED" | "SUB_ADMIN_APPROVED" | "APPROVED" | "REJECTED";

const APPROVAL_LABELS: Record<DprApprovalStatus, string> = {
  SUBMITTED: "Pending",
  SUB_ADMIN_APPROVED: "Sub-Admin Approved",
  APPROVED: "Approved",
  REJECTED: "Rejected",
};

const APPROVAL_BADGE: Record<DprApprovalStatus, string> = {
  SUBMITTED: "bg-warning/10 text-warning",
  SUB_ADMIN_APPROVED: "bg-info/10 text-info",
  APPROVED: "bg-success/10 text-success",
  REJECTED: "bg-danger/10 text-danger",
};

/** DPR summary stats bar. */
function DprStatsBar({ dprs }: { dprs: DprRow[] }) {
  const total = dprs.length;
  const pending = dprs.filter((d) => d.approvalStatus === "SUBMITTED").length;
  const subApproved = dprs.filter((d) => d.approvalStatus === "SUB_ADMIN_APPROVED").length;
  const approved = dprs.filter((d) => d.approvalStatus === "APPROVED").length;
  const rejected = dprs.filter((d) => d.approvalStatus === "REJECTED").length;
  const avgProgress = total > 0 ? dprs.reduce((sum, d) => sum + d.progressPct, 0) / total : 0;

  return (
    <div className="grid grid-cols-2 divide-border overflow-hidden rounded-lg border border-border bg-card sm:grid-cols-5 sm:divide-x divide-y sm:divide-y-0">
      <div className="flex flex-col gap-0.5 p-3">
        <span className="text-label text-muted-foreground/75">Total DPRs</span>
        <span className="text-figure text-foreground">{total}</span>
      </div>
      <div className="flex flex-col gap-0.5 p-3">
        <span className="text-label text-muted-foreground/75">Pending</span>
        <span className="text-figure text-warning">{pending}</span>
        <span className="text-micro text-muted-foreground">awaiting sub-admin</span>
      </div>
      <div className="flex flex-col gap-0.5 p-3">
        <span className="text-label text-muted-foreground/75">Sub-Approved</span>
        <span className="text-figure text-info">{subApproved}</span>
        <span className="text-micro text-muted-foreground">awaiting admin</span>
      </div>
      <div className="flex flex-col gap-0.5 p-3">
        <span className="text-label text-muted-foreground/75">Approved</span>
        <span className="text-figure text-success">{approved}</span>
        <span className="text-micro text-muted-foreground">{rejected} rejected</span>
      </div>
      <div className="flex flex-col gap-0.5 p-3">
        <span className="text-label text-muted-foreground/75">Avg Progress</span>
        <span className="text-figure text-foreground">{avgProgress.toFixed(1)}%</span>
        <div className="mt-0.5 h-1 overflow-hidden rounded-full bg-muted">
          <div className="h-full rounded-full bg-[var(--color-world-hr)]" style={{ width: `${Math.min(avgProgress, 100)}%` }} />
        </div>
      </div>
    </div>
  );
}

export type DprRow = {
  id: string;
  date: string;
  projectId: string;
  projectName: string;
  weather: string | null;
  workSummary: string;
  workType: string | null;
  progressPct: number;
  blockers: string | null;
  tomorrowPlan: string | null;
  submittedByName: string | null;
  approvalStatus: DprApprovalStatus;
  subAdminApprovedByName: string | null;
  adminApprovedByName: string | null;
  materialLineCount: number;
  laborLineCount: number;
  totalProjectCost: number | null;
  costPerSqft: number | null;
  projectBudget: number | null;
  totalSellableArea: number | null;
};

export interface DprDetail {
  id: string;
  projectId: string;
  date: string;
  weather: string | null;
  workSummary: string;
  workType: string | null;
  workQty: number | null;
  workUnit: string | null;
  progressPct: number;
  blockers: string | null;
  tomorrowPlan: string | null;
  notes: string | null;
  varianceAnalysis: Array<{
    materialId: string;
    materialCode: string;
    materialName: string;
    unit: string;
    actualQty: number;
    standardQty: number;
    variance: number;
    variancePct: number;
    isOverConsumption: boolean;
  }> | null;
  autoScrapGenerationId: string | null;
  materialLines: { id: string; materialId: string; materialName: string; unit: string; qty: number; unitCost: number }[];
  laborLines: { id: string; employeeId: string | null; employeeName: string | null; crewId: string | null; crewName: string | null; hoursWorked: number; taskDescription: string }[];
  totalProjectCost: number | null;
  costPerSqft: number | null;
  projectBudget: number | null;
  totalSellableArea: number | null;
}

export function DprsView({
  dprs,
  projects,
  materials,
  employees,
  workTypes,
  permissions,
}: {
  dprs: DprRow[];
  projects: { id: string; name: string }[];
  materials: { id: string; name: string; unit: string; standardCost: number }[];
  employees: { id: string; name: string }[];
  workTypes?: string[];
  permissions?: { canSubmit?: boolean; canSubAdminApprove?: boolean; canAdminApprove?: boolean };
}) {
  const router = useRouter();
  const canSubmit = permissions?.canSubmit ?? false;
  const canSubAdminApprove = permissions?.canSubAdminApprove ?? false;
  const canAdminApprove = permissions?.canAdminApprove ?? false;
  const [formOpen, setFormOpen] = useState(false);
  const [detailTarget, setDetailTarget] = useState<DprRow | null>(null);
  const [editTarget, setEditTarget] = useState<DprDetail | null>(null);
  const [delTarget, setDelTarget] = useState<DprRow | null>(null);
  const [loadingEdit, setLoadingEdit] = useState(false);
  const [rejectTarget, setRejectTarget] = useState<DprRow | null>(null);
  const [rejectReason, setRejectReason] = useState("");
  const [approving, setApproving] = useState(false);

  function openCreate() {
    setEditTarget(null);
    setFormOpen(true);
  }

  async function openEdit(d: DprRow) {
    setLoadingEdit(true);
    try {
      const res = await fetch(`/api/dprs/${d.id}`);
      const data = await res.json();
      if (!res.ok) throw new Error(data.error ?? "Failed to load DPR");
      setEditTarget(data as DprDetail);
      setFormOpen(true);
    } catch (err: unknown) {
      toast.error(err instanceof Error ? err.message : "Failed to load DPR");
    } finally {
      setLoadingEdit(false);
    }
  }

  async function approvalAction(dprId: string, action: string, extra?: Record<string, unknown>) {
    setApproving(true);
    try {
      const res = await fetch(`/api/dprs/${dprId}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ action, ...extra }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error ?? "Failed");
      toast.success(action === "subAdminApprove" ? "Sub-Admin approved" : action === "adminApprove" ? "Admin approved" : action === "reject" ? "DPR rejected" : "DPR resubmitted");
      router.refresh();
    } catch (err: unknown) {
      toast.error(err instanceof Error ? err.message : "Failed");
    } finally {
      setApproving(false);
    }
  }

  async function confirmReject() {
    if (!rejectTarget) return;
    if (!rejectReason.trim()) return toast.error("Reason is required");
    await approvalAction(rejectTarget.id, "reject", { reason: rejectReason.trim() });
    setRejectTarget(null);
    setRejectReason("");
  }

  const dprColumns: Column<DprRow>[] = [
    {
      key: "date",
      label: "Date",
      sortable: true,
      sortValue: (d) => new Date(d.date),
      render: (d) => <span className="tnum text-muted-foreground">{formatDate(d.date)}</span>,
      exportValue: (d) => d.date,
    },
    {
      key: "projectName",
      label: "Project",
      sortable: true,
      filterable: true,
      render: (d) => <span className="text-body font-medium">{d.projectName}</span>,
      filterValue: (d) => d.projectName,
      exportValue: (d) => d.projectName,
    },
    {
      key: "approvalStatus",
      label: "Status",
      sortable: true,
      filterable: true,
      render: (d) => (
        <span className={cn("inline-flex items-center gap-1.5 rounded px-2 py-0.5 text-caption font-medium", APPROVAL_BADGE[d.approvalStatus])}>
          <span className={cn("h-1.5 w-1.5 rounded-full", d.approvalStatus === "SUBMITTED" ? "bg-warning" : d.approvalStatus === "SUB_ADMIN_APPROVED" ? "bg-info" : d.approvalStatus === "APPROVED" ? "bg-success" : "bg-danger")} />
          {APPROVAL_LABELS[d.approvalStatus]}
        </span>
      ),
      filterValue: (d) => APPROVAL_LABELS[d.approvalStatus],
      exportValue: (d) => d.approvalStatus,
    },
    {
      key: "workType",
      label: "Work Type",
      sortable: true,
      filterable: true,
      render: (d) => d.workType ? <Badge variant="outline" className="text-micro">{d.workType}</Badge> : <span className="text-muted-foreground">—</span>,
      filterValue: (d) => d.workType ?? "—",
      exportValue: (d) => d.workType ?? "",
    },
    {
      key: "submittedByName",
      label: "Submitted By",
      sortable: true,
      render: (d) => <span className="text-caption text-muted-foreground">{d.submittedByName ?? "—"}</span>,
      exportValue: (d) => d.submittedByName ?? "",
    },
    {
      key: "materialLineCount",
      label: "Materials",
      align: "right",
      sortable: true,
      render: (d) => <span className="tnum text-caption">{d.materialLineCount > 0 ? d.materialLineCount : "—"}</span>,
      exportValue: (d) => d.materialLineCount,
    },
    {
      key: "laborLineCount",
      label: "Labor",
      align: "right",
      sortable: true,
      render: (d) => <span className="tnum text-caption">{d.laborLineCount > 0 ? d.laborLineCount : "—"}</span>,
      exportValue: (d) => d.laborLineCount,
    },
    {
      key: "progressPct",
      label: "Progress",
      align: "right",
      sortable: true,
      render: (d) => (
        <div className="flex items-center justify-end gap-2">
          <div className="hidden h-1.5 w-16 overflow-hidden rounded-full bg-muted sm:block">
            <div className={cn("h-full rounded-full", d.progressPct >= 75 ? "bg-success" : d.progressPct >= 50 ? "bg-warning" : "bg-[var(--color-world-hr)]")} style={{ width: `${Math.min(d.progressPct, 100)}%` }} />
          </div>
          <span className="tnum text-body font-bold">{formatNumber(d.progressPct, 1)}%</span>
        </div>
      ),
      exportValue: (d) => d.progressPct,
    },
    {
      key: "totalProjectCost",
      label: "Project Cost",
      align: "right",
      sortable: true,
      render: (d) => {
        if (d.totalProjectCost == null) return <span className="text-muted-foreground">—</span>;
        const budget = d.projectBudget;
        const utilization = budget != null && budget > 0 ? (d.totalProjectCost / budget) * 100 : null;
        const tone = utilization == null ? "text-muted-foreground" : utilization >= 95 ? "text-danger" : utilization >= 80 ? "text-warning" : "text-success";
        return (
          <div className="flex flex-col items-end">
            <span className={`tnum text-caption font-medium ${tone}`}>{formatCurrencyCompact(d.totalProjectCost)}</span>
            {utilization != null && (
              <span className={`text-micro ${tone}`}>{formatNumber(utilization, 0)}% of budget</span>
            )}
            {d.costPerSqft != null && (
              <span className="text-micro text-muted-foreground">{formatCurrencyCompact(d.costPerSqft)}/sqft</span>
            )}
          </div>
        );
      },
      exportValue: (d) => d.totalProjectCost ?? "",
    },
  ];

  function dprRowActions(d: DprRow) {
    return (
      <>
        {canSubAdminApprove && d.approvalStatus === "SUBMITTED" && (
          <Button size="sm" variant="outline" disabled={approving} onClick={(e) => { e.stopPropagation(); approvalAction(d.id, "subAdminApprove"); }}>
            <ShieldCheck className="mr-1 h-3.5 w-3.5" /> Sub-Admin
          </Button>
        )}
        {canAdminApprove && d.approvalStatus === "SUB_ADMIN_APPROVED" && (
          <Button size="sm" disabled={approving} onClick={(e) => { e.stopPropagation(); approvalAction(d.id, "adminApprove"); }}>
            <CheckCircle2 className="mr-1 h-3.5 w-3.5" /> Approve
          </Button>
        )}
        {((canSubAdminApprove || canAdminApprove) && (d.approvalStatus === "SUBMITTED" || d.approvalStatus === "SUB_ADMIN_APPROVED")) && (
          <Button size="sm" variant="ghost" className="text-danger" onClick={(e) => { e.stopPropagation(); setRejectTarget(d); setRejectReason(""); }}>
            <XCircle className="mr-1 h-3.5 w-3.5" /> Reject
          </Button>
        )}
        {canSubmit && d.approvalStatus === "REJECTED" && (
          <Button size="sm" variant="outline" disabled={approving} onClick={(e) => { e.stopPropagation(); approvalAction(d.id, "resubmit"); }}>
            <RotateCw className="mr-1 h-3.5 w-3.5" /> Resubmit
          </Button>
        )}
        {canSubmit && d.approvalStatus !== "APPROVED" && (
          <>
            <Button size="sm" variant="outline" onClick={(e) => { e.stopPropagation(); openEdit(d); }} disabled={loadingEdit}>
              <Pencil className="mr-1 h-3.5 w-3.5" /> Edit
            </Button>
            <Button size="sm" variant="ghost" onClick={(e) => { e.stopPropagation(); setDelTarget(d); }}>
              <Trash2 className="mr-1 h-3.5 w-3.5" />
            </Button>
          </>
        )}
      </>
    );
  }

  const trailingButtons = canSubmit ? (
    <Button onClick={openCreate}>
      <Plus className="h-4 w-4" /> New DPR
    </Button>
  ) : null;

  const noMatch = (
    <EmptyState
      size="compact"
      icon={<SearchX />}
      title="No DPRs match"
      description="Adjust the search or column filters to see all DPRs."
    />
  );

  return (
    <div className="space-y-4">
      {/* Summary stats bar */}
      <DprStatsBar dprs={dprs} />

      {/* DPR list */}
      {dprs.length === 0 ? (
        <EmptyState
          icon={<ClipboardList className="h-5 w-5" />}
          title="No DPRs found"
          description={canSubmit ? "Submit your first Daily Progress Report." : "DPRs will appear here once submitted."}
          action={canSubmit ? (
            <Button size="sm" onClick={openCreate}>
              <Plus className="mr-1 h-3.5 w-3.5" /> Submit DPR
            </Button>
          ) : undefined}
        />
      ) : (
        <div className="overflow-hidden rounded-lg border border-border bg-card shadow-raised">
          <DataTable
            data={dprs}
            columns={dprColumns}
            storageKey="dprs"
            hideable
            exportFileName="dprs"
            initialSort={{ key: "date", direction: "desc" }}
            onRowClick={(d) => setDetailTarget(d)}
            searchable
            searchPlaceholder="Search project, submitter, work type…"
            toolbarTrailing={trailingButtons}
            rowActions={dprRowActions}
            rowTone={(d) => {
              if (d.approvalStatus === "REJECTED") return "danger";
              return null;
            }}
            pageSize={50}
            emptyState={noMatch}
          />
        </div>
      )}

      {/* Form dialog */}
      {formOpen && (
        <DprFormDialog
          projects={projects}
          materials={materials}
          employees={employees}
          workTypes={workTypes ?? []}
          editTarget={editTarget}
          onClose={() => { setFormOpen(false); setEditTarget(null); }}
          onSaved={() => { setFormOpen(false); setEditTarget(null); router.refresh(); }}
        />
      )}

      {/* Detail dialog */}
      {detailTarget && (
        <DprDetailDialog
          dpr={detailTarget}
          onClose={() => setDetailTarget(null)}
          canSubAdminApprove={canSubAdminApprove}
          canAdminApprove={canAdminApprove}
          approving={approving}
          onApprove={(action) => { approvalAction(detailTarget.id, action); setDetailTarget(null); }}
          onReject={() => { setRejectTarget(detailTarget); setDetailTarget(null); }}
        />
      )}

      {/* Delete confirm */}
      <DeleteConfirmDialog
        open={!!delTarget}
        onOpenChange={(o) => !o && setDelTarget(null)}
        endpoint={delTarget ? `/api/dprs/${delTarget.id}` : ""}
        title="Delete DPR"
        description={`Delete the Daily Progress Report for ${delTarget?.projectName ?? ""} on ${delTarget ? formatDate(delTarget.date) : ""}? This cannot be undone.`}
        successMessage="DPR deleted"
        errorMessage="Failed to delete DPR"
      />

      {/* Reject dialog */}
      {rejectTarget && (
        <Dialog
          open
          onOpenChange={(o) => !o && setRejectTarget(null)}
          title="Reject DPR"
          description={`${rejectTarget.projectName} — ${formatDate(rejectTarget.date)}`}
          className="max-w-md"
        >
          <div className="space-y-3">
            <div className="space-y-1.5">
              <Label>Reason *</Label>
              <Textarea
                value={rejectReason}
                onChange={(e) => setRejectReason(e.target.value)}
                rows={3}
                placeholder="Why is this DPR being rejected?"
              />
            </div>
            <div className="flex justify-end gap-2">
              <Button variant="outline" onClick={() => setRejectTarget(null)}>Cancel</Button>
              <Button variant="destructive" onClick={confirmReject} disabled={!rejectReason.trim() || approving}>
                Reject DPR
              </Button>
            </div>
          </div>
        </Dialog>
      )}
    </div>
  );
}

function DprFormDialog({
  projects,
  materials,
  employees,
  workTypes,
  editTarget,
  onClose,
  onSaved,
}: {
  projects: { id: string; name: string }[];
  materials: { id: string; name: string; unit: string; standardCost: number }[];
  employees: { id: string; name: string }[];
  workTypes: string[];
  editTarget: DprDetail | null;
  onClose: () => void;
  onSaved: () => void;
}) {
  const today = new Date().toISOString().split("T")[0];
  const [saving, setSaving] = useState(false);
  const [form, setForm] = useState({
    projectId: editTarget?.projectId ?? "",
    date: editTarget ? editTarget.date.slice(0, 10) : today,
    weather: editTarget?.weather ?? "",
    workSummary: editTarget?.workSummary ?? "",
    workType: editTarget?.workType ?? "",
    workQty: editTarget?.workQty != null ? String(editTarget.workQty) : "",
    workUnit: editTarget?.workUnit ?? "",
    progressPct: editTarget ? String(editTarget.progressPct) : "",
    blockers: editTarget?.blockers ?? "",
    tomorrowPlan: editTarget?.tomorrowPlan ?? "",
    notes: editTarget?.notes ?? "",
  });
  const [materialLines, setMaterialLines] = useState<Array<{ materialId: string; qty: string; unitCost: string }>>(
    editTarget?.materialLines?.map((l) => ({ materialId: l.materialId, qty: String(l.qty), unitCost: String(l.unitCost) })) ?? []
  );
  const [laborLines, setLaborLines] = useState<Array<{ employeeId: string; crewId: string; hoursWorked: string; taskDescription: string }>>(
    editTarget?.laborLines?.map((l) => ({ employeeId: l.employeeId ?? "", crewId: l.crewId ?? "", hoursWorked: String(l.hoursWorked), taskDescription: l.taskDescription })) ?? []
  );
  // Local copies so freshly created masters appear in their dropdowns without
  // waiting for router.refresh.
  const [localProjects, setLocalProjects] = useState(projects);
  const [localEmployees, setLocalEmployees] = useState(employees);
  useEffect(() => { setLocalProjects(projects); }, [projects]);
  useEffect(() => { setLocalEmployees(employees); }, [employees]);

  const set = (k: keyof typeof form, v: string) => setForm((f) => ({ ...f, [k]: v }));

  const addMaterialLine = () => setMaterialLines((l) => [...l, { materialId: "", qty: "", unitCost: "" }]);
  const addLaborLine = () => setLaborLines((l) => [...l, { employeeId: "", crewId: "", hoursWorked: "", taskDescription: "" }]);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!form.projectId || !form.workSummary.trim()) {
      toast.error("Project and work summary are required");
      return;
    }
    setSaving(true);
    try {
      const payload = {
        projectId: form.projectId,
        date: form.date,
        weather: form.weather || null,
        workSummary: form.workSummary,
        workType: form.workType || null,
        workQty: form.workQty ? parseFloat(form.workQty) : null,
        workUnit: form.workUnit || null,
        progressPct: form.progressPct ? parseFloat(form.progressPct) : null,
        blockers: form.blockers || null,
        tomorrowPlan: form.tomorrowPlan || null,
        notes: form.notes || null,
        materialLines: materialLines
          .filter((l) => l.materialId && l.qty)
          .map((l) => ({ materialId: l.materialId, qty: parseFloat(l.qty), unitCost: parseFloat(l.unitCost) || 0 })),
        laborLines: laborLines
          .filter((l) => (l.employeeId || l.crewId) && l.hoursWorked && l.taskDescription)
          .map((l) => ({
            employeeId: l.employeeId || null,
            crewId: l.crewId || null,
            hoursWorked: parseFloat(l.hoursWorked),
            taskDescription: l.taskDescription,
          })),
      };
      const res = editTarget
        ? await fetch(`/api/dprs/${editTarget.id}`, {
            method: "PATCH",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify(payload),
          })
        : await fetch("/api/dprs", {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify(payload),
          });
      if (res.ok) {
        toast.success(editTarget ? "DPR updated" : "DPR submitted");
        onSaved();
      } else {
        const data = await res.json().catch(() => ({}));
        toast.error(data.error ?? "Failed to save DPR");
      }
    } finally {
      setSaving(false);
    }
  };

  return (
    <Dialog
      open
      onOpenChange={(o) => !o && onClose()}
      title={editTarget ? "Edit Daily Progress Report" : "New Daily Progress Report"}
      className="max-h-[85vh] max-w-2xl overflow-y-auto"
    >
      <form onSubmit={handleSubmit} className="space-y-3">
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
            <div>
              <Label>Project *</Label>
              <SelectWithCreate
                value={form.projectId}
                onChange={(v) => set("projectId", v)}
                placeholder="Select project…"
                createLabel="project"
                required
                options={localProjects.map((p) => ({ value: p.id, label: p.name }))}
                renderCreateDialog={({ open: o, onCreated, onClose }) => (
                  <ProjectFormDialog open={o} onOpenChange={onClose} onCreated={(e) => { setLocalProjects((p) => [...p, { id: e.id, name: e.label ?? "" }]); onCreated(e); }} />
                )}
              />
            </div>
            <div>
              <Label>Date *</Label>
              <Input type="date" value={form.date} onChange={(e) => set("date", e.target.value)} required />
            </div>
            <div>
              <Label>Weather</Label>
              <Input value={form.weather} onChange={(e) => set("weather", e.target.value)} placeholder="Sunny, 32°C" />
            </div>
            <div>
              <Label>Work Type</Label>
              <Input value={form.workType} onChange={(e) => set("workType", e.target.value)} placeholder="e.g. Foundation, Slab, Brickwork" list="work-types" />
              <datalist id="work-types">
                {workTypes.map((w) => <option key={w} value={w} />)}
              </datalist>
            </div>
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
              <div>
                <Label>Work Qty</Label>
                <Input type="number" step="0.001" min="0" value={form.workQty} onChange={(e) => set("workQty", e.target.value)} placeholder="e.g. 500" />
              </div>
              <div>
                <Label>Work Unit</Label>
                <Input value={form.workUnit} onChange={(e) => set("workUnit", e.target.value)} placeholder="e.g. sqft" list="work-units" />
                <datalist id="work-units">
                  <option value="sqft" />
                  <option value="sqm" />
                  <option value="cubic meter" />
                  <option value="running ft" />
                  <option value="unit" />
                </datalist>
              </div>
            </div>
            <div>
              <Label>Progress %</Label>
              <Input type="number" min="0" max="100" step="0.1" value={form.progressPct} onChange={(e) => set("progressPct", e.target.value)} />
            </div>
          </div>
          <div>
            <Label>Work Summary *</Label>
            <Textarea value={form.workSummary} onChange={(e) => set("workSummary", e.target.value)} rows={3} placeholder="What work was done today?" required />
          </div>
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
            <div>
              <Label>Blockers</Label>
              <Textarea value={form.blockers} onChange={(e) => set("blockers", e.target.value)} rows={2} placeholder="Any issues or delays?" />
            </div>
            <div>
              <Label>Tomorrow&apos;s Plan</Label>
              <Textarea value={form.tomorrowPlan} onChange={(e) => set("tomorrowPlan", e.target.value)} rows={2} placeholder="Planned work for tomorrow" />
            </div>
          </div>

          {/* Material lines */}
          <div>
            <div className="mb-1.5 flex items-center justify-between">
              <Label>Materials Consumed</Label>
              <Button type="button" variant="outline" size="sm" onClick={addMaterialLine}>
                <Plus className="mr-1 h-3 w-3" /> Add
              </Button>
            </div>
            {materialLines.map((line, i) => (
              <div key={i} className="mb-1.5 flex gap-1.5">
                <Select
                  value={line.materialId}
                  onChange={(e) => setMaterialLines((l) => l.map((x, j) => j === i ? { ...x, materialId: e.target.value, unitCost: materials.find((m) => m.id === e.target.value)?.standardCost.toString() ?? x.unitCost } : x))}
                  className="flex-1"
                >
                  <option value="">Material…</option>
                  {materials.map((m) => <option key={m.id} value={m.id}>{m.name} ({m.unit})</option>)}
                </Select>
                <Input type="number" step="0.001" min="0" placeholder="Qty" value={line.qty} onChange={(e) => setMaterialLines((l) => l.map((x, j) => j === i ? { ...x, qty: e.target.value } : x))} className="w-20" />
                <Input type="number" step="0.01" min="0" placeholder="Cost" value={line.unitCost} onChange={(e) => setMaterialLines((l) => l.map((x, j) => j === i ? { ...x, unitCost: e.target.value } : x))} className="w-20" />
                <button type="button" onClick={() => setMaterialLines((l) => l.filter((_, j) => j !== i))} className="rounded p-1 text-muted-foreground hover:text-danger">×</button>
              </div>
            ))}
          </div>

          {/* Labor lines */}
          <div>
            <div className="mb-1.5 flex items-center justify-between">
              <Label>Labour Utilised</Label>
              <Button type="button" variant="outline" size="sm" onClick={addLaborLine}>
                <Plus className="mr-1 h-3 w-3" /> Add
              </Button>
            </div>
            {laborLines.map((line, i) => (
              <div key={i} className="mb-1.5 flex gap-1.5">
                <SelectWithCreate
                  value={line.employeeId}
                  onChange={(v) => setLaborLines((l) => l.map((x, j) => j === i ? { ...x, employeeId: v } : x))}
                  placeholder="Employee…"
                  createLabel="employee"
                  className="flex-1"
                  options={localEmployees.map((e) => ({ value: e.id, label: e.name }))}
                  renderCreateDialog={({ open: o, onCreated, onClose }) => (
                    <EmployeeQuickCreateDialog open={o} onOpenChange={onClose} onCreated={(e) => { setLocalEmployees((p) => [...p, { id: e.id, name: e.label ?? "" }]); onCreated(e); }} />
                  )}
                />
                <Input type="number" step="0.5" min="0" placeholder="Hrs" value={line.hoursWorked} onChange={(e) => setLaborLines((l) => l.map((x, j) => j === i ? { ...x, hoursWorked: e.target.value } : x))} className="w-16" />
                <Input placeholder="Task description" value={line.taskDescription} onChange={(e) => setLaborLines((l) => l.map((x, j) => j === i ? { ...x, taskDescription: e.target.value } : x))} className="flex-1" />
                <button type="button" onClick={() => setLaborLines((l) => l.filter((_, j) => j !== i))} className="rounded p-1 text-muted-foreground hover:text-danger">×</button>
              </div>
            ))}
          </div>

          <div className="flex justify-end gap-2 pt-2">
            <Button type="button" variant="outline" onClick={onClose}>Cancel</Button>
            <Button type="submit" disabled={saving}>{saving ? "Saving…" : editTarget ? "Save changes" : "Submit DPR"}</Button>
          </div>
        </form>
    </Dialog>
  );
}

function DprDetailDialog({
  dpr,
  onClose,
  canSubAdminApprove,
  canAdminApprove,
  approving,
  onApprove,
  onReject,
}: {
  dpr: DprRow;
  onClose: () => void;
  canSubAdminApprove: boolean;
  canAdminApprove: boolean;
  approving: boolean;
  onApprove: (action: string) => void;
  onReject: () => void;
}) {
  const [detail, setDetail] = useState<DprDetail | null>(null);
  const [loading, setLoading] = useState(true);
  const [runningVariance, setRunningVariance] = useState(false);
  const [scrapDialogOpen, setScrapDialogOpen] = useState(false);
  const [locations, setLocations] = useState<{ id: string; name: string; type: string }[]>([]);
  const [scrapLocationId, setScrapLocationId] = useState("");
  const [scrapValuationPct, setScrapValuationPct] = useState("50");
  const [generatingScrap, setGeneratingScrap] = useState(false);

  async function loadDetail() {
    const res = await fetch(`/api/dprs/${dpr.id}`);
    const data = await res.json();
    if (!res.ok || data.error) { setLoading(false); return; }
    setDetail(data);
    setLoading(false);
  }

  useEffect(() => {
    loadDetail().catch(() => { setLoading(false); toast.error("Failed to load DPR details"); });
  }, [dpr.id]);

  async function runVariance(autoGenerate = false) {
    if (autoGenerate) {
      // Fetch stock locations for scrap destination
      try {
        const locRes = await fetch("/api/stock-locations");
        const locData = await locRes.json();
        if (locRes.ok && !locData.error) {
          setLocations(locData.map((l: { id: string; name: string; type: string }) => ({ id: l.id, name: l.name, type: l.type })));
          setScrapDialogOpen(true);
        }
      } catch {
        toast.error("Failed to load stock locations");
      }
      return;
    }
    setRunningVariance(true);
    try {
      const res = await fetch(`/api/dprs/${dpr.id}/variance`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ autoGenerateScrap: false }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error ?? "Failed to run variance analysis");
      toast.success("Variance analysis updated");
      await loadDetail();
    } catch (err: unknown) {
      toast.error(err instanceof Error ? err.message : "Failed");
    } finally {
      setRunningVariance(false);
    }
  }

  async function confirmGenerateScrap() {
    if (!scrapLocationId) return toast.error("Select a scrap destination location");
    setGeneratingScrap(true);
    try {
      const res = await fetch(`/api/dprs/${dpr.id}/variance`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ autoGenerateScrap: true, scrapToLocationId: scrapLocationId, scrapValuationPct: Number(scrapValuationPct) }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error ?? "Failed to generate scrap");
      toast.success(data.scrapGenerationId ? "Scrap generated from over-consumption" : "No over-consumption to scrap");
      setScrapDialogOpen(false);
      await loadDetail();
    } catch (err: unknown) {
      toast.error(err instanceof Error ? err.message : "Failed");
    } finally {
      setGeneratingScrap(false);
    }
  }

  const hasOverConsumption = detail?.varianceAnalysis?.some((v) => v.isOverConsumption) ?? false;
  const hasWorkType = !!detail?.workType;
  const hasMaterialLines = (detail?.materialLines?.length ?? 0) > 0;
  const canRunVariance = hasWorkType && hasMaterialLines;

  return (
    <Dialog
      open
      onOpenChange={(o) => !o && onClose()}
      title={`${dpr.projectName} — ${formatDate(dpr.date)}`}
      className="max-h-[85vh] max-w-2xl overflow-y-auto"
    >
        {loading ? (
          <div className="py-8 text-center text-meta text-muted-foreground">Loading…</div>
        ) : detail ? (
          <div className="space-y-4">
            <div className="flex flex-wrap gap-3">
              {detail.weather && <Badge variant="outline"><Cloud className="h-3 w-3" /> {detail.weather}</Badge>}
              {detail.workType && <Badge variant="brand">{detail.workType}</Badge>}
              {detail.workQty != null && detail.workUnit && (
                <Badge variant="outline">{formatNumber(detail.workQty, 3)} {detail.workUnit} of work</Badge>
              )}
              <Badge variant="default">{formatNumber(detail.progressPct, 1)}% progress</Badge>
              {detail.autoScrapGenerationId && (
                <Badge variant="muted" className="text-warning">Scrap generated</Badge>
              )}
            </div>

            {/* ── Project cost context for approvers ── */}
            {detail.totalProjectCost != null && (
              <div className="rounded-lg border border-border bg-muted/30 p-3">
                <div className="mb-2 flex items-center gap-1.5 text-caption font-semibold text-muted-foreground">
                  <Wallet className="h-3.5 w-3.5" /> Project Cost Context
                </div>
                <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
                  <div>
                    <div className="text-micro text-muted-foreground">Total Cost</div>
                    <div className="tnum text-body font-semibold">{formatCurrency(detail.totalProjectCost)}</div>
                  </div>
                  {detail.projectBudget != null && detail.projectBudget > 0 ? (
                    <div>
                      <div className="text-micro text-muted-foreground">Budget</div>
                      <div className="tnum text-body font-semibold">{formatCurrency(detail.projectBudget)}</div>
                      <div className={`text-micro font-medium ${detail.totalProjectCost / detail.projectBudget >= 0.95 ? "text-danger" : detail.totalProjectCost / detail.projectBudget >= 0.8 ? "text-warning" : "text-success"}`}>
                        {formatNumber((detail.totalProjectCost / detail.projectBudget) * 100, 0)}% used
                      </div>
                    </div>
                  ) : detail.projectBudget != null ? (
                    <div>
                      <div className="text-micro text-muted-foreground">Budget</div>
                      <div className="tnum text-body font-semibold">{formatCurrency(detail.projectBudget)}</div>
                      <div className="text-micro text-muted-foreground">No utilization (zero budget)</div>
                    </div>
                  ) : null}
                  {detail.costPerSqft != null && (
                    <div>
                      <div className="text-micro text-muted-foreground">Cost / sqft</div>
                      <div className="tnum text-body font-semibold">{formatCurrency(detail.costPerSqft)}</div>
                    </div>
                  )}
                  {detail.totalSellableArea != null && (
                    <div>
                      <div className="text-micro text-muted-foreground">Sellable Area</div>
                      <div className="tnum text-body font-semibold">{formatNumber(detail.totalSellableArea, 0)} sqft</div>
                    </div>
                  )}
                </div>
              </div>
            )}

            {/* ── DPR Cost Preview (for approvers) ── */}
            {((canSubAdminApprove && dpr.approvalStatus === "SUBMITTED") ||
              (canAdminApprove && dpr.approvalStatus === "SUB_ADMIN_APPROVED")) && (
              <div className="rounded-lg border border-brand/20 bg-brand/5 p-3">
                <div className="mb-2 flex items-center gap-1.5 text-caption font-semibold text-muted-foreground">
                  <Wallet className="h-3.5 w-3.5" /> DPR Cost Preview
                </div>
                <div className="grid grid-cols-2 gap-3 sm:grid-cols-3">
                  <div>
                    <div className="text-micro text-muted-foreground">Material Cost</div>
                    <div className="tnum text-body font-semibold">
                      {formatCurrency(
                        (detail.materialLines ?? []).reduce((s, l) => s + l.qty * l.unitCost, 0),
                      )}
                    </div>
                    <div className="text-micro text-muted-foreground">
                      {(detail.materialLines ?? []).length} line(s)
                    </div>
                  </div>
                  <div>
                    <div className="text-micro text-muted-foreground">Labor Hours</div>
                    <div className="tnum text-body font-semibold">
                      {formatNumber(
                        (detail.laborLines ?? []).reduce((s, l) => s + l.hoursWorked, 0),
                        1,
                      )} hrs
                    </div>
                    <div className="text-micro text-muted-foreground">
                      {(detail.laborLines ?? []).length} line(s)
                    </div>
                  </div>
                  <div>
                    <div className="text-micro text-muted-foreground">Est. Labor Cost*</div>
                    <div className="tnum text-body font-semibold">
                      {formatCurrency(
                        (detail.laborLines ?? []).reduce((s, l) => s + l.hoursWorked, 0) * 250,
                      )}
                    </div>
                    <div className="text-micro text-muted-foreground">*₹250/hr estimate</div>
                  </div>
                </div>
                <p className="mt-2 text-micro text-muted-foreground">
                  Material cost will be posted to WIP via MaterialIssue on admin approval. Labor cost is informational only.
                </p>
              </div>
            )}

            {/* ── Approval actions (visible alongside cost context) ── */}
            {((canSubAdminApprove && dpr.approvalStatus === "SUBMITTED") ||
              (canAdminApprove && dpr.approvalStatus === "SUB_ADMIN_APPROVED")) && (
              <div className="flex items-center gap-2 rounded-lg border border-brand/30 bg-brand/5 p-3">
                <span className="text-caption font-medium text-muted-foreground">Approve this DPR:</span>
                {canSubAdminApprove && dpr.approvalStatus === "SUBMITTED" && (
                  <Button size="sm" variant="outline" disabled={approving} onClick={() => onApprove("subAdminApprove")}>
                    <ShieldCheck className="mr-1 h-3.5 w-3.5" /> Sub-Admin Approve
                  </Button>
                )}
                {canAdminApprove && dpr.approvalStatus === "SUB_ADMIN_APPROVED" && (
                  <Button size="sm" disabled={approving} onClick={() => onApprove("adminApprove")}>
                    <CheckCircle2 className="mr-1 h-3.5 w-3.5" /> Admin Approve
                  </Button>
                )}
                <Button size="sm" variant="ghost" className="text-danger" onClick={onReject}>
                  <XCircle className="mr-1 h-3.5 w-3.5" /> Reject
                </Button>
              </div>
            )}
            <div>
              <Label>Work Summary</Label>
              <p className="mt-1 text-body">{detail.workSummary}</p>
            </div>
            {detail.blockers && (
              <div>
                <Label className="text-warning">Blockers</Label>
                <p className="mt-1 text-body">{detail.blockers}</p>
              </div>
            )}
            {detail.tomorrowPlan && (
              <div>
                <Label>Tomorrow&apos;s Plan</Label>
                <p className="mt-1 text-body">{detail.tomorrowPlan}</p>
              </div>
            )}
            {(detail.materialLines?.length ?? 0) > 0 && (
              <div>
                <Label>Materials Consumed</Label>
                <Table>
                  <THead>
                    <TR><TH>Material</TH><TH>Qty</TH><TH>Unit Cost</TH><TH>Total</TH></TR>
                  </THead>
                  <TBody>
                    {detail.materialLines!.map((l) => (
                      <TR key={l.id}>
                        <TD>{l.materialName}</TD>
                        <TD className="tnum">{l.qty} {l.unit}</TD>
                        <TD className="tnum">{formatCurrencyDetailed(l.unitCost)}</TD>
                        <TD className="tnum font-medium">{formatCurrencyDetailed(l.qty * l.unitCost)}</TD>
                      </TR>
                    ))}
                  </TBody>
                </Table>
              </div>
            )}
            {(detail.laborLines?.length ?? 0) > 0 && (
              <div>
                <Label>Labour Utilised</Label>
                <Table>
                  <THead>
                    <TR><TH>Worker/Crew</TH><TH>Hours</TH><TH>Task</TH></TR>
                  </THead>
                  <TBody>
                    {detail.laborLines!.map((l) => (
                      <TR key={l.id}>
                        <TD>{l.employeeName ?? l.crewName ?? "—"}</TD>
                        <TD className="tnum">{l.hoursWorked}h</TD>
                        <TD>{l.taskDescription}</TD>
                      </TR>
                    ))}
                  </TBody>
                </Table>
              </div>
            )}
            {/* Variance Analysis (auto-scrap detection) */}
            {detail.varianceAnalysis && detail.varianceAnalysis.length > 0 ? (
              <div className="rounded-lg border border-border bg-muted/20 p-3">
                <div className="flex items-center justify-between gap-2">
                  <div className="flex items-center gap-2">
                    <Ruler className="h-4 w-4 text-muted-foreground" />
                    <Label>Consumption Variance Analysis</Label>
                  </div>
                  <div className="flex gap-1">
                    <Button size="sm" variant="outline" disabled={runningVariance} onClick={() => runVariance(false)}>
                      {runningVariance ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <RefreshCw className="h-3.5 w-3.5" />}
                      Re-run
                    </Button>
                    {hasOverConsumption && !detail.autoScrapGenerationId && (
                      <Button size="sm" variant="outline" className="text-warning" onClick={() => runVariance(true)}>
                        <Recycle className="mr-1 h-3.5 w-3.5" /> Generate Scrap
                      </Button>
                    )}
                  </div>
                </div>
                <p className="mt-1 text-caption text-muted-foreground">
                  Actual vs standard consumption for <strong>{detail.workType}</strong>
                  {detail.workQty != null && detail.workUnit && <> ({formatNumber(detail.workQty, 3)} {detail.workUnit} of work)</>}. Over-consumption deltas are potential scrap.
                </p>
                <Table className="mt-2">
                  <THead>
                    <TR><TH>Material</TH><TH>Actual</TH><TH>Standard</TH><TH>Variance</TH><TH>%</TH></TR>
                  </THead>
                  <TBody>
                    {detail.varianceAnalysis.map((v, i) => (
                      <TR key={i}>
                        <TD>{v.materialName} <span className="font-mono text-micro text-muted-foreground">{v.materialCode}</span></TD>
                        <TD className="tnum">{v.actualQty} {v.unit}</TD>
                        <TD className="tnum">{v.standardQty} {v.unit}</TD>
                        <TD className={`tnum font-medium ${v.isOverConsumption ? "text-warning" : "text-success"}`}>
                          {v.variance > 0 ? "+" : ""}{v.variance} {v.unit}
                        </TD>
                        <TD className={`tnum ${v.isOverConsumption ? "text-warning" : "text-success"}`}>
                          {v.variancePct > 0 ? "+" : ""}{v.variancePct.toFixed(1)}%
                        </TD>
                      </TR>
                    ))}
                  </TBody>
                </Table>
                {detail.autoScrapGenerationId && (
                  <div className="mt-2 flex items-center gap-1.5 text-caption text-success">
                    <CheckCircle2 className="h-3.5 w-3.5" />
                    Scrap generation record created — over-consumption deltas stocked as scrap.
                  </div>
                )}
              </div>
            ) : canRunVariance ? (
              <div className="rounded-lg border border-dashed border-border p-3 text-center">
                <Ruler className="mx-auto h-5 w-5 text-muted-foreground" />
                <p className="mt-1 text-caption text-muted-foreground">
                  No variance analysis yet. Run analysis to compare actual consumption against benchmarks.
                </p>
                <Button size="sm" variant="outline" className="mt-2" disabled={runningVariance} onClick={() => runVariance(false)}>
                  {runningVariance ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Ruler className="h-3.5 w-3.5" />}
                  Run Variance Analysis
                </Button>
              </div>
            ) : hasWorkType ? (
              <div className="rounded-lg border border-dashed border-border p-3 text-center text-caption text-muted-foreground">
                Add material lines to this DPR to run variance analysis.
              </div>
            ) : null}
          </div>
        ) : (
          <div className="py-8 text-center text-meta text-muted-foreground">Failed to load DPR</div>
        )}

        {/* Scrap generation dialog */}
        {scrapDialogOpen && (
          <Dialog
            open
            onOpenChange={(o) => !o && setScrapDialogOpen(false)}
            title="Generate Scrap from Over-consumption"
            description="Select the stock location where the auto-detected scrap should be stocked."
            className="max-w-md"
          >
            <div className="space-y-3">
              <div className="space-y-1.5">
                <Label>Scrap Destination *</Label>
                <Select value={scrapLocationId} onChange={(e) => setScrapLocationId(e.target.value)}>
                  <option value="">Select location…</option>
                  {locations.map((l) => <option key={l.id} value={l.id}>{l.name} ({l.type})</option>)}
                </Select>
              </div>
              <div className="space-y-1.5">
                <Label>Scrap Valuation (% of issue cost)</Label>
                <Input
                  type="number"
                  min="0"
                  max="100"
                  step="5"
                  value={scrapValuationPct}
                  onChange={(e) => setScrapValuationPct(e.target.value)}
                  placeholder="50"
                />
                <p className="text-caption text-muted-foreground">
                  Over-consumption deltas will be stocked as scrap at {scrapValuationPct || 0}% of the issue cost. The scrap will appear in the Scrap Generations page.
                </p>
              </div>
              <div className="flex justify-end gap-2">
                <Button variant="outline" onClick={() => setScrapDialogOpen(false)} disabled={generatingScrap}>Cancel</Button>
                <Button onClick={confirmGenerateScrap} disabled={generatingScrap || !scrapLocationId}>
                  {generatingScrap ? <Loader2 className="h-4 w-4 animate-spin" /> : <Recycle className="mr-1 h-4 w-4" />}
                  Generate Scrap
                </Button>
              </div>
            </div>
          </Dialog>
        )}
    </Dialog>
  );
}

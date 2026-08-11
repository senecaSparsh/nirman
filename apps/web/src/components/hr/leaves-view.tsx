"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { CalendarPlus, Check, X, Ban, Calendar, AlertCircle, SearchX } from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Input, Select, Label, Textarea } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import { DataTable, type Column } from "@/components/ui/data-table";
import { DateCell } from "@/components/ui/cells";
import { Dialog } from "@/components/ui/dialog";
import { EmptyState } from "@/components/empty-state";
import { formatDate, cn } from "@/lib/utils";

export type LeaveRow = {
  id: string;
  employeeId: string;
  employeeName: string;
  employeeTrade: string | null;
  employeeDesignation: string | null;
  type: string;
  startDate: string;
  endDate: string;
  days: number;
  reason: string | null;
  status: string;
  approvedByName: string | null;
  approvedAt: string | null;
  rejectedReason: string | null;
  createdAt: string;
};

const TYPE_LABELS: Record<string, string> = {
  CASUAL: "Casual",
  SICK: "Sick",
  EARNED: "Earned",
  UNPAID: "Unpaid",
  MATERNITY: "Maternity",
  PATERNITY: "Paternity",
};

const TYPE_COLORS: Record<string, string> = {
  CASUAL: "bg-info/10 text-info",
  SICK: "bg-danger/10 text-danger",
  EARNED: "bg-success/10 text-success",
  UNPAID: "bg-muted text-muted-foreground",
  MATERNITY: "bg-brand/10 text-brand",
  PATERNITY: "bg-brand/10 text-brand",
};

const STATUS_CONFIG: Record<string, { label: string; class: string; dotClass: string }> = {
  PENDING: { label: "Pending", class: "bg-warning/10 text-warning", dotClass: "bg-warning" },
  APPROVED: { label: "Approved", class: "bg-success/10 text-success", dotClass: "bg-success" },
  REJECTED: { label: "Rejected", class: "bg-danger/10 text-danger", dotClass: "bg-danger" },
  CANCELLED: { label: "Cancelled", class: "bg-muted text-muted-foreground", dotClass: "bg-muted-foreground" },
};

const AVATAR_COLORS = [
  "bg-[var(--color-world-hr)]/15 text-[var(--color-world-hr)]",
  "bg-success/15 text-success",
  "bg-info/15 text-info",
  "bg-warning/15 text-warning",
  "bg-brand/15 text-brand",
  "bg-primary/10 text-primary",
];

function avatarColor(name: string): string {
  let hash = 0;
  for (let i = 0; i < name.length; i++) hash = name.charCodeAt(i) + ((hash << 5) - hash);
  return AVATAR_COLORS[Math.abs(hash) % AVATAR_COLORS.length] ?? AVATAR_COLORS[0]!;
}

function initials(name: string): string {
  const parts = name.trim().split(/\s+/);
  if (parts.length >= 2) return ((parts[0]?.[0] ?? "") + (parts[parts.length - 1]?.[0] ?? "")).toUpperCase();
  return name.slice(0, 2).toUpperCase();
}

/** Leave summary stats bar. */
function LeaveStatsBar({ leaves }: { leaves: LeaveRow[] }) {
  const total = leaves.length;
  const pending = leaves.filter((l) => l.status === "PENDING").length;
  const approved = leaves.filter((l) => l.status === "APPROVED").length;
  const rejected = leaves.filter((l) => l.status === "REJECTED").length;
  const totalDays = leaves.filter((l) => l.status === "APPROVED").reduce((sum, l) => sum + l.days, 0);

  return (
    <div className="grid grid-cols-2 divide-border overflow-hidden rounded-lg border border-border bg-card sm:grid-cols-4 sm:divide-x divide-y sm:divide-y-0">
      <div className="flex flex-col gap-0.5 p-3">
        <span className="text-label text-muted-foreground/75">Total Requests</span>
        <span className="text-figure text-foreground">{total}</span>
      </div>
      <div className="flex flex-col gap-0.5 p-3">
        <span className="text-label text-muted-foreground/75">Pending</span>
        <span className="text-figure text-warning">{pending}</span>
        <span className="text-micro text-muted-foreground">awaiting action</span>
      </div>
      <div className="flex flex-col gap-0.5 p-3">
        <span className="text-label text-muted-foreground/75">Approved</span>
        <span className="text-figure text-success">{approved}</span>
        <span className="text-micro text-muted-foreground">{rejected} rejected</span>
      </div>
      <div className="flex flex-col gap-0.5 p-3">
        <span className="text-label text-muted-foreground/75">Days Off Granted</span>
        <span className="text-figure text-foreground">{totalDays}</span>
        <span className="text-micro text-muted-foreground">approved leave days</span>
      </div>
    </div>
  );
}

export function LeavesView({
  leaves,
  employees,
  permissions,
}: {
  leaves: LeaveRow[];
  employees: { id: string; name: string; trade: string | null; designation: string | null }[];
  permissions?: { canManage?: boolean };
}) {
  const router = useRouter();
  const canManage = permissions?.canManage ?? false;
  const [formOpen, setFormOpen] = useState(false);
  const [detailTarget, setDetailTarget] = useState<LeaveRow | null>(null);
  const [rejectTarget, setRejectTarget] = useState<LeaveRow | null>(null);
  const [rejectReason, setRejectReason] = useState("");
  const [submitting, setSubmitting] = useState(false);

  // Form state
  const [fEmployee, setFEmployee] = useState("");
  const [fType, setFType] = useState("CASUAL");
  const [fStart, setFStart] = useState("");
  const [fEnd, setFEnd] = useState("");
  const [fReason, setFReason] = useState("");

  const pendingCount = leaves.filter((l) => l.status === "PENDING").length;

  const leaveColumns: Column<LeaveRow>[] = [
    {
      key: "employeeName",
      label: "Employee",
      sortable: true,
      filterable: true,
      width: "200px",
      sortValue: (l) => l.employeeName,
      render: (l) => (
        <div className="flex items-center gap-2.5">
          <span className={cn("flex h-7 w-7 shrink-0 items-center justify-center rounded-md text-caption font-semibold", avatarColor(l.employeeName))}>
            {initials(l.employeeName)}
          </span>
          <div className="min-w-0">
            <div className="font-medium text-foreground">{l.employeeName}</div>
            {l.employeeTrade && <div className="text-caption text-muted-foreground">{l.employeeTrade}</div>}
          </div>
        </div>
      ),
      filterValue: (l) => l.employeeName,
      exportValue: (l) => l.employeeName,
    },
    {
      key: "type",
      label: "Type",
      sortable: true,
      filterable: true,
      render: (l) => {
        const typeColor = TYPE_COLORS[l.type] ?? "bg-muted text-muted-foreground";
        return <span className={cn("rounded px-1.5 py-0.5 text-micro font-medium", typeColor)}>{TYPE_LABELS[l.type] ?? l.type}</span>;
      },
      filterValue: (l) => TYPE_LABELS[l.type] ?? l.type,
      exportValue: (l) => l.type,
    },
    {
      key: "startDate",
      label: "Start",
      sortable: true,
      sortValue: (l) => new Date(l.startDate),
      render: (l) => <DateCell date={l.startDate} formatted={formatDate(l.startDate)} />,
      exportValue: (l) => l.startDate,
    },
    {
      key: "endDate",
      label: "End",
      sortable: true,
      sortValue: (l) => new Date(l.endDate),
      render: (l) => <DateCell date={l.endDate} formatted={formatDate(l.endDate)} />,
      exportValue: (l) => l.endDate,
    },
    {
      key: "days",
      label: "Days",
      align: "right",
      sortable: true,
      render: (l) => <span className="tnum text-body">{l.days}</span>,
      exportValue: (l) => l.days,
    },
    {
      key: "status",
      label: "Status",
      sortable: true,
      filterable: true,
      sortValue: (l) => l.status,
      render: (l) => {
        const cfg = STATUS_CONFIG[l.status] ?? STATUS_CONFIG.PENDING!;
        const isPast = new Date(l.endDate) < new Date() && l.status === "PENDING";
        return (
          <span className="inline-flex items-center gap-1.5">
            <span className={cn("inline-flex items-center gap-1.5 rounded px-2 py-0.5 text-caption font-medium", cfg.class)}>
              <span className={cn("h-1.5 w-1.5 rounded-full", cfg.dotClass)} />
              {cfg.label}
            </span>
            {isPast && <AlertCircle className="h-3 w-3 text-danger" />}
          </span>
        );
      },
      filterValue: (l) => STATUS_CONFIG[l.status]?.label ?? l.status,
      exportValue: (l) => l.status,
    },
  ];

  function leaveRowActions(l: LeaveRow) {
    if (!canManage || l.status !== "PENDING") return null;
    return (
      <>
        <Button size="sm" onClick={(e) => { e.stopPropagation(); actOnLeave(l, true); }} disabled={submitting}>
          <Check className="mr-1 h-3.5 w-3.5" /> Approve
        </Button>
        <Button size="sm" variant="outline" onClick={(e) => { e.stopPropagation(); setRejectTarget(l); setRejectReason(""); }} disabled={submitting}>
          <X className="mr-1 h-3.5 w-3.5" /> Reject
        </Button>
        <Button size="sm" variant="ghost" onClick={(e) => { e.stopPropagation(); cancelLeave(l); }} disabled={submitting} title="Cancel">
          <Ban className="h-3.5 w-3.5" />
        </Button>
      </>
    );
  }

  const trailingButtons = canManage ? (
    <Button onClick={() => setFormOpen(true)}>
      <CalendarPlus className="h-4 w-4" /> Request leave
    </Button>
  ) : null;

  const noMatch = (
    <EmptyState
      size="compact"
      icon={<SearchX />}
      title="No leave requests match"
      description="Adjust the search or column filters to see all requests."
    />
  );

  async function submitLeave() {
    if (!fEmployee) return toast.error("Select an employee");
    if (!fStart || !fEnd) return toast.error("Start and end dates are required");
    if (new Date(fEnd) < new Date(fStart)) return toast.error("End date cannot be before start date");
    setSubmitting(true);
    try {
      const res = await fetch("/api/leaves", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          employeeId: fEmployee,
          type: fType,
          startDate: fStart,
          endDate: fEnd,
          reason: fReason || null,
        }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error ?? "Failed to create leave request");
      toast.success("Leave request created");
      setFormOpen(false);
      setFEmployee(""); setFType("CASUAL"); setFStart(""); setFEnd(""); setFReason("");
      router.refresh();
    } catch (err: unknown) {
      toast.error(err instanceof Error ? err.message : "Unknown error");
    } finally {
      setSubmitting(false);
    }
  }

  async function actOnLeave(leave: LeaveRow, approve: boolean, reason?: string) {
    setSubmitting(true);
    try {
      const res = await fetch(`/api/leaves/${leave.id}`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ approve, rejectedReason: reason ?? null }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error ?? "Failed to update leave");
      toast.success(approve ? "Leave approved" : "Leave rejected");
      setRejectTarget(null);
      setRejectReason("");
      router.refresh();
    } catch (err: unknown) {
      toast.error(err instanceof Error ? err.message : "Unknown error");
    } finally {
      setSubmitting(false);
    }
  }

  async function cancelLeave(leave: LeaveRow) {
    setSubmitting(true);
    try {
      const res = await fetch(`/api/leaves/${leave.id}`, { method: "DELETE" });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error ?? "Failed to cancel leave");
      toast.success("Leave cancelled");
      router.refresh();
    } catch (err: unknown) {
      toast.error(err instanceof Error ? err.message : "Unknown error");
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <div className="space-y-4">
      {/* Summary stats bar */}
      <LeaveStatsBar leaves={leaves} />

      {/* List */}
      {leaves.length === 0 ? (
        <EmptyState
          icon={<CalendarPlus className="h-5 w-5" />}
          title="No leave requests"
          description="Create a leave request for an employee to start the approval workflow."
          action={canManage ? <Button size="sm" onClick={() => setFormOpen(true)}><CalendarPlus className="h-4 w-4" /> Request Leave</Button> : undefined}
        />
      ) : (
        <div className="overflow-hidden rounded-lg border border-border bg-card shadow-raised">
          <DataTable
            data={leaves}
            columns={leaveColumns}
            storageKey="leaves"
            hideable
            exportFileName="leaves"
            initialSort={{ key: "startDate", direction: "desc" }}
            onRowClick={(l) => setDetailTarget(l)}
            searchable
            searchPlaceholder="Search employee, type, status…"
            toolbarTrailing={trailingButtons}
            rowActions={leaveRowActions}
            rowTone={(l) => {
              if (l.status === "PENDING" && new Date(l.endDate) < new Date()) return "warning";
              if (l.status === "REJECTED") return "danger";
              return null;
            }}
            emptyState={noMatch}
          />
        </div>
      )}

      {/* Detail dialog */}
      {detailTarget && (
        <LeaveDetailDialog leave={detailTarget} onClose={() => setDetailTarget(null)} />
      )}

      {/* Create dialog */}
      <Dialog
        open={formOpen}
        onOpenChange={setFormOpen}
        title="Request Leave"
        description="Submit a leave request for an employee. Working days (Mon–Fri) are computed automatically."
      >
        <div className="space-y-4">
          <div>
            <Label>Employee</Label>
            <Select value={fEmployee} onChange={(e) => setFEmployee(e.target.value)}>
              <option value="">Select employee…</option>
              {employees.map((e) => (
                <option key={e.id} value={e.id}>
                  {e.name}{e.trade ? ` — ${e.trade}` : ""}
                </option>
              ))}
            </Select>
          </div>
          <div>
            <Label>Leave type</Label>
            <Select value={fType} onChange={(e) => setFType(e.target.value)}>
              {Object.entries(TYPE_LABELS).map(([k, v]) => (
                <option key={k} value={k}>{v}</option>
              ))}
            </Select>
          </div>
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
            <div>
              <Label>Start date</Label>
              <Input type="date" value={fStart} onChange={(e) => setFStart(e.target.value)} />
            </div>
            <div>
              <Label>End date</Label>
              <Input type="date" value={fEnd} onChange={(e) => setFEnd(e.target.value)} />
            </div>
          </div>
          <div>
            <Label>Reason (optional)</Label>
            <Textarea value={fReason} onChange={(e) => setFReason(e.target.value)} rows={2} placeholder="Reason for leave…" />
          </div>
          <div className="flex justify-end gap-2 pt-2 border-t border-border">
            <Button variant="outline" onClick={() => setFormOpen(false)}>Cancel</Button>
            <Button onClick={submitLeave} disabled={submitting}>
              {submitting ? "Submitting…" : "Submit Request"}
            </Button>
          </div>
        </div>
      </Dialog>

      {/* Reject dialog */}
      <Dialog
        open={!!rejectTarget}
        onOpenChange={(o) => { if (!o) setRejectTarget(null); }}
        title="Reject Leave Request"
        description={rejectTarget ? `${rejectTarget.employeeName} · ${formatDate(rejectTarget.startDate)} → ${formatDate(rejectTarget.endDate)}` : ""}
      >
        <div className="space-y-3">
          <div>
            <Label>Reason for rejection (optional)</Label>
            <Textarea value={rejectReason} onChange={(e) => setRejectReason(e.target.value)} rows={3} placeholder="Explain why this leave is rejected…" />
          </div>
          <div className="flex justify-end gap-2 pt-2 border-t border-border">
            <Button variant="outline" onClick={() => setRejectTarget(null)}>Cancel</Button>
            <Button variant="destructive" onClick={() => rejectTarget && actOnLeave(rejectTarget, false, rejectReason)} disabled={submitting}>
              {submitting ? "Rejecting…" : "Reject Leave"}
            </Button>
          </div>
        </div>
      </Dialog>
    </div>
  );
}

// ───────────────────────────────────────────────────────────
//  Leave Detail Dialog
// ───────────────────────────────────────────────────────────

function LeaveDetailDialog({ leave, onClose }: { leave: LeaveRow; onClose: () => void }) {
  const statusCfg = STATUS_CONFIG[leave.status] ?? STATUS_CONFIG.PENDING!;
  const typeColor = TYPE_COLORS[leave.type] ?? "bg-muted text-muted-foreground";
  const isPast = new Date(leave.endDate) < new Date() && leave.status === "PENDING";

  return (
    <Dialog
      open
      onOpenChange={(o) => !o && onClose()}
      title={leave.employeeName}
      description={`${formatDate(leave.startDate)} → ${formatDate(leave.endDate)} · ${leave.days} day${leave.days !== 1 ? "s" : ""}`}
      className="max-w-md"
    >
      <div className="space-y-4">
        {/* Badges */}
        <div className="flex flex-wrap items-center gap-2">
          {leave.employeeTrade && <Badge variant="outline">{leave.employeeTrade}</Badge>}
          <span className={cn("rounded px-1.5 py-0.5 text-micro font-medium", typeColor)}>
            {TYPE_LABELS[leave.type] ?? leave.type}
          </span>
          <span className={cn("inline-flex items-center gap-1.5 rounded px-1.5 py-0.5 text-micro font-medium", statusCfg.class)}>
            <span className={cn("h-1.5 w-1.5 rounded-full", statusCfg.dotClass)} />
            {statusCfg.label}
          </span>
          {isPast && (
            <span className="inline-flex items-center gap-1 text-micro text-danger">
              <AlertCircle className="h-3 w-3" /> overdue
            </span>
          )}
        </div>

        {/* Date range */}
        <div className="flex items-center gap-2 text-body text-muted-foreground">
          <Calendar className="h-4 w-4" />
          {formatDate(leave.startDate)} → {formatDate(leave.endDate)} · {leave.days} day{leave.days !== 1 ? "s" : ""}
        </div>

        {/* Reason */}
        {leave.reason && (
          <div>
            <div className="text-label text-muted-foreground">Reason</div>
            <p className="mt-1 text-body leading-relaxed italic text-foreground">&ldquo;{leave.reason}&rdquo;</p>
          </div>
        )}

        {/* Approval info */}
        {leave.status === "APPROVED" && leave.approvedByName && (
          <div className="flex items-center gap-1.5 rounded-md bg-success/5 p-2 text-caption text-muted-foreground">
            <Check className="h-3.5 w-3.5 text-success" />
            Approved by {leave.approvedByName}{leave.approvedAt ? ` on ${formatDate(leave.approvedAt)}` : ""}
          </div>
        )}
        {leave.status === "REJECTED" && leave.rejectedReason && (
          <div className="flex items-start gap-1.5 rounded-md bg-danger/5 p-2 text-caption text-danger">
            <X className="mt-0.5 h-3.5 w-3.5 shrink-0" />
            <span>{leave.rejectedReason}</span>
          </div>
        )}

        {/* Meta */}
        <div className="text-meta text-muted-foreground border-t border-border pt-2">
          Requested {formatDate(leave.createdAt)}
        </div>
      </div>
    </Dialog>
  );
}

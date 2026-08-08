"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { CalendarPlus, Check, X, Ban } from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Input, Select, Label, Textarea } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import { Dialog } from "@/components/ui/dialog";
import { EmptyState } from "@/components/empty-state";
import { StatusPill } from "@/components/page";
import { formatDate } from "@/lib/utils";

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

function statusBadge(status: string) {
  return <StatusPill status={status} />;
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
  const canManage = permissions?.canManage ?? true;
  const [formOpen, setFormOpen] = useState(false);
  const [filterStatus, setFilterStatus] = useState<string>("ALL");
  const [rejectTarget, setRejectTarget] = useState<LeaveRow | null>(null);
  const [rejectReason, setRejectReason] = useState("");
  const [submitting, setSubmitting] = useState(false);

  // Form state
  const [fEmployee, setFEmployee] = useState("");
  const [fType, setFType] = useState("CASUAL");
  const [fStart, setFStart] = useState("");
  const [fEnd, setFEnd] = useState("");
  const [fReason, setFReason] = useState("");

  const filtered = filterStatus === "ALL" ? leaves : leaves.filter((l) => l.status === filterStatus);
  const pendingCount = leaves.filter((l) => l.status === "PENDING").length;

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
      {/* Toolbar */}
      <div className="flex flex-wrap items-center justify-between gap-2">
        <div className="flex items-center gap-2">
          <Select value={filterStatus} onChange={(e) => setFilterStatus(e.target.value)} className="w-36">
            <option value="ALL">All ({leaves.length})</option>
            <option value="PENDING">Pending ({pendingCount})</option>
            <option value="APPROVED">Approved</option>
            <option value="REJECTED">Rejected</option>
            <option value="CANCELLED">Cancelled</option>
          </Select>
        </div>
        {canManage && (
          <Button size="sm" onClick={() => setFormOpen(true)}>
            <CalendarPlus className="mr-1 h-3.5 w-3.5" /> Request Leave
          </Button>
        )}
      </div>

      {/* List */}
      {filtered.length === 0 ? (
        <EmptyState
          icon={<CalendarPlus className="h-5 w-5" />}
          title="No leave requests"
          description="Create a leave request for an employee to start the approval workflow."
          action={canManage ? <Button size="sm" onClick={() => setFormOpen(true)}><CalendarPlus className="h-4 w-4" /> Request Leave</Button> : undefined}
        />
      ) : (
        <div className="space-y-2">
          {filtered.map((l) => (
            <div key={l.id} className="rounded-lg border border-border bg-card p-3">
              <div className="flex flex-wrap items-start justify-between gap-2">
                <div className="space-y-0.5">
                  <div className="flex items-center gap-2">
                    <span className="font-medium text-foreground">{l.employeeName}</span>
                    {l.employeeTrade && <Badge variant="outline">{l.employeeTrade}</Badge>}
                    <Badge variant="muted">{TYPE_LABELS[l.type] ?? l.type}</Badge>
                    {statusBadge(l.status)}
                  </div>
                  <div className="text-meta text-muted-foreground">
                    {formatDate(l.startDate)} → {formatDate(l.endDate)} · {l.days} day{l.days !== 1 ? "s" : ""}
                  </div>
                  {l.reason && <div className="text-body text-muted-foreground">“{l.reason}”</div>}
                  {l.status === "APPROVED" && l.approvedByName && (
                    <div className="text-caption text-muted-foreground">Approved by {l.approvedByName}{l.approvedAt ? ` on ${formatDate(l.approvedAt)}` : ""}</div>
                  )}
                  {l.status === "REJECTED" && l.rejectedReason && (
                    <div className="text-caption text-danger">Rejected: {l.rejectedReason}</div>
                  )}
                </div>
                {canManage && l.status === "PENDING" && (
                  <div className="flex items-center gap-1">
                    <Button size="sm" variant="default" onClick={() => actOnLeave(l, true)} disabled={submitting}>
                      <Check className="mr-1 h-3.5 w-3.5" /> Approve
                    </Button>
                    <Button size="sm" variant="outline" onClick={() => { setRejectTarget(l); setRejectReason(""); }} disabled={submitting}>
                      <X className="mr-1 h-3.5 w-3.5" /> Reject
                    </Button>
                    <Button size="sm" variant="ghost" onClick={() => cancelLeave(l)} disabled={submitting}>
                      <Ban className="h-3.5 w-3.5" />
                    </Button>
                  </div>
                )}
              </div>
            </div>
          ))}
        </div>
      )}

      {/* Create dialog */}
      <Dialog
        open={formOpen}
        onOpenChange={setFormOpen}
        title="Request Leave"
        description="Submit a leave request for an employee. Working days (Mon–Fri) are computed automatically."
      >
        <div className="space-y-3">
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
          <div className="flex justify-end gap-2 pt-2">
            <Button variant="ghost" onClick={() => setFormOpen(false)}>Cancel</Button>
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
          <div className="flex justify-end gap-2 pt-2">
            <Button variant="ghost" onClick={() => setRejectTarget(null)}>Cancel</Button>
            <Button variant="outline" onClick={() => rejectTarget && actOnLeave(rejectTarget, false, rejectReason)} disabled={submitting}>
              {submitting ? "Rejecting…" : "Reject Leave"}
            </Button>
          </div>
        </div>
      </Dialog>
    </div>
  );
}

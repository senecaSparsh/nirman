"use client";

import { useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import { CalendarCheck, Save, Clock, Pencil, Trash2, CalendarX } from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Input, Select, Label } from "@/components/ui/input";
import { Dialog } from "@/components/ui/dialog";
import { Table, THead, TBody, TR, TH, TD } from "@/components/ui/table";
import { Tabs, TabsList, TabsTrigger, TabsContent } from "@/components/ui/tabs";
import { EmptyState } from "@/components/empty-state";
import { StatusPill, statusMeaning } from "@/components/page";
import { DeleteConfirmDialog } from "@/components/delete-confirm-dialog";
import { LeavesView, type LeaveRow } from "@/components/hr/leaves-view";
import { formatDate } from "@/lib/utils";

type AttendanceStatus = "PRESENT" | "ABSENT" | "HALF_DAY" | "OVERTIME" | "LEAVE";

export type AttendanceRow = {
  id: string;
  employeeId: string;
  employeeName: string;
  trade: string | null;
  date: string;
  projectId: string | null;
  projectName: string | null;
  checkIn: string | null;
  checkOut: string | null;
  hoursWorked: number | null;
  status: AttendanceStatus;
  notes: string | null;
};

export function AttendanceView({
  employees,
  projects,
  recentAttendance,
  todayDate,
  permissions,
  leaveRows,
  leaveEmployees,
}: {
  employees: { id: string; name: string; trade: string | null }[];
  projects: { id: string; name: string }[];
  recentAttendance: AttendanceRow[];
  todayDate: string;
  permissions?: { canEdit?: boolean; canManage?: boolean };
  leaveRows?: LeaveRow[];
  leaveEmployees?: { id: string; name: string; trade: string | null; designation: string | null }[];
}) {
  const router = useRouter();
  const canEdit = permissions?.canEdit ?? true;
  const canManage = permissions?.canManage ?? true;
  const [outerTab, setOuterTab] = useState("attendance");
  const [tab, setTab] = useState<"log" | "history">("log");
  const [date, setDate] = useState(todayDate);
  const [projectId, setProjectId] = useState("");
  const [statuses, setStatuses] = useState<Record<string, AttendanceStatus>>({});
  const [saving, setSaving] = useState(false);
  const [editTarget, setEditTarget] = useState<AttendanceRow | null>(null);
  const [delTarget, setDelTarget] = useState<AttendanceRow | null>(null);
  const [editStatus, setEditStatus] = useState<AttendanceStatus>("PRESENT");
  const [editHours, setEditHours] = useState("");
  const [editProject, setEditProject] = useState("");
  const [editNotes, setEditNotes] = useState("");
  const [savingEdit, setSavingEdit] = useState(false);

  // Initialize statuses from recent attendance for the selected date
  const todayRecords = useMemo(
    () => recentAttendance.filter((r) => r.date.split("T")[0] === date),
    [recentAttendance, date],
  );

  const getStatus = (empId: string): AttendanceStatus => {
    if (statuses[empId]) return statuses[empId];
    const record = todayRecords.find((r) => r.employeeId === empId);
    return record?.status ?? "PRESENT";
  };

  const setStatus = (empId: string, status: AttendanceStatus) => {
    setStatuses((prev) => ({ ...prev, [empId]: status }));
  };

  const handleSave = async () => {
    setSaving(true);
    try {
      const records = employees.map((e) => ({
        employeeId: e.id,
        status: getStatus(e.id),
      }));
      const res = await fetch("/api/attendance", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          date,
          projectId: projectId || null,
          records,
        }),
      });
      if (res.ok) {
        toast.success(`Attendance saved for ${employees.length} workers`);
        setStatuses({});
        router.refresh();
      } else {
        const data = await res.json().catch(() => ({}));
        toast.error(data.error ?? "Failed to save attendance");
      }
    } finally {
      setSaving(false);
    }
  };

  const presentCount = employees.filter((e) => getStatus(e.id) === "PRESENT" || getStatus(e.id) === "OVERTIME").length;
  const absentCount = employees.filter((e) => getStatus(e.id) === "ABSENT").length;
  const leaveCount = employees.filter((e) => getStatus(e.id) === "LEAVE").length;

  function openEdit(r: AttendanceRow) {
    setEditTarget(r);
    setEditStatus(r.status);
    setEditHours(r.hoursWorked?.toString() ?? "");
    setEditProject(r.projectId ?? "");
    setEditNotes(r.notes ?? "");
  }

  async function saveEdit() {
    if (!editTarget) return;
    setSavingEdit(true);
    try {
      const res = await fetch(`/api/attendance/${editTarget.id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          status: editStatus,
          hoursWorked: editHours ? Number(editHours) : null,
          projectId: editProject || null,
          notes: editNotes || null,
        }),
      });
      if (res.ok) {
        toast.success("Attendance updated");
        setEditTarget(null);
        router.refresh();
      } else {
        const data = await res.json().catch(() => ({}));
        toast.error(data.error ?? "Failed to update attendance");
      }
    } finally {
      setSavingEdit(false);
    }
  }

  return (
    <div className="space-y-4">
      <Tabs value={outerTab} onValueChange={setOuterTab}>
        <TabsList>
          <TabsTrigger value="attendance">
            <span className="flex items-center gap-1.5">
              <CalendarCheck className="h-3.5 w-3.5" /> Attendance
            </span>
          </TabsTrigger>
          <TabsTrigger value="leave">
            <span className="flex items-center gap-1.5">
              <CalendarX className="h-3.5 w-3.5" /> Leave
            </span>
          </TabsTrigger>
        </TabsList>

        <TabsContent value="attendance" className="space-y-4">
          {/* Sub-tabs */}
          <div className="flex gap-1">
            <button
              onClick={() => setTab("log")}
              className={`rounded-md px-3 py-1.5 text-body font-medium transition-colors ${tab === "log" ? "bg-primary/10 text-primary" : "text-muted-foreground hover:bg-muted/40"}`}
            >
              Log Attendance
            </button>
            <button
              onClick={() => setTab("history")}
              className={`rounded-md px-3 py-1.5 text-body font-medium transition-colors ${tab === "history" ? "bg-primary/10 text-primary" : "text-muted-foreground hover:bg-muted/40"}`}
            >
              History
            </button>
          </div>

          {tab === "log" ? (
        <>
          {/* Date + project selector */}
          <div className="flex flex-wrap items-end gap-3">
            <div>
              <Label>Date</Label>
              <Input type="date" value={date} onChange={(e) => setDate(e.target.value)} className="w-auto" />
            </div>
            <div>
              <Label>Project (optional)</Label>
              <Select value={projectId} onChange={(e) => setProjectId(e.target.value)} className="w-auto">
                <option value="">All / Default</option>
                {projects.map((p) => <option key={p.id} value={p.id}>{p.name}</option>)}
              </Select>
            </div>
            <div className="ml-auto flex items-center gap-3 text-caption">
              <span className="flex items-center gap-1"><span className="h-2 w-2 rounded-full bg-success" /> {presentCount} present</span>
              <span className="flex items-center gap-1"><span className="h-2 w-2 rounded-full bg-danger" /> {absentCount} absent</span>
              <span className="flex items-center gap-1"><span className="h-2 w-2 rounded-full bg-muted-foreground" /> {leaveCount} leave</span>
            </div>
            {canEdit && (
              <Button size="sm" onClick={handleSave} disabled={saving || employees.length === 0}>
                <Save className="mr-1 h-3.5 w-3.5" /> {saving ? "Saving…" : "Save Attendance"}
              </Button>
            )}
          </div>

          {/* Attendance grid */}
          {employees.length === 0 ? (
            <EmptyState
              icon={<CalendarCheck className="h-5 w-5" />}
              title="No active employees"
              description="Add employees first to log attendance."
            />
          ) : (
            <Table>
              <THead>
                <TR>
                  <TH>Employee</TH>
                  <TH>Trade</TH>
                  <TH>Status</TH>
                </TR>
              </THead>
              <TBody>
                {employees.map((e) => (
                  <TR key={e.id}>
                    <TD className="font-medium">{e.name}</TD>
                    <TD>{e.trade || <span className="text-muted-foreground">—</span>}</TD>
                    <TD>
                      <div className="flex gap-1">
                        {(["PRESENT", "HALF_DAY", "OVERTIME", "ABSENT", "LEAVE"] as AttendanceStatus[]).map((s) => (
                          <button
                            key={s}
                            onClick={() => setStatus(e.id, s)}
                            disabled={!canEdit}
                            className={`rounded px-2 py-0.5 text-caption font-medium transition-colors ${
                              getStatus(e.id) === s
                                ? statusMeaning(s) === "good" ? "bg-success/15 text-success"
                                  : statusMeaning(s) === "bad" ? "bg-danger/15 text-danger"
                                  : statusMeaning(s) === "waiting" ? "bg-warning/15 text-warning"
                                  : statusMeaning(s) === "neutral" ? "bg-muted text-muted-foreground"
                                  : "bg-primary/10 text-primary"
                                : "bg-muted/30 text-muted-foreground hover:bg-muted/60"
                            }`}
                          >
                            {s === "PRESENT" ? "P" : s === "ABSENT" ? "A" : s === "HALF_DAY" ? "H" : s === "OVERTIME" ? "OT" : "L"}
                          </button>
                        ))}
                      </div>
                    </TD>
                  </TR>
                ))}
              </TBody>
            </Table>
          )}
        </>
      ) : (
        /* History tab */
        <>
          {recentAttendance.length === 0 ? (
            <EmptyState
              icon={<Clock className="h-5 w-5" />}
              title="No attendance records"
              description="Attendance from the last 7 days will appear here."
            />
          ) : (
            <Table>
              <THead>
                <TR>
                  <TH>Date</TH>
                  <TH>Employee</TH>
                  <TH>Project</TH>
                  <TH>Hours</TH>
                  <TH>Status</TH>
                  {canEdit && <TH></TH>}
                </TR>
              </THead>
              <TBody>
                {recentAttendance.map((r) => (
                  <TR key={r.id}>
                    <TD className="tnum">{formatDate(r.date)}</TD>
                    <TD className="font-medium">{r.employeeName}</TD>
                    <TD>{r.projectName || <span className="text-muted-foreground">—</span>}</TD>
                    <TD className="tnum">{r.hoursWorked != null ? `${r.hoursWorked}h` : "—"}</TD>
                    <TD>
                      <StatusPill status={r.status} />
                    </TD>
                    {canEdit && (
                      <TD>
                        <div className="flex gap-1">
                          <button onClick={() => openEdit(r)} className="rounded p-1 text-muted-foreground hover:bg-accent hover:text-foreground" title="Edit">
                            <Pencil className="h-3.5 w-3.5" />
                          </button>
                          <button onClick={() => setDelTarget(r)} className="rounded p-1 text-muted-foreground hover:bg-danger/10 hover:text-danger" title="Delete">
                            <Trash2 className="h-3.5 w-3.5" />
                          </button>
                        </div>
                      </TD>
                    )}
                  </TR>
                ))}
              </TBody>
            </Table>
          )}
        </>
      )}

      {/* Edit attendance dialog */}
      <Dialog
        open={editTarget !== null}
        onOpenChange={(o) => { if (!o) setEditTarget(null); }}
        title={`Edit attendance — ${editTarget?.employeeName ?? ""}`}
        description={editTarget ? formatDate(editTarget.date) : ""}
      >
        <div className="space-y-3">
          <div>
            <Label>Status</Label>
            <Select value={editStatus} onChange={(e) => setEditStatus(e.target.value as AttendanceStatus)} className="w-full">
              {(["PRESENT", "ABSENT", "HALF_DAY", "OVERTIME", "LEAVE"] as AttendanceStatus[]).map((s) => (
                <option key={s} value={s}>{s.replace("_", " ")}</option>
              ))}
            </Select>
          </div>
          <div>
            <Label>Hours worked</Label>
            <Input type="number" step="0.5" value={editHours} onChange={(e) => setEditHours(e.target.value)} placeholder="0" />
          </div>
          <div>
            <Label>Project</Label>
            <Select value={editProject} onChange={(e) => setEditProject(e.target.value)} className="w-full">
              <option value="">—</option>
              {projects.map((p) => (
                <option key={p.id} value={p.id}>{p.name}</option>
              ))}
            </Select>
          </div>
          <div>
            <Label>Notes</Label>
            <Input value={editNotes} onChange={(e) => setEditNotes(e.target.value)} placeholder="Optional notes" />
          </div>
          <div className="flex justify-end gap-2 pt-2">
            <Button variant="outline" onClick={() => setEditTarget(null)}>Cancel</Button>
            <Button onClick={saveEdit} disabled={savingEdit}>{savingEdit ? "Saving…" : "Save"}</Button>
          </div>
        </div>
      </Dialog>

      {/* Delete attendance dialog */}
      {delTarget && (
        <DeleteConfirmDialog
          open={delTarget !== null}
          onOpenChange={(o) => { if (!o) setDelTarget(null); }}
          endpoint={`/api/attendance/${delTarget.id}`}
          title="Delete attendance record"
          description={`Delete ${delTarget.employeeName}'s attendance for ${formatDate(delTarget.date)}? This cannot be undone.`}
          successMessage="Attendance record deleted"
          onSuccess={() => { setDelTarget(null); }}
        />
      )}
        </TabsContent>

        <TabsContent value="leave">
          {leaveRows && leaveEmployees ? (
            <LeavesView leaves={leaveRows} employees={leaveEmployees} permissions={{ canManage }} />
          ) : null}
        </TabsContent>
      </Tabs>
    </div>
  );
}

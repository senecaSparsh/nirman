"use client";

import { useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import { CalendarCheck, Save, Clock, Pencil, Trash2, CalendarX, MapPin, SearchX } from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Input, Select, Label } from "@/components/ui/input";
import { Dialog } from "@/components/ui/dialog";
import { Table, THead, TBody, TR, TH, TD } from "@/components/ui/table";
import { DataTable, type Column } from "@/components/ui/data-table";
import { IdentityCell, DateCell } from "@/components/ui/cells";
import { Tabs, TabsList, TabsTrigger, TabsContent } from "@/components/ui/tabs";
import { EmptyState } from "@/components/empty-state";
import { DeleteConfirmDialog } from "@/components/delete-confirm-dialog";
import { LeavesView, type LeaveRow } from "@/components/hr/leaves-view";
import { useTabParam } from "@/lib/use-tab-param";
import { formatDate, cn } from "@/lib/utils";

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

const STATUS_CONFIG: Record<AttendanceStatus, { label: string; short: string; activeClass: string; dotClass: string }> = {
  PRESENT: { label: "Present", short: "P", activeClass: "bg-success/15 text-success border-success/30", dotClass: "bg-success" },
  ABSENT: { label: "Absent", short: "A", activeClass: "bg-danger/15 text-danger border-danger/30", dotClass: "bg-danger" },
  HALF_DAY: { label: "Half Day", short: "H", activeClass: "bg-warning/15 text-warning border-warning/30", dotClass: "bg-warning" },
  OVERTIME: { label: "Overtime", short: "OT", activeClass: "bg-info/15 text-info border-info/30", dotClass: "bg-info" },
  LEAVE: { label: "Leave", short: "L", activeClass: "bg-muted text-muted-foreground border-border", dotClass: "bg-muted-foreground" },
};

/** Attendance summary stats bar. */
function AttendanceStatsBar({ employees, getStatus }: { employees: { id: string }[]; getStatus: (id: string) => AttendanceStatus }) {
  const present = employees.filter((e) => getStatus(e.id) === "PRESENT" || getStatus(e.id) === "OVERTIME").length;
  const absent = employees.filter((e) => getStatus(e.id) === "ABSENT").length;
  const halfDay = employees.filter((e) => getStatus(e.id) === "HALF_DAY").length;
  const leave = employees.filter((e) => getStatus(e.id) === "LEAVE").length;
  const total = employees.length;
  const rate = total > 0 ? ((present + halfDay * 0.5) / total) * 100 : 0;

  return (
    <div className="grid grid-cols-2 divide-border overflow-hidden rounded-lg border border-border bg-card sm:grid-cols-5 sm:divide-x divide-y sm:divide-y-0">
      <div className="flex flex-col gap-0.5 p-3">
        <span className="text-label text-muted-foreground/75">Attendance Rate</span>
        <span className={cn("text-figure-lg", rate >= 75 ? "text-success" : rate >= 50 ? "text-warning" : "text-danger")}>
          {rate.toFixed(0)}<span className="text-body">%</span>
        </span>
        <span className="text-micro text-muted-foreground">{total} workers</span>
      </div>
      <div className="flex flex-col gap-0.5 p-3">
        <span className="text-label text-muted-foreground/75">Present</span>
        <span className="text-figure text-success">{present}</span>
        <span className="text-micro text-muted-foreground">incl. overtime</span>
      </div>
      <div className="flex flex-col gap-0.5 p-3">
        <span className="text-label text-muted-foreground/75">Half Day</span>
        <span className="text-figure text-warning">{halfDay}</span>
      </div>
      <div className="flex flex-col gap-0.5 p-3">
        <span className="text-label text-muted-foreground/75">Absent</span>
        <span className="text-figure text-danger">{absent}</span>
      </div>
      <div className="flex flex-col gap-0.5 p-3">
        <span className="text-label text-muted-foreground/75">Leave</span>
        <span className="text-figure text-muted-foreground">{leave}</span>
      </div>
    </div>
  );
}

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
  const canEdit = permissions?.canEdit ?? false;
  const canManage = permissions?.canManage ?? false;
  const [outerTab, setOuterTab] = useTabParam(["attendance", "leave"] as const, "attendance");
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

  const historyColumns: Column<AttendanceRow>[] = [
    {
      key: "date",
      label: "Date",
      sortable: true,
      sortValue: (r) => new Date(r.date),
      render: (r) => <DateCell date={r.date} formatted={formatDate(r.date)} />,
      exportValue: (r) => r.date,
    },
    {
      key: "employeeName",
      label: "Employee",
      sortable: true,
      filterable: true,
      sortValue: (r) => r.employeeName,
      render: (r) => (
        <IdentityCell
          name={r.employeeName}
          sub={r.trade ?? null}
        />
      ),
      filterValue: (r) => r.employeeName,
      exportValue: (r) => r.employeeName,
    },
    {
      key: "projectName",
      label: "Project",
      sortable: true,
      filterable: true,
      render: (r) => r.projectName ? (
        <span className="flex items-center gap-1 text-caption">
          <MapPin className="h-3 w-3 text-muted-foreground" />
          {r.projectName}
        </span>
      ) : <span className="text-faint">—</span>,
      filterValue: (r) => r.projectName ?? "—",
      exportValue: (r) => r.projectName ?? "",
    },
    {
      key: "hoursWorked",
      label: "Hours",
      align: "right",
      sortable: true,
      render: (r) => r.hoursWorked != null ? <span className="tnum">{r.hoursWorked}h</span> : <span className="text-faint">—</span>,
      sortValue: (r) => r.hoursWorked ?? -1,
      exportValue: (r) => r.hoursWorked ?? "",
    },
    {
      key: "status",
      label: "Status",
      sortable: true,
      filterable: true,
      render: (r) => {
        const cfg = STATUS_CONFIG[r.status];
        return (
          <span className={cn("inline-flex items-center gap-1.5 rounded px-2 py-0.5 text-caption font-medium", cfg.activeClass)}>
            <span className={cn("h-1.5 w-1.5 rounded-full", cfg.dotClass)} />
            {cfg.label}
          </span>
        );
      },
      filterValue: (r) => STATUS_CONFIG[r.status]?.label ?? r.status,
      exportValue: (r) => r.status,
    },
  ];

  function historyRowActions(r: AttendanceRow) {
    if (!canEdit) return null;
    return (
      <>
        <button
          onClick={(e) => { e.stopPropagation(); openEdit(r); }}
          className="rounded p-1 text-muted-foreground hover:bg-accent hover:text-foreground"
          title="Edit"
        >
          <Pencil className="h-3.5 w-3.5" />
        </button>
        <button
          onClick={(e) => { e.stopPropagation(); setDelTarget(r); }}
          className="rounded p-1 text-muted-foreground hover:bg-danger/10 hover:text-danger"
          title="Delete"
        >
          <Trash2 className="h-3.5 w-3.5" />
        </button>
      </>
    );
  }

  const historyNoMatch = (
    <EmptyState
      size="compact"
      icon={<SearchX />}
      title="No attendance records match"
      description="Adjust the search or column filters to see all records."
    />
  );

  return (
    <div className="space-y-4">
      <Tabs value={outerTab} onValueChange={(v) => setOuterTab(v as "attendance" | "leave")}>
        <TabsList>
          <TabsTrigger value="attendance">
            <span className="flex items-center gap-1.5">
              <CalendarCheck className="h-3.5 w-3.5" /> Attendance
            </span>
          </TabsTrigger>
          <TabsTrigger value="leave">
            <span className="flex items-center gap-1.5">
              <CalendarX className="h-3.5 w-3.5" /> Leave
              {leaveRows && leaveRows.filter((l) => l.status === "PENDING").length > 0 && (
                <span className="ml-1 rounded bg-warning/15 px-1.5 py-0.5 text-micro font-medium text-warning">
                  {leaveRows.filter((l) => l.status === "PENDING").length}
                </span>
              )}
            </span>
          </TabsTrigger>
        </TabsList>

        <TabsContent value="attendance" className="space-y-4">
          {/* Sub-tabs */}
          <div className="flex gap-1">
            <button
              onClick={() => setTab("log")}
              className={cn(
                "rounded-md px-3 py-1.5 text-body font-medium transition-colors",
                tab === "log" ? "bg-[var(--color-world-hr)]/10 text-[var(--color-world-hr)]" : "text-muted-foreground hover:bg-muted/40",
              )}
            >
              Log Attendance
            </button>
            <button
              onClick={() => setTab("history")}
              className={cn(
                "rounded-md px-3 py-1.5 text-body font-medium transition-colors",
                tab === "history" ? "bg-[var(--color-world-hr)]/10 text-[var(--color-world-hr)]" : "text-muted-foreground hover:bg-muted/40",
              )}
            >
              History
            </button>
          </div>

          {tab === "log" ? (
            <>
              {/* Summary stats bar */}
              {employees.length > 0 && (
                <AttendanceStatsBar employees={employees} getStatus={getStatus} />
              )}

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
                {canEdit && (
                  <Button size="sm" onClick={handleSave} disabled={saving || employees.length === 0} className="ml-auto">
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
                <div className="overflow-hidden rounded-lg border border-border">
                  <Table>
                    <THead>
                      <TR>
                        <TH>Employee</TH>
                        <TH>Trade</TH>
                        <TH>Status</TH>
                      </TR>
                    </THead>
                    <TBody>
                      {employees.map((e) => {
                        const currentStatus = getStatus(e.id);
                        return (
                          <TR key={e.id}>
                            <TD className="font-medium">{e.name}</TD>
                            <TD>{e.trade || <span className="text-muted-foreground">—</span>}</TD>
                            <TD>
                              <div className="flex gap-1">
                                {(Object.keys(STATUS_CONFIG) as AttendanceStatus[]).map((s) => {
                                  const cfg = STATUS_CONFIG[s];
                                  const isActive = currentStatus === s;
                                  return (
                                    <button
                                      key={s}
                                      onClick={() => setStatus(e.id, s)}
                                      disabled={!canEdit}
                                      className={cn(
                                        "rounded border px-2 py-0.5 text-caption font-medium transition-all",
                                        isActive
                                          ? cfg.activeClass
                                          : "border-transparent bg-muted/30 text-muted-foreground hover:bg-muted/60",
                                      )}
                                      title={cfg.label}
                                    >
                                      {cfg.short}
                                    </button>
                                  );
                                })}
                              </div>
                            </TD>
                          </TR>
                        );
                      })}
                    </TBody>
                  </Table>
                </div>
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
                <div className="overflow-hidden rounded-lg border border-border bg-card shadow-raised">
                  <DataTable
                    data={recentAttendance}
                    columns={historyColumns}
                    storageKey="attendance-history"
                    hideable
                    exportFileName="attendance"
                    initialSort={{ key: "date", direction: "desc" }}
                    searchable
                    searchPlaceholder="Search employee, project…"
                    rowActions={historyRowActions}
                    emptyState={historyNoMatch}
                  />
                </div>
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
                  {(Object.keys(STATUS_CONFIG) as AttendanceStatus[]).map((s) => (
                    <option key={s} value={s}>{STATUS_CONFIG[s].label}</option>
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
              <div className="flex justify-end gap-2 pt-2 border-t border-border">
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

"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { FileText, Plus, Pencil, Trash2, ChevronDown, ChevronRight } from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Input, Select, Label, Textarea } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import { Dialog } from "@/components/ui/dialog";
import { EmptyState } from "@/components/empty-state";
import { ConfirmDialog } from "@/components/confirm-dialog";
import { formatDate } from "@/lib/utils";

export type DailyReportRow = {
  id: string;
  projectId: string | null;
  projectName: string | null;
  date: string;
  attendanceSummary: string | null;
  workDone: string;
  materialUsed: string | null;
  equipment: string | null;
  delay: string | null;
  remarks: string | null;
  submittedByName: string | null;
  createdAt: string;
};

export function DailyReportsView({
  reports,
  projects,
  permissions,
}: {
  reports: DailyReportRow[];
  projects: { id: string; name: string }[];
  permissions?: { canSubmit?: boolean };
}) {
  const router = useRouter();
  const canSubmit = permissions?.canSubmit ?? false;
  const [formOpen, setFormOpen] = useState(false);
  const [editTarget, setEditTarget] = useState<DailyReportRow | null>(null);
  const [expanded, setExpanded] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);
  const [delTarget, setDelTarget] = useState<DailyReportRow | null>(null);

  const [fProject, setFProject] = useState("");
  const [fDate, setFDate] = useState(new Date().toISOString().slice(0, 10));
  const [fAttendance, setFAttendance] = useState("");
  const [fWorkDone, setFWorkDone] = useState("");
  const [fMaterial, setFMaterial] = useState("");
  const [fEquipment, setFEquipment] = useState("");
  const [fDelay, setFDelay] = useState("");
  const [fRemarks, setFRemarks] = useState("");

  function openCreate() {
    setEditTarget(null);
    setFProject(""); setFDate(new Date().toISOString().slice(0, 10));
    setFAttendance(""); setFWorkDone(""); setFMaterial(""); setFEquipment(""); setFDelay(""); setFRemarks("");
    setFormOpen(true);
  }

  function openEdit(r: DailyReportRow) {
    setEditTarget(r);
    setFProject(r.projectId ?? "");
    setFDate(r.date.slice(0, 10));
    setFAttendance(r.attendanceSummary ?? "");
    setFWorkDone(r.workDone);
    setFMaterial(r.materialUsed ?? "");
    setFEquipment(r.equipment ?? "");
    setFDelay(r.delay ?? "");
    setFRemarks(r.remarks ?? "");
    setFormOpen(true);
  }

  async function submit() {
    if (!fWorkDone.trim()) return toast.error("Work done is required");
    if (!fDate) return toast.error("Date is required");
    setSubmitting(true);
    try {
      const payload = {
        projectId: fProject || null,
        date: fDate,
        attendanceSummary: fAttendance || null,
        workDone: fWorkDone,
        materialUsed: fMaterial || null,
        equipment: fEquipment || null,
        delay: fDelay || null,
        remarks: fRemarks || null,
      };
      const res = editTarget
        ? await fetch(`/api/daily-reports/${editTarget.id}`, { method: "PATCH", headers: { "Content-Type": "application/json" }, body: JSON.stringify(payload) })
        : await fetch("/api/daily-reports", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(payload) });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error ?? "Failed to save report");
      toast.success(editTarget ? "Daily report updated" : "Daily report created");
      setFormOpen(false);
      router.refresh();
    } catch (err: unknown) {
      toast.error(err instanceof Error ? err.message : "Unknown error");
    } finally {
      setSubmitting(false);
    }
  }

  async function remove(r: DailyReportRow) {
    setSubmitting(true);
    try {
      const res = await fetch(`/api/daily-reports/${r.id}`, { method: "DELETE" });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error ?? "Failed to delete");
      toast.success("Daily report deleted");
      router.refresh();
    } catch (err: unknown) {
      toast.error(err instanceof Error ? err.message : "Unknown error");
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <div className="text-body text-muted-foreground">
          {reports.length} report{reports.length !== 1 ? "s" : ""}
        </div>
        {canSubmit && (
          <Button size="sm" onClick={openCreate}>
            <Plus className="mr-1 h-3.5 w-3.5" /> New Report
          </Button>
        )}
      </div>

      {reports.length === 0 ? (
        <EmptyState
          icon={<FileText className="h-5 w-5" />}
          title="No daily reports"
          description="Log site operations — attendance, work done, materials, equipment, delays."
          action={canSubmit ? (
            <Button size="sm" onClick={openCreate}>
              <Plus className="mr-1 h-3.5 w-3.5" /> Log Daily Report
            </Button>
          ) : undefined}
        />
      ) : (
        <div className="space-y-2">
          {reports.map((r) => (
            <div key={r.id} className="rounded-lg border border-border bg-card">
              <button
                onClick={() => setExpanded(expanded === r.id ? null : r.id)}
                className="flex w-full items-center gap-3 p-3 text-left transition-colors hover:bg-muted/20"
              >
                {expanded === r.id ? <ChevronDown className="h-4 w-4 text-muted-foreground" /> : <ChevronRight className="h-4 w-4 text-muted-foreground" />}
                <div className="flex-1 space-y-0.5">
                  <div className="flex flex-wrap items-center gap-2">
                    <span className="font-medium text-foreground">{formatDate(r.date)}</span>
                    {r.projectName && <Badge variant="outline">{r.projectName}</Badge>}
                    {r.delay && <Badge variant="warning">Delay</Badge>}
                  </div>
                  <div className="text-meta text-muted-foreground line-clamp-1">{r.workDone}</div>
                </div>
                {r.submittedByName && <span className="text-caption text-muted-foreground">by {r.submittedByName}</span>}
              </button>

              {expanded === r.id && (
                <div className="border-t border-border p-3 space-y-2 text-body">
                  {r.attendanceSummary && <div><span className="text-muted-foreground">Attendance: </span>{r.attendanceSummary}</div>}
                  <div><span className="text-muted-foreground">Work done: </span>{r.workDone}</div>
                  {r.materialUsed && <div><span className="text-muted-foreground">Material used: </span>{r.materialUsed}</div>}
                  {r.equipment && <div><span className="text-muted-foreground">Equipment: </span>{r.equipment}</div>}
                  {r.delay && <div><span className="text-muted-foreground">Delay: </span><span className="text-warning">{r.delay}</span></div>}
                  {r.remarks && <div><span className="text-muted-foreground">Remarks: </span>{r.remarks}</div>}
                  {canSubmit && (
                    <div className="flex items-center gap-2 pt-2">
                      <Button size="sm" variant="outline" onClick={() => openEdit(r)}>
                        <Pencil className="mr-1 h-3.5 w-3.5" /> Edit
                      </Button>
                      <Button size="sm" variant="ghost" onClick={() => setDelTarget(r)} disabled={submitting}>
                        <Trash2 className="mr-1 h-3.5 w-3.5" /> Delete
                      </Button>
                    </div>
                  )}
                </div>
              )}
            </div>
          ))}
        </div>
      )}

      <Dialog
        open={formOpen}
        onOpenChange={setFormOpen}
        title={editTarget ? "Edit Daily Report" : "New Daily Report"}
        description="Site operations log — attendance, work done, materials, equipment, delays."
      >
        <div className="space-y-3">
          <div className="grid grid-cols-2 gap-3">
            <div>
              <Label>Date</Label>
              <Input type="date" value={fDate} onChange={(e) => setFDate(e.target.value)} />
            </div>
            <div>
              <Label>Project (optional)</Label>
              <Select value={fProject} onChange={(e) => setFProject(e.target.value)}>
                <option value="">None</option>
                {projects.map((p) => (
                  <option key={p.id} value={p.id}>{p.name}</option>
                ))}
              </Select>
            </div>
          </div>
          <div>
            <Label>Attendance summary</Label>
            <Input value={fAttendance} onChange={(e) => setFAttendance(e.target.value)} placeholder="e.g. 42 present, 3 absent, 1 leave" />
          </div>
          <div>
            <Label>Work done *</Label>
            <Textarea value={fWorkDone} onChange={(e) => setFWorkDone(e.target.value)} rows={3} placeholder="Narrative of work completed today…" />
          </div>
          <div>
            <Label>Material used</Label>
            <Textarea value={fMaterial} onChange={(e) => setFMaterial(e.target.value)} rows={2} placeholder="Materials consumed today…" />
          </div>
          <div>
            <Label>Equipment deployed</Label>
            <Input value={fEquipment} onChange={(e) => setFEquipment(e.target.value)} placeholder="e.g. JCB (4h), Concrete mixer (8h)" />
          </div>
          <div>
            <Label>Delays encountered</Label>
            <Textarea value={fDelay} onChange={(e) => setFDelay(e.target.value)} rows={2} placeholder="Delays and reasons…" />
          </div>
          <div>
            <Label>Remarks</Label>
            <Textarea value={fRemarks} onChange={(e) => setFRemarks(e.target.value)} rows={2} />
          </div>
          <div className="flex justify-end gap-2 pt-2">
            <Button variant="ghost" onClick={() => setFormOpen(false)}>Cancel</Button>
            <Button onClick={submit} disabled={submitting}>
              {submitting ? "Saving…" : editTarget ? "Save Changes" : "Create Report"}
            </Button>
          </div>
        </div>
      </Dialog>

      <ConfirmDialog
        open={delTarget !== null}
        onOpenChange={(o) => { if (!o) setDelTarget(null); }}
        title="Delete daily report?"
        description={`Delete the daily report for ${delTarget ? formatDate(delTarget.date) : ""}? This action cannot be undone.`}
        confirmLabel="Delete"
        onConfirm={() => {
          if (delTarget) remove(delTarget);
          setDelTarget(null);
        }}
      />
    </div>
  );
}

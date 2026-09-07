"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/input";
import { Field } from "@/components/field";
import { Badge } from "@/components/ui/badge";
import { Dialog } from "@/components/ui/dialog";
import { useConfirm } from "@/lib/use-confirm";
import { formatDate } from "@/lib/utils";
import { statusBadgeVariant } from "@/components/page";
import { Play, Check, XCircle, Trash2, Loader2 } from "lucide-react";

interface InspectionDetail {
  id: string; inspectionNumber: string; title: string;
  status: string; result: string | null;
  projectName: string; inspectorName: string | null;
  findings: string | null; complianceNotes: string | null; followUpActions: string | null;
  attachments: string[];
  scheduledDate: string;
  conductedDate: string | null; conductedByName: string | null;
}

const STATUS_LABELS: Record<string, string> = {
  SCHEDULED: "Scheduled", IN_PROGRESS: "In Progress", COMPLETED: "Completed", CANCELLED: "Cancelled",
};
const RESULT_LABELS: Record<string, string> = {
  PASSED: "Passed", PASSED_WITH_NOTES: "Passed with Notes", FAILED: "Failed", STOP_WORK: "Stop Work",
};
const RESULT_VARIANTS: Record<string, "default" | "warning" | "danger"> = {
  PASSED: "default", PASSED_WITH_NOTES: "warning", FAILED: "danger", STOP_WORK: "danger",
};

export function InspectionDetailClient({ inspection, canManage }: { inspection: InspectionDetail; canManage: boolean }) {
  const router = useRouter();
  const [confirm, confirmDialog] = useConfirm();
  const [acting, setActing] = useState<string | null>(null);
  const [showComplete, setShowComplete] = useState(false);
  const [result, setResult] = useState<"PASSED" | "PASSED_WITH_NOTES" | "FAILED" | "STOP_WORK">("PASSED");
  const [findings, setFindings] = useState(inspection.findings ?? "");
  const [complianceNotes, setComplianceNotes] = useState(inspection.complianceNotes ?? "");
  const [followUpActions, setFollowUpActions] = useState(inspection.followUpActions ?? "");

  async function doAction(action: string, extra?: Record<string, unknown>) {
    setActing(action);
    try {
      const res = await fetch(`/api/safety/inspections/${inspection.id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ action, ...extra }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error ?? "Failed");
      toast.success(`Inspection ${action}d`);
      router.refresh();
    } catch (e: unknown) {
      toast.error(e instanceof Error ? e.message : "Failed");
    } finally {
      setActing(null);
      setShowComplete(false);
    }
  }

  const isTerminal = inspection.status === "COMPLETED" || inspection.status === "CANCELLED";

  return (
    <div className="space-y-4">
      {/* Status + result badges */}
      <div className="flex items-center gap-2">
        <Badge variant={statusBadgeVariant(inspection.status)}>
          {STATUS_LABELS[inspection.status] ?? inspection.status}
        </Badge>
        {inspection.result && (
          <Badge variant={RESULT_VARIANTS[inspection.result] ?? "default"}>
            {RESULT_LABELS[inspection.result] ?? inspection.result}
          </Badge>
        )}
      </div>

      {/* Project + inspector */}
      <div className="grid grid-cols-2 gap-3">
        <Field label="Project"><span className="text-body text-foreground">{inspection.projectName}</span></Field>
        <Field label="Inspector"><span className="text-body text-foreground">{inspection.inspectorName ?? "—"}</span></Field>
      </div>

      {/* Schedule */}
      <div className="grid grid-cols-2 gap-3">
        <Field label="Scheduled Date"><span className="text-body text-foreground">{formatDate(inspection.scheduledDate)}</span></Field>
        {inspection.conductedDate && (
          <Field label="Conducted Date"><span className="text-body text-foreground">{formatDate(inspection.conductedDate)}</span></Field>
        )}
      </div>

      {/* Findings */}
      {inspection.findings && (
        <div className="rounded-lg border p-3 space-y-1">
          <p className="text-label font-semibold text-muted-foreground">Findings</p>
          <p className="text-body text-foreground whitespace-pre-wrap">{inspection.findings}</p>
        </div>
      )}

      {/* Compliance notes */}
      {inspection.complianceNotes && (
        <div className="rounded-lg border p-3 space-y-1">
          <p className="text-label font-semibold text-muted-foreground">Compliance Notes</p>
          <p className="text-body text-foreground whitespace-pre-wrap">{inspection.complianceNotes}</p>
        </div>
      )}

      {/* Follow-up actions */}
      {inspection.followUpActions && (
        <div className="rounded-lg border p-3 space-y-1">
          <p className="text-label font-semibold text-muted-foreground">Follow-up Actions</p>
          <p className="text-body text-foreground whitespace-pre-wrap">{inspection.followUpActions}</p>
        </div>
      )}

      {/* Conducted by */}
      {inspection.conductedDate && inspection.conductedByName && (
        <p className="text-caption text-muted-foreground">
          Conducted on {formatDate(inspection.conductedDate)} by {inspection.conductedByName}
        </p>
      )}

      {/* Actions */}
      {canManage && (
        <div className="flex flex-wrap gap-2">
          {inspection.status === "SCHEDULED" && (
            <Button onClick={() => doAction("start")} disabled={acting !== null}>
              {acting === "start" ? <Loader2 className="h-4 w-4 animate-spin" /> : <Play className="h-4 w-4" />}
              Start Inspection
            </Button>
          )}
          {inspection.status === "IN_PROGRESS" && (
            <Button onClick={() => setShowComplete(true)} disabled={acting !== null}>
              <Check className="h-4 w-4" /> Complete
            </Button>
          )}
          {!isTerminal && (
            <Button variant="outline" onClick={() => doAction("cancel")} disabled={acting !== null}>
              <XCircle className="h-4 w-4" /> Cancel
            </Button>
          )}
          {!isTerminal && (
            <Button
              variant="outline"
              onClick={async () => {
                if (!(await confirm({ title: "Delete inspection?", description: `Delete "${inspection.title}"? This cannot be undone.` }))) return;
                await doAction("delete");
                router.push("/safety");
              }}
              disabled={acting !== null}
            >
              <Trash2 className="h-4 w-4" /> Delete
            </Button>
          )}
        </div>
      )}

      {/* Complete dialog */}
      {showComplete && (
        <Dialog
          open={showComplete}
          onOpenChange={setShowComplete}
          title="Complete Inspection"
          description="Record the inspection result and findings."
          footer={
            <>
              <Button variant="outline" onClick={() => setShowComplete(false)}>Cancel</Button>
              <Button
                onClick={() => {
                  if (!findings.trim()) { toast.error("Findings are required"); return; }
                  doAction("complete", { result, findings, complianceNotes, followUpActions });
                }}
                disabled={acting !== null}
              >
                {acting === "complete" ? <Loader2 className="h-4 w-4 animate-spin" /> : <Check className="h-4 w-4" />}
                Complete
              </Button>
            </>
          }
        >
          <div className="space-y-3">
            <Field label="Result">
              <select
                className="w-full rounded-md border border-input bg-background px-3 py-2 text-sm"
                value={result}
                onChange={(e) => setResult(e.target.value as typeof result)}
              >
                <option value="PASSED">Passed</option>
                <option value="PASSED_WITH_NOTES">Passed with Notes</option>
                <option value="FAILED">Failed</option>
                <option value="STOP_WORK">Stop Work</option>
              </select>
            </Field>
            <Field label="Findings">
              <Textarea
                value={findings}
                onChange={(e) => setFindings(e.target.value)}
                rows={4}
                placeholder="What did the inspection find?"
              />
            </Field>
            <Field label="Compliance Notes (optional)">
              <Textarea
                value={complianceNotes}
                onChange={(e) => setComplianceNotes(e.target.value)}
                rows={3}
                placeholder="Any compliance observations?"
              />
            </Field>
            <Field label="Follow-up Actions (optional)">
              <Textarea
                value={followUpActions}
                onChange={(e) => setFollowUpActions(e.target.value)}
                rows={3}
                placeholder="What needs to happen next?"
              />
            </Field>
          </div>
        </Dialog>
      )}

      {confirmDialog}
    </div>
  );
}

"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Input, Textarea } from "@/components/ui/input";
import { Field } from "@/components/field";
import { Badge } from "@/components/ui/badge";
import { Dialog } from "@/components/ui/dialog";
import { useConfirm } from "@/lib/use-confirm";
import { formatCurrency, formatDate } from "@/lib/utils";
import { Send, Check, Ban, Trash2, Loader2 } from "lucide-react";

interface IncidentDetail {
  id: string; incidentNumber: string; title: string; description: string;
  type: string; severity: string; status: string;
  projectName: string; location: string | null; wbsNodeName: string | null;
  peopleInvolved: string | null; injuredCount: number; fatalities: number;
  propertyDamageEstimate: number; incidentDate: string; incidentTime: string | null;
  rootCause: string | null; correctiveActions: string | null; closureNotes: string | null;
  attachments: string[];
  reportedAt: string; reportedByName: string | null;
  investigatedAt: string | null; investigatedByName: string | null;
  closedAt: string | null; closedByName: string | null;
}

const TYPE_LABELS: Record<string, string> = {
  ACCIDENT: "Accident", NEAR_MISS: "Near Miss", INJURY: "Injury", FATALITY: "Fatality",
  PROPERTY_DAMAGE: "Property Damage", ENVIRONMENTAL: "Environmental", FIRE: "Fire",
  STRUCTURAL: "Structural", OTHER: "Other",
};
const STATUS_VARIANTS: Record<string, "default" | "warning" | "success" | "danger"> = {
  REPORTED: "warning", UNDER_INVESTIGATION: "warning", INVESTIGATED: "default", CLOSED: "success", CANCELLED: "default",
};
const SEVERITY_VARIANTS: Record<string, "default" | "warning" | "danger"> = {
  FIRST_AID: "default", LOST_TIME: "warning", SERIOUS: "danger", FATAL: "danger", PROPERTY_ONLY: "default",
};

export function IncidentDetailClient({ incident, canManage }: { incident: IncidentDetail; canManage: boolean }) {
  const router = useRouter();
  const [confirm, confirmDialog] = useConfirm();
  const [acting, setActing] = useState<string | null>(null);
  const [showInvestigate, setShowInvestigate] = useState(false);
  const [investigateForm, setInvestigateForm] = useState({ rootCause: "", correctiveActions: "" });
  const [showClose, setShowClose] = useState(false);
  const [closureNotes, setClosureNotes] = useState("");

  async function doAction(action: string, extra?: Record<string, unknown>) {
    setActing(action);
    try {
      const res = await fetch(`/api/safety/incidents/${incident.id}`, { method: "PATCH", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ action, ...extra }) });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error ?? "Failed");
      toast.success(`Incident ${action}ed`); router.refresh();
    } catch (e: unknown) { toast.error(e instanceof Error ? e.message : "Failed"); }
    finally { setActing(null); setShowInvestigate(false); setShowClose(false); setInvestigateForm({ rootCause: "", correctiveActions: "" }); setClosureNotes(""); }
  }

  return (
    <div className="space-y-6">
      {/* Header card */}
      <div className="rounded-lg border border-border p-4 space-y-3">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-2">
            <Badge variant={SEVERITY_VARIANTS[incident.severity] ?? "default"}>{incident.severity.replace("_", " ")}</Badge>
            <Badge variant={STATUS_VARIANTS[incident.status] ?? "default"}>{incident.status.replace(/_/g, " ")}</Badge>
            <span className="text-xs text-muted-foreground">{TYPE_LABELS[incident.type] ?? incident.type}</span>
          </div>
          <span className="font-mono text-xs text-muted-foreground">{incident.incidentNumber}</span>
        </div>
        <p className="text-sm leading-relaxed">{incident.description}</p>
      </div>

      {/* Details grid */}
      <div className="grid gap-4 md:grid-cols-3">
        <DetailCard title="Location & People">
          <DetailRow label="Project" value={incident.projectName} />
          {incident.location && <DetailRow label="Location" value={incident.location} />}
          {incident.wbsNodeName && <DetailRow label="WBS Node" value={incident.wbsNodeName} />}
          {incident.peopleInvolved && <DetailRow label="People Involved" value={incident.peopleInvolved} />}
        </DetailCard>
        <DetailCard title="Date & Casualties">
          <DetailRow label="Date" value={formatDate(incident.incidentDate)} />
          {incident.incidentTime && <DetailRow label="Time" value={incident.incidentTime} />}
          <DetailRow label="Injured" value={String(incident.injuredCount)} />
          <DetailRow label="Fatalities" value={String(incident.fatalities)} />
          {incident.propertyDamageEstimate > 0 && <DetailRow label="Property Damage" value={formatCurrency(incident.propertyDamageEstimate)} />}
        </DetailCard>
        <DetailCard title="Timeline">
          <DetailRow label="Reported" value={`${formatDate(incident.reportedAt)}${incident.reportedByName ? ` by ${incident.reportedByName}` : ""}`} />
          {incident.investigatedAt && <DetailRow label="Investigated" value={`${formatDate(incident.investigatedAt)}${incident.investigatedByName ? ` by ${incident.investigatedByName}` : ""}`} />}
          {incident.closedAt && <DetailRow label="Closed" value={`${formatDate(incident.closedAt)}${incident.closedByName ? ` by ${incident.closedByName}` : ""}`} />}
        </DetailCard>
      </div>

      {/* Investigation */}
      {incident.rootCause && (
        <div className="rounded-lg border border-border p-4 space-y-3">
          <h3 className="text-sm font-semibold">Investigation</h3>
          <div><p className="text-xs font-medium text-muted-foreground mb-1">Root Cause</p><p className="text-sm">{incident.rootCause}</p></div>
          <div><p className="text-xs font-medium text-muted-foreground mb-1">Corrective Actions</p><p className="text-sm">{incident.correctiveActions}</p></div>
        </div>
      )}

      {/* Closure */}
      {incident.closureNotes && (
        <div className="rounded-lg border border-border p-4 space-y-2">
          <h3 className="text-sm font-semibold">Closure Notes</h3>
          <p className="text-sm">{incident.closureNotes}</p>
        </div>
      )}

      {/* Actions */}
      {canManage && (
        <div className="flex flex-wrap gap-2">
          {(incident.status === "REPORTED" || incident.status === "UNDER_INVESTIGATION") && (
            <Button size="sm" onClick={() => setShowInvestigate(true)}><Send className="mr-1 h-4 w-4" /> Investigate</Button>
          )}
          {incident.status === "INVESTIGATED" && (
            <Button size="sm" variant="default" onClick={() => setShowClose(true)}><Check className="mr-1 h-4 w-4" /> Close</Button>
          )}
          {incident.status === "REPORTED" && (
            <Button size="sm" variant="ghost" onClick={() => doAction("cancel")} disabled={acting === "cancel"}>{acting === "cancel" ? <Loader2 className="mr-1 h-4 w-4 animate-spin" /> : <Ban className="mr-1 h-4 w-4" />} Cancel</Button>
          )}
          {(incident.status === "REPORTED" || incident.status === "CANCELLED") && (
            <Button size="sm" variant="ghost" className="text-destructive" onClick={async () => { if (await confirm({ title: "Delete incident?", description: "This action cannot be undone.", confirmLabel: "Delete" })) { await doAction("delete"); router.push("/safety"); } }}>{acting === "delete" ? <Loader2 className="mr-1 h-4 w-4 animate-spin" /> : <Trash2 className="mr-1 h-4 w-4" />} Delete</Button>
          )}
        </div>
      )}
      {confirmDialog}

      {/* Investigate dialog */}
      {showInvestigate && (
        <Dialog open={showInvestigate} onOpenChange={setShowInvestigate} title="Investigate Incident" description="Document the root cause and corrective actions.">
          <form onSubmit={async (e) => { e.preventDefault(); if (!investigateForm.rootCause.trim() || !investigateForm.correctiveActions.trim()) { toast.error("Both fields are required"); return; } await doAction("investigate", investigateForm); }} className="space-y-4">
            <Field label="Root Cause" required><Textarea value={investigateForm.rootCause} onChange={(e) => setInvestigateForm((f) => ({ ...f, rootCause: e.target.value }))} rows={3} placeholder="Why did the incident happen?" required /></Field>
            <Field label="Corrective Actions" required><Textarea value={investigateForm.correctiveActions} onChange={(e) => setInvestigateForm((f) => ({ ...f, correctiveActions: e.target.value }))} rows={3} placeholder="What will prevent recurrence?" required /></Field>
            <div className="flex justify-end gap-2">
              <Button type="button" variant="ghost" onClick={() => setShowInvestigate(false)}>Cancel</Button>
              <Button type="submit" disabled={acting === "investigate"}>{acting === "investigate" ? <Loader2 className="mr-1 h-4 w-4 animate-spin" /> : <Send className="mr-1 h-4 w-4" />} Submit Investigation</Button>
            </div>
          </form>
        </Dialog>
      )}

      {/* Close dialog */}
      {showClose && (
        <Dialog open={showClose} onOpenChange={setShowClose} title="Close Incident" description="Add closure notes to finalize.">
          <form onSubmit={async (e) => { e.preventDefault(); if (!closureNotes.trim()) { toast.error("Closure notes required"); return; } await doAction("close", { closureNotes }); }} className="space-y-4">
            <Field label="Closure Notes" required><Textarea value={closureNotes} onChange={(e) => setClosureNotes(e.target.value)} rows={3} placeholder="How was the incident resolved?" required /></Field>
            <div className="flex justify-end gap-2">
              <Button type="button" variant="ghost" onClick={() => setShowClose(false)}>Cancel</Button>
              <Button type="submit" disabled={acting === "close"}>{acting === "close" ? <Loader2 className="mr-1 h-4 w-4 animate-spin" /> : <Check className="mr-1 h-4 w-4" />} Confirm Closure</Button>
            </div>
          </form>
        </Dialog>
      )}
    </div>
  );
}

function DetailCard({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <div className="rounded-lg border border-border p-4 space-y-2">
      <h3 className="text-sm font-semibold">{title}</h3>
      <div className="space-y-1.5">{children}</div>
    </div>
  );
}
function DetailRow({ label, value }: { label: string; value: string }) {
  return (
    <div className="flex items-start justify-between gap-2">
      <span className="text-xs text-muted-foreground">{label}</span>
      <span className="text-sm text-right">{value}</span>
    </div>
  );
}

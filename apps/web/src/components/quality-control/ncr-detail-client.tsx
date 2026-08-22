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
import { formatDate } from "@/lib/utils";
import { Send, Check, X, Ban, Trash2, Play, ShieldCheck, Loader2, AlertTriangle } from "lucide-react";

interface NcrDetail {
  id: string;
  ncrNumber: string;
  title: string;
  description: string;
  category: string;
  severity: string;
  status: string;
  projectName: string;
  location: string | null;
  wbsNodeName: string | null;
  boqItemSerial: string | null;
  boqItemDescription: string | null;
  responsibleParty: string | null;
  subcontractorName: string | null;
  attachments: string[];
  reviewNotes: string | null;
  closureNotes: string | null;
  raisedAt: string;
  raisedByName: string | null;
  reviewedAt: string | null;
  reviewedByName: string | null;
  closedAt: string | null;
  closedByName: string | null;
  capa: {
    id: string; capaNumber: string; status: string;
    rootCause: string; correctiveAction: string;
    correctiveDueDate: string | null; correctiveDoneAt: string | null; correctiveDoneByName: string | null;
    preventiveAction: string;
    preventiveDueDate: string | null; preventiveDoneAt: string | null; preventiveDoneByName: string | null;
    verificationMethod: string | null; verificationNotes: string | null;
    verifiedAt: string | null; verifiedByName: string | null;
    closureNotes: string | null; closedAt: string | null; closedByName: string | null;
  } | null;
}

const CATEGORY_LABELS: Record<string, string> = {
  MATERIAL: "Material", WORKMANSHIP: "Workmanship", DESIGN: "Design",
  DOCUMENT: "Document", PROCESS: "Process", SAFETY: "Safety", OTHER: "Other",
};

const STATUS_VARIANTS: Record<string, "default" | "warning" | "success" | "danger"> = {
  OPEN: "warning", UNDER_REVIEW: "warning", CAPA_REQUIRED: "warning",
  ACCEPTED: "success", REJECTED: "danger", CLOSED: "success", CANCELLED: "default",
};

const SEVERITY_VARIANTS: Record<string, "danger" | "warning" | "default"> = {
  CRITICAL: "danger", MAJOR: "warning", MINOR: "default", OBSERVATION: "default",
};

export function NcrDetailClient({ ncr, canManage }: { ncr: NcrDetail; canManage: boolean }) {
  const router = useRouter();
  const [confirm, confirmDialog] = useConfirm();
  const [acting, setActing] = useState<string | null>(null);
  const [showReview, setShowReview] = useState(false);
  const [reviewForm, setReviewForm] = useState({ outcome: "CAPA_REQUIRED" as "CAPA_REQUIRED" | "ACCEPTED" | "REJECTED", reviewNotes: "" });
  const [showClose, setShowClose] = useState(false);
  const [closureNotes, setClosureNotes] = useState("");
  const [showCapa, setShowCapa] = useState(false);
  const [capaForm, setCapaForm] = useState({ rootCause: "", correctiveAction: "", preventiveAction: "", correctiveDueDate: "", preventiveDueDate: "" });
  const [showVerify, setShowVerify] = useState(false);
  const [verifyForm, setVerifyForm] = useState({ verificationMethod: "", verificationNotes: "", effective: true });
  const [showCapaClose, setShowCapaClose] = useState(false);
  const [capaClosureNotes, setCapaClosureNotes] = useState("");

  async function ncrAction(action: string, extra?: Record<string, unknown>) {
    setActing(action);
    try {
      const res = await fetch(`/api/quality-control/ncr/${ncr.id}`, { method: "PATCH", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ action, ...extra }) });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error ?? "Failed");
      toast.success(`NCR ${action}ed`);
      router.refresh();
    } catch (err: unknown) {
      toast.error(err instanceof Error ? err.message : "Failed");
    } finally {
      setActing(null); setShowReview(false); setShowClose(false);
      setReviewForm({ outcome: "CAPA_REQUIRED", reviewNotes: "" }); setClosureNotes("");
    }
  }

  async function capaAction(action: string, extra?: Record<string, unknown>) {
    if (!ncr.capa) return;
    setActing(action);
    try {
      const res = await fetch(`/api/quality-control/capa/${ncr.capa.id}`, { method: "PATCH", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ action, ...extra }) });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error ?? "Failed");
      toast.success(`CAPA ${action}`);
      router.refresh();
    } catch (err: unknown) {
      toast.error(err instanceof Error ? err.message : "Failed");
    } finally {
      setActing(null); setShowVerify(false); setShowCapaClose(false);
      setVerifyForm({ verificationMethod: "", verificationNotes: "", effective: true }); setCapaClosureNotes("");
    }
  }

  async function createCapa() {
    if (!capaForm.rootCause.trim() || !capaForm.correctiveAction.trim() || !capaForm.preventiveAction.trim()) {
      toast.error("Root cause, corrective action, and preventive action are all required"); return;
    }
    setActing("create_capa");
    try {
      const res = await fetch("/api/quality-control/capa", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ ncrId: ncr.id, rootCause: capaForm.rootCause.trim(), correctiveAction: capaForm.correctiveAction.trim(), preventiveAction: capaForm.preventiveAction.trim(), correctiveDueDate: capaForm.correctiveDueDate || null, preventiveDueDate: capaForm.preventiveDueDate || null }) });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error ?? "Failed");
      toast.success("CAPA created"); setShowCapa(false); router.refresh();
    } catch (err: unknown) {
      toast.error(err instanceof Error ? err.message : "Failed");
    } finally { setActing(null); }
  }

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="rounded-lg border border-border p-4 space-y-3">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-3">
            <span className="font-mono text-sm text-muted-foreground">{ncr.ncrNumber}</span>
            <Badge variant={SEVERITY_VARIANTS[ncr.severity] ?? "default"}>{ncr.severity}</Badge>
            <Badge variant={STATUS_VARIANTS[ncr.status] ?? "default"}>{ncr.status}</Badge>
          </div>
          <div className="text-sm text-muted-foreground">{CATEGORY_LABELS[ncr.category] ?? ncr.category}</div>
        </div>
        <p className="text-sm text-muted-foreground">{ncr.description}</p>
        <div className="flex flex-wrap gap-4 text-xs text-muted-foreground">
          <span>Project: <span className="font-medium text-foreground">{ncr.projectName}</span></span>
          {ncr.location && <span>Location: <span className="font-medium text-foreground">{ncr.location}</span></span>}
          {ncr.responsibleParty && <span>Responsible: <span className="font-medium text-foreground">{ncr.responsibleParty}</span></span>}
          {ncr.subcontractorName && <span>Subcontractor: <span className="font-medium text-foreground">{ncr.subcontractorName}</span></span>}
          {ncr.wbsNodeName && <span>WBS: <span className="font-medium text-foreground">{ncr.wbsNodeName}</span></span>}
          {ncr.boqItemSerial && <span>BOQ: <span className="font-medium text-foreground">{ncr.boqItemSerial} — {ncr.boqItemDescription}</span></span>}
        </div>
      </div>

      {/* Timeline */}
      <div className="rounded-lg border border-border p-4">
        <h3 className="text-sm font-semibold mb-3">Timeline</h3>
        <div className="space-y-2">
          <TimelineRow label="Raised" date={ncr.raisedAt} name={ncr.raisedByName} />
          {ncr.reviewedAt && <TimelineRow label="Reviewed" date={ncr.reviewedAt} name={ncr.reviewedByName} />}
          {ncr.closedAt && <TimelineRow label="Closed" date={ncr.closedAt} name={ncr.closedByName} />}
        </div>
        {ncr.reviewNotes && (
          <div className="mt-3 rounded-md bg-muted p-3">
            <p className="text-xs font-semibold text-muted-foreground mb-1">Review Notes</p>
            <p className="text-sm">{ncr.reviewNotes}</p>
          </div>
        )}
        {ncr.closureNotes && (
          <div className="mt-2 rounded-md bg-muted p-3">
            <p className="text-xs font-semibold text-muted-foreground mb-1">Closure Notes</p>
            <p className="text-sm">{ncr.closureNotes}</p>
          </div>
        )}
      </div>

      {/* CAPA section */}
      {ncr.capa ? (
        <CapaSection capa={ncr.capa} />
      ) : ncr.status === "CAPA_REQUIRED" && canManage ? (
        <div className="rounded-lg border border-border p-4">
          <div className="flex items-center gap-2 mb-2">
            <ShieldCheck className="h-5 w-5 text-warning" />
            <h3 className="text-sm font-semibold">CAPA Required</h3>
          </div>
          <p className="text-sm text-muted-foreground mb-3">Create a Corrective And Preventive Action plan for this NCR.</p>
          <Button onClick={() => setShowCapa(true)}><ShieldCheck className="mr-1 h-4 w-4" /> Create CAPA</Button>
        </div>
      ) : null}

      {/* NCR actions */}
      {canManage && (
        <div className="flex flex-wrap gap-2">
          {(ncr.status === "OPEN" || ncr.status === "UNDER_REVIEW") && (
            <Button onClick={() => setShowReview(true)} disabled={acting === "review"}>
              {acting === "review" ? <Loader2 className="mr-1 h-4 w-4 animate-spin" /> : <Send className="mr-1 h-4 w-4" />} Review
            </Button>
          )}
          {["CAPA_REQUIRED", "ACCEPTED", "REJECTED"].includes(ncr.status) && (
            <Button onClick={() => setShowClose(true)} disabled={acting === "close"}>
              {acting === "close" ? <Loader2 className="mr-1 h-4 w-4 animate-spin" /> : <Check className="mr-1 h-4 w-4" />} Close NCR
            </Button>
          )}
          {ncr.status === "OPEN" && (
            <Button variant="outline" onClick={() => ncrAction("cancel")} disabled={acting === "cancel"}>
              <Ban className="mr-1 h-4 w-4" /> Cancel
            </Button>
          )}
          {(ncr.status === "OPEN" || ncr.status === "CANCELLED") && (
            <Button variant="ghost" onClick={async () => {
              const ok = await confirm({ title: "Delete NCR?", description: "This cannot be undone.", confirmLabel: "Delete", variant: "destructive" });
              if (!ok) return;
              await ncrAction("delete"); router.push("/quality-control");
            }} disabled={acting === "delete"}>
              {acting === "delete" ? <Loader2 className="mr-1 h-4 w-4 animate-spin" /> : <Trash2 className="mr-1 h-4 w-4" />} Delete
            </Button>
          )}
        </div>
      )}

      {/* CAPA actions */}
      {canManage && ncr.capa && (
        <div className="flex flex-wrap gap-2">
          {ncr.capa.status === "DRAFT" && (
            <Button onClick={() => capaAction("start")} disabled={acting === "start"}>
              {acting === "start" ? <Loader2 className="mr-1 h-4 w-4 animate-spin" /> : <Play className="mr-1 h-4 w-4" />} Start CAPA
            </Button>
          )}
          {ncr.capa.status === "IN_PROGRESS" && !ncr.capa.correctiveDoneAt && (
            <Button onClick={() => capaAction("corrective_done")} disabled={acting === "corrective_done"}>
              {acting === "corrective_done" ? <Loader2 className="mr-1 h-4 w-4 animate-spin" /> : <Check className="mr-1 h-4 w-4" />} Corrective Done
            </Button>
          )}
          {ncr.capa.status === "IN_PROGRESS" && ncr.capa.correctiveDoneAt && !ncr.capa.preventiveDoneAt && (
            <Button onClick={() => capaAction("preventive_done")} disabled={acting === "preventive_done"}>
              {acting === "preventive_done" ? <Loader2 className="mr-1 h-4 w-4 animate-spin" /> : <Check className="mr-1 h-4 w-4" />} Preventive Done
            </Button>
          )}
          {ncr.capa.status === "VERIFICATION" && (
            <Button onClick={() => setShowVerify(true)} disabled={acting === "verify"}>
              {acting === "verify" ? <Loader2 className="mr-1 h-4 w-4 animate-spin" /> : <ShieldCheck className="mr-1 h-4 w-4" />} Verify
            </Button>
          )}
          {ncr.capa.status === "VERIFIED" && (
            <Button onClick={() => setShowCapaClose(true)} disabled={acting === "close"}>
              {acting === "close" ? <Loader2 className="mr-1 h-4 w-4 animate-spin" /> : <Check className="mr-1 h-4 w-4" />} Close CAPA
            </Button>
          )}
          {ncr.capa.status === "REJECTED" && (
            <Button onClick={() => capaAction("start")} disabled={acting === "start"}>
              {acting === "start" ? <Loader2 className="mr-1 h-4 w-4 animate-spin" /> : <Play className="mr-1 h-4 w-4" />} Restart CAPA
            </Button>
          )}
        </div>
      )}

      {/* Dialogs */}
      {showReview && (
        <Dialog open={showReview} onOpenChange={setShowReview} title="Review NCR" description="Record your review findings and decision.">
          <div className="space-y-3">
            <Field label="Outcome" required>
              <select className="w-full h-9 rounded-md border border-border bg-background px-3 text-sm" value={reviewForm.outcome} onChange={(e) => setReviewForm((f) => ({ ...f, outcome: e.target.value as any }))}>
                <option value="CAPA_REQUIRED">CAPA Required</option>
                <option value="ACCEPTED">Accepted (with concession)</option>
                <option value="REJECTED">Rejected (rework required)</option>
              </select>
            </Field>
            <Field label="Review Notes" required>
              <Textarea value={reviewForm.reviewNotes} onChange={(e) => setReviewForm((f) => ({ ...f, reviewNotes: e.target.value }))} rows={3} placeholder="Findings from the review…" />
            </Field>
            <div className="flex justify-end gap-2">
              <Button variant="ghost" onClick={() => setShowReview(false)}>Cancel</Button>
              <Button onClick={() => { if (!reviewForm.reviewNotes.trim()) { toast.error("Review notes required"); return; } ncrAction("review", { outcome: reviewForm.outcome, reviewNotes: reviewForm.reviewNotes }); }} disabled={acting === "review"}>
                {acting === "review" ? <Loader2 className="mr-1 h-4 w-4 animate-spin" /> : <Send className="mr-1 h-4 w-4" />} Submit Review
              </Button>
            </div>
          </div>
        </Dialog>
      )}

      {showClose && (
        <Dialog open={showClose} onOpenChange={setShowClose} title="Close NCR" description="Record how the non-conformance was resolved.">
          <div className="space-y-3">
            <Field label="Closure Notes" required>
              <Textarea value={closureNotes} onChange={(e) => setClosureNotes(e.target.value)} rows={3} placeholder="How was the non-conformance resolved?" />
            </Field>
            <div className="flex justify-end gap-2">
              <Button variant="ghost" onClick={() => setShowClose(false)}>Cancel</Button>
              <Button onClick={() => { if (!closureNotes.trim()) { toast.error("Closure notes required"); return; } ncrAction("close", { closureNotes }); }} disabled={acting === "close"}>
                {acting === "close" ? <Loader2 className="mr-1 h-4 w-4 animate-spin" /> : <Check className="mr-1 h-4 w-4" />} Confirm Closure
              </Button>
            </div>
          </div>
        </Dialog>
      )}

      {showCapa && (
        <Dialog open={showCapa} onOpenChange={setShowCapa} title="Create CAPA" description="Corrective And Preventive Action plan." className="max-w-2xl">
          <div className="space-y-3">
            <Field label="Root Cause" required>
              <Textarea value={capaForm.rootCause} onChange={(e) => setCapaForm((f) => ({ ...f, rootCause: e.target.value }))} rows={2} placeholder="Why did the non-conformance happen?" />
            </Field>
            <Field label="Corrective Action" required>
              <Textarea value={capaForm.correctiveAction} onChange={(e) => setCapaForm((f) => ({ ...f, correctiveAction: e.target.value }))} rows={2} placeholder="What will be done to fix it?" />
            </Field>
            <Field label="Preventive Action" required>
              <Textarea value={capaForm.preventiveAction} onChange={(e) => setCapaForm((f) => ({ ...f, preventiveAction: e.target.value }))} rows={2} placeholder="What will prevent recurrence?" />
            </Field>
            <div className="grid gap-3 sm:grid-cols-2">
              <Field label="Corrective Due Date">
                <Input type="date" value={capaForm.correctiveDueDate} onChange={(e) => setCapaForm((f) => ({ ...f, correctiveDueDate: e.target.value }))} />
              </Field>
              <Field label="Preventive Due Date">
                <Input type="date" value={capaForm.preventiveDueDate} onChange={(e) => setCapaForm((f) => ({ ...f, preventiveDueDate: e.target.value }))} />
              </Field>
            </div>
            <div className="flex justify-end gap-2">
              <Button variant="ghost" onClick={() => setShowCapa(false)}>Cancel</Button>
              <Button onClick={createCapa} disabled={acting === "create_capa"}>
                {acting === "create_capa" ? <Loader2 className="mr-1 h-4 w-4 animate-spin" /> : <ShieldCheck className="mr-1 h-4 w-4" />} Create CAPA
              </Button>
            </div>
          </div>
        </Dialog>
      )}

      {showVerify && (
        <Dialog open={showVerify} onOpenChange={setShowVerify} title="Verify CAPA" description="Check if the corrective and preventive actions were effective.">
          <div className="space-y-3">
            <Field label="Verification Method" required>
              <Input value={verifyForm.verificationMethod} onChange={(e) => setVerifyForm((f) => ({ ...f, verificationMethod: e.target.value }))} placeholder="e.g. Site inspection, test report" />
            </Field>
            <Field label="Verification Notes" required>
              <Textarea value={verifyForm.verificationNotes} onChange={(e) => setVerifyForm((f) => ({ ...f, verificationNotes: e.target.value }))} rows={3} placeholder="Was the corrective action effective?" />
            </Field>
            <div className="flex justify-end gap-2">
              <Button variant="ghost" onClick={() => setShowVerify(false)}>Cancel</Button>
              <Button variant="destructive" onClick={() => { if (!verifyForm.verificationMethod.trim() || !verifyForm.verificationNotes.trim()) { toast.error("All fields required"); return; } capaAction("verify", { ...verifyForm, effective: false }); }} disabled={acting === "verify"}>
                <X className="mr-1 h-4 w-4" /> Not Effective
              </Button>
              <Button onClick={() => { if (!verifyForm.verificationMethod.trim() || !verifyForm.verificationNotes.trim()) { toast.error("All fields required"); return; } capaAction("verify", { ...verifyForm, effective: true }); }} disabled={acting === "verify"}>
                {acting === "verify" ? <Loader2 className="mr-1 h-4 w-4 animate-spin" /> : <Check className="mr-1 h-4 w-4" />} Effective
              </Button>
            </div>
          </div>
        </Dialog>
      )}

      {showCapaClose && (
        <Dialog open={showCapaClose} onOpenChange={setShowCapaClose} title="Close CAPA" description="Final closure of the CAPA.">
          <div className="space-y-3">
            <Field label="Closure Notes" required>
              <Textarea value={capaClosureNotes} onChange={(e) => setCapaClosureNotes(e.target.value)} rows={3} placeholder="Final closure notes…" />
            </Field>
            <div className="flex justify-end gap-2">
              <Button variant="ghost" onClick={() => setShowCapaClose(false)}>Cancel</Button>
              <Button onClick={() => { if (!capaClosureNotes.trim()) { toast.error("Closure notes required"); return; } capaAction("close", { closureNotes: capaClosureNotes }); }} disabled={acting === "close"}>
                {acting === "close" ? <Loader2 className="mr-1 h-4 w-4 animate-spin" /> : <Check className="mr-1 h-4 w-4" />} Confirm Closure
              </Button>
            </div>
          </div>
        </Dialog>
      )}

      {confirmDialog}
    </div>
  );
}

function CapaSection({ capa }: { capa: NonNullable<NcrDetail["capa"]> }) {
  return (
    <div className="rounded-lg border border-border overflow-hidden">
      <div className="border-b border-border bg-muted/50 px-4 py-2 flex items-center justify-between">
        <div className="flex items-center gap-2">
          <ShieldCheck className="h-4 w-4 text-success" />
          <span className="font-mono text-sm font-medium">{capa.capaNumber}</span>
        </div>
        <Badge variant={STATUS_VARIANTS[capa.status] ?? "default"}>{capa.status}</Badge>
      </div>
      <div className="p-4 space-y-4">
        <CapaField label="Root Cause" value={capa.rootCause} />
        <CapaField label="Corrective Action" value={capa.correctiveAction} done={!!capa.correctiveDoneAt} doneByName={capa.correctiveDoneByName} doneAt={capa.correctiveDoneAt} dueDate={capa.correctiveDueDate} />
        <CapaField label="Preventive Action" value={capa.preventiveAction} done={!!capa.preventiveDoneAt} doneByName={capa.preventiveDoneByName} doneAt={capa.preventiveDoneAt} dueDate={capa.preventiveDueDate} />
        {capa.verificationMethod && <CapaField label="Verification Method" value={capa.verificationMethod} />}
        {capa.verificationNotes && <CapaField label="Verification Notes" value={capa.verificationNotes} done={!!capa.verifiedAt} doneByName={capa.verifiedByName} doneAt={capa.verifiedAt} />}
        {capa.closureNotes && <CapaField label="Closure Notes" value={capa.closureNotes} done={!!capa.closedAt} doneByName={capa.closedByName} doneAt={capa.closedAt} />}
      </div>
    </div>
  );
}

function CapaField({ label, value, done, doneByName, doneAt, dueDate }: { label: string; value: string; done?: boolean; doneByName?: string | null; doneAt?: string | null; dueDate?: string | null }) {
  return (
    <div>
      <div className="flex items-center gap-1.5">
        <span className="text-xs font-semibold text-muted-foreground uppercase">{label}</span>
        {done && <Check className="h-3.5 w-3.5 text-success" />}
      </div>
      <p className="text-sm mt-0.5">{value}</p>
      {(doneAt || dueDate) && (
        <p className="text-xs text-muted-foreground mt-0.5">
          {doneAt ? `Done ${formatDate(doneAt)}${doneByName ? ` by ${doneByName}` : ""}` : dueDate ? `Due ${formatDate(dueDate)}` : ""}
        </p>
      )}
    </div>
  );
}

function TimelineRow({ label, date, name }: { label: string; date: string; name?: string | null }) {
  return (
    <div className="flex items-center justify-between text-sm">
      <div>
        <span className="font-medium">{label}</span>
        {name && <span className="text-muted-foreground"> — by {name}</span>}
      </div>
      <span className="text-muted-foreground tabular-nums">{formatDate(date)}</span>
    </div>
  );
}

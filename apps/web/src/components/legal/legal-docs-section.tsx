"use client";

import { useState, useEffect, useCallback, useMemo } from "react";
import { useRouter } from "next/navigation";
import { toast } from "sonner";
import {
  FileText, Upload, X, Plus, Trash2, Loader2, CheckCircle2,
  Clock, AlertTriangle, XCircle, RefreshCw, FileCheck2, Download,
  ChevronDown, ChevronRight, ShieldCheck, Building2, MapPin,
  CircleDot, Lock, AlertCircle,
} from "lucide-react";
import { Dialog } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input, Label, Select, Textarea } from "@/components/ui/input";
import { formatCurrency, formatDate, cn } from "@/lib/utils";
import {
  LEGAL_DOC_FLOW, LEGAL_DOC_FLOW_MAP, STAGE_LABELS, STAGE_ORDER,
  getFlowStepsForContext, isPrerequisiteMet, daysUntilExpiry, getExpiryStatus,
  type LegalDocFlowStep,
} from "@/lib/legal-doc-flow";

export type LegalDocType = string;
export type LegalDocStatus =
  | "NOT_REQUIRED" | "PENDING" | "APPROVED" | "REJECTED" | "EXPIRED" | "RENEWAL_DUE";

export interface LegalDocRow {
  id: string;
  landPurchaseId: string | null;
  projectId: string | null;
  type: LegalDocType;
  title: string;
  authority: string | null;
  status: LegalDocStatus;
  appliesTo: "LAND" | "PROJECT" | "BOTH";
  docNumber: string | null;
  sortOrder: number;
  prerequisiteType: string | null;
  obtained: boolean;
  applicationDate: string | null;
  issueDate: string | null;
  validFrom: string | null;
  validTill: string | null;
  amount: number | null;
  expectedRegistryDate: string | null;
  documentUrl: string | null;
  documentName: string | null;
  notes: string | null;
  createdAt: string;
}

const STATUS_CONFIG: Record<LegalDocStatus, { label: string; icon: typeof Clock; className: string }> = {
  NOT_REQUIRED: { label: "Not Required", icon: XCircle, className: "bg-gray-100 text-gray-600" },
  PENDING: { label: "Pending", icon: Clock, className: "bg-amber-100 text-amber-700" },
  APPROVED: { label: "Approved", icon: CheckCircle2, className: "bg-green-100 text-green-700" },
  REJECTED: { label: "Rejected", icon: XCircle, className: "bg-red-100 text-red-700" },
  EXPIRED: { label: "Expired", icon: AlertTriangle, className: "bg-red-100 text-red-700" },
  RENEWAL_DUE: { label: "Renewal Due", icon: RefreshCw, className: "bg-orange-100 text-orange-700" },
};

const STAGE_ICONS: Record<string, typeof MapPin> = {
  FEASIBILITY: MapPin,
  SANCTION: Building2,
  POST_COMPLETION: ShieldCheck,
};

/**
 * LegalDocsSection — guided sequential checklist for Indian construction
 * permissions, licenses, NOCs, certificates, and ATS.
 *
 * Shows a stage-grouped checklist with yes/no branching:
 *   - Each step asks "Do you have this permission?" (Yes / No / Not Required)
 *   - If Yes → expand sub-form (authority, dates, upload, amount)
 *   - If No → that chapter ends; downstream steps with this as prerequisite are locked
 *   - If Not Required → skip and unlock downstream
 *
 * Pass either `landPurchaseId` or `projectId` to scope the documents.
 * Pass `context="LAND"` or `context="PROJECT"` to filter the flow steps.
 */
export function LegalDocsSection({
  docs: initialDocs,
  landPurchaseId,
  projectId,
  canManage,
  context,
}: {
  docs: LegalDocRow[];
  landPurchaseId?: string;
  projectId?: string;
  canManage: boolean;
  context: "LAND" | "PROJECT";
}) {
  const router = useRouter();
  const [docs, setDocs] = useState(initialDocs);
  const [showForm, setShowForm] = useState(false);
  const [editing, setEditing] = useState<LegalDocRow | null>(null);
  const [expandedSteps, setExpandedSteps] = useState<Set<string>>(new Set());

  useEffect(() => { setDocs(initialDocs); }, [initialDocs]);

  const handleSaved = useCallback(() => {
    setShowForm(false);
    setEditing(null);
    router.refresh();
  }, [router]);

  const handleDelete = async (id: string) => {
    if (!confirm("Delete this legal document?")) return;
    try {
      const res = await fetch(`/api/legal-documents/${id}`, { method: "DELETE" });
      if (!res.ok) {
        const data = await res.json();
        throw new Error(data.error ?? "Failed to delete");
      }
      toast.success("Legal document deleted");
      router.refresh();
    } catch (err: unknown) {
      toast.error(err instanceof Error ? err.message : "Failed to delete");
    }
  };

  // Toggle yes/no for a step — creates or updates the doc
  const handleToggleObtained = async (step: LegalDocFlowStep, currentDoc: LegalDocRow | undefined, value: boolean) => {
    if (!canManage) return;
    try {
      if (currentDoc) {
        // Update existing
        const res = await fetch(`/api/legal-documents/${currentDoc.id}`, {
          method: "PATCH",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            obtained: value,
            status: value ? "APPROVED" : "PENDING",
          }),
        });
        if (!res.ok) { const d = await res.json(); throw new Error(d.error ?? "Failed"); }
        toast.success(value ? `${step.label} marked as obtained` : `${step.label} marked as not obtained`);
        router.refresh();
      } else {
        // Create new doc with defaults from the flow step
        const res = await fetch("/api/legal-documents", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            landPurchaseId: landPurchaseId ?? null,
            projectId: projectId ?? null,
            type: step.type,
            title: step.label,
            authority: step.defaultAuthority,
            status: value ? "APPROVED" : "PENDING",
            appliesTo: step.appliesTo,
            sortOrder: LEGAL_DOC_FLOW.indexOf(step),
            prerequisiteType: step.prerequisite,
            obtained: value,
          }),
        });
        if (!res.ok) { const d = await res.json(); throw new Error(d.error ?? "Failed"); }
        toast.success(value ? `${step.label} added and marked as obtained` : `${step.label} added`);
        router.refresh();
      }
      if (value) setExpandedSteps((s) => new Set(s).add(step.type));
    } catch (err: unknown) {
      toast.error(err instanceof Error ? err.message : "Failed to update");
    }
  };

  // Mark a step as not required
  const handleMarkNotRequired = async (step: LegalDocFlowStep, currentDoc: LegalDocRow | undefined) => {
    if (!canManage) return;
    try {
      if (currentDoc) {
        const res = await fetch(`/api/legal-documents/${currentDoc.id}`, {
          method: "PATCH",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ status: "NOT_REQUIRED", obtained: false }),
        });
        if (!res.ok) { const d = await res.json(); throw new Error(d.error ?? "Failed"); }
      } else {
        const res = await fetch("/api/legal-documents", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            landPurchaseId: landPurchaseId ?? null,
            projectId: projectId ?? null,
            type: step.type,
            title: step.label,
            authority: step.defaultAuthority,
            status: "NOT_REQUIRED",
            appliesTo: step.appliesTo,
            sortOrder: LEGAL_DOC_FLOW.indexOf(step),
            prerequisiteType: step.prerequisite,
            obtained: false,
          }),
        });
        if (!res.ok) { const d = await res.json(); throw new Error(d.error ?? "Failed"); }
      }
      toast.success(`${step.label} marked as not required`);
      router.refresh();
    } catch (err: unknown) {
      toast.error(err instanceof Error ? err.message : "Failed to update");
    }
  };

  // Build a map of type → doc for quick lookup
  const docsByType = useMemo(() => {
    const m: Record<string, LegalDocRow> = {};
    for (const d of docs) m[d.type] = d;
    return m;
  }, [docs]);

  // Get flow steps for this context
  const flowSteps = useMemo(() => getFlowStepsForContext(context), [context]);

  // Group by stage
  const stepsByStage = useMemo(() => {
    const m: Record<string, LegalDocFlowStep[]> = {};
    for (const step of flowSteps) {
      (m[step.stage] ??= []).push(step);
    }
    return m;
  }, [flowSteps]);

  // Progress calculation
  const requiredSteps = flowSteps.filter((s) => !s.isOptional);
  const obtainedRequired = requiredSteps.filter((s) => {
    const d = docsByType[s.type];
    return d?.obtained && d?.status === "APPROVED";
  }).length;
  const progressPct = requiredSteps.length > 0 ? Math.round((obtainedRequired / requiredSteps.length) * 100) : 0;

  const toggleExpand = (type: string) => {
    setExpandedSteps((s) => {
      const next = new Set(s);
      if (next.has(type)) next.delete(type);
      else next.add(type);
      return next;
    });
  };

  return (
    <div className="space-y-4">
      {/* Header with progress */}
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-2">
          <ShieldCheck className="h-4 w-4 text-muted-foreground" />
          <h3 className="text-section font-semibold">Permissions, Legal & NOC</h3>
          <span className="rounded-full bg-muted px-2 py-0.5 text-caption text-muted-foreground">
            {obtainedRequired}/{requiredSteps.length} required
          </span>
        </div>
        {canManage && (
          <Button size="sm" variant="outline" onClick={() => { setEditing(null); setShowForm(true); }}>
            <Plus className="mr-1 h-3.5 w-3.5" /> Add Custom
          </Button>
        )}
      </div>

      {/* Progress bar */}
      <div className="space-y-1">
        <div className="h-2 rounded-full bg-muted overflow-hidden">
          <div
            className={cn("h-full rounded-full transition-all", progressPct === 100 ? "bg-green-500" : "bg-brand")}
            style={{ width: `${progressPct}%` }}
          />
        </div>
        <div className="flex justify-between text-caption text-muted-foreground">
          <span>{progressPct}% of required permissions obtained</span>
          {progressPct === 100 && <span className="text-green-600 font-medium">All required permissions complete</span>}
        </div>
      </div>

      {/* Guided checklist by stage */}
      <div className="space-y-4">
        {STAGE_ORDER.map((stage) => {
          const steps = stepsByStage[stage];
          if (!steps || steps.length === 0) return null;
          const StageIcon = STAGE_ICONS[stage] ?? FileText;
          const stageObtained = steps.filter((s) => {
            const d = docsByType[s.type];
            return d?.obtained && d?.status === "APPROVED";
          }).length;

          return (
            <div key={stage} className="space-y-2">
              <div className="flex items-center gap-2 pb-1 border-b border-border">
                <StageIcon className="h-3.5 w-3.5 text-muted-foreground" />
                <h4 className="text-caption font-semibold uppercase tracking-wide text-muted-foreground">
                  {STAGE_LABELS[stage]}
                </h4>
                <span className="text-caption text-faint">
                  {stageObtained}/{steps.length}
                </span>
              </div>
              {steps.map((step) => {
                const doc = docsByType[step.type];
                const prereqMet = isPrerequisiteMet(step.prerequisite, docs, context);
                const isExpanded = expandedSteps.has(step.type);
                const isLocked = !prereqMet && step.prerequisite !== null;
                const expiryStatus = getExpiryStatus(doc?.validTill ?? null);
                const expiryDays = daysUntilExpiry(doc?.validTill ?? null);

                return (
                  <LegalChecklistRow
                    key={step.type}
                    step={step}
                    doc={doc}
                    isExpanded={isExpanded}
                    isLocked={isLocked}
                    canManage={canManage}
                    expiryStatus={expiryStatus}
                    expiryDays={expiryDays}
                    onToggleExpand={() => toggleExpand(step.type)}
                    onToggleObtained={(v) => handleToggleObtained(step, doc, v)}
                    onMarkNotRequired={() => handleMarkNotRequired(step, doc)}
                    onEdit={() => { setEditing(doc ?? null); setShowForm(true); }}
                    onDelete={() => doc && handleDelete(doc.id)}
                  />
                );
              })}
            </div>
          );
        })}
      </div>

      {/* Custom doc form */}
      {showForm && (
        <LegalDocFormDialog
          open={showForm}
          onOpenChange={(o) => { if (!o) { setShowForm(false); setEditing(null); } }}
          editing={editing}
          landPurchaseId={landPurchaseId}
          projectId={projectId}
          context={context}
          onSaved={handleSaved}
        />
      )}
    </div>
  );
}

// ─── Checklist Row (the yes/no branching unit) ───

function LegalChecklistRow({
  step, doc, isExpanded, isLocked, canManage, expiryStatus, expiryDays,
  onToggleExpand, onToggleObtained, onMarkNotRequired, onEdit, onDelete,
}: {
  step: LegalDocFlowStep;
  doc?: LegalDocRow;
  isExpanded: boolean;
  isLocked: boolean;
  canManage: boolean;
  expiryStatus: "ok" | "expiring" | "expired" | "none";
  expiryDays: number | null;
  onToggleExpand: () => void;
  onToggleObtained: (value: boolean) => void;
  onMarkNotRequired: () => void;
  onEdit: () => void;
  onDelete: () => void;
}) {
  const isObtained = doc?.obtained && doc?.status === "APPROVED";
  const isNotRequired = doc?.status === "NOT_REQUIRED";
  const isPending = doc && !isObtained && !isNotRequired;
  const statusCfg = doc ? STATUS_CONFIG[doc.status] : null;

  return (
    <div className={cn(
      "rounded-md border transition-colors",
      isLocked ? "border-border/50 bg-muted/20 opacity-60" : "border-border",
      isObtained && "border-green-200 bg-green-50/30",
      isNotRequired && "border-gray-200 bg-gray-50/30",
    )}>
      {/* Row header — clickable to expand */}
      <div className="flex items-start gap-2 p-3">
        <button
          onClick={onToggleExpand}
          disabled={isLocked}
          className="mt-0.5 shrink-0 rounded p-0.5 text-muted-foreground hover:bg-muted disabled:cursor-not-allowed disabled:opacity-30"
        >
          {isExpanded ? <ChevronDown className="h-3.5 w-3.5" /> : <ChevronRight className="h-3.5 w-3.5" />}
        </button>

        {/* Status icon */}
        <div className="mt-0.5 shrink-0">
          {isLocked ? (
            <Lock className="h-4 w-4 text-faint" />
          ) : isObtained ? (
            <CheckCircle2 className="h-4 w-4 text-green-600" />
          ) : isNotRequired ? (
            <CircleDot className="h-4 w-4 text-gray-400" />
          ) : isPending ? (
            <Clock className="h-4 w-4 text-amber-500" />
          ) : (
            <div className="h-4 w-4 rounded-full border-2 border-muted-foreground/30" />
          )}
        </div>

        {/* Title + description */}
        <div className="min-w-0 flex-1">
          <div className="flex items-center gap-2 flex-wrap">
            <span className="text-body font-medium">{step.label}</span>
            {step.isOptional && (
              <span className="rounded bg-muted px-1.5 py-0.5 text-[0.625rem] text-muted-foreground">Optional</span>
            )}
            {!step.isOptional && !isObtained && !isNotRequired && !isLocked && (
              <span className="rounded bg-red-50 px-1.5 py-0.5 text-[0.625rem] text-red-600 font-medium">Required</span>
            )}
            {statusCfg && doc && (
              <span className={cn("rounded-full px-2 py-0.5 text-[0.625rem] font-medium flex items-center gap-1", statusCfg.className)}>
                <statusCfg.icon className="h-2.5 w-2.5" />
                {statusCfg.label}
              </span>
            )}
          </div>
          {!isExpanded && (
            <p className="text-caption text-muted-foreground line-clamp-1 mt-0.5">
              {doc ? doc.title : step.description}
            </p>
          )}
          {/* Expiry warning */}
          {expiryStatus === "expired" && (
            <div className="flex items-center gap-1 mt-1 text-caption text-red-600 font-medium">
              <AlertTriangle className="h-3 w-3" /> Expired {Math.abs(expiryDays!)} days ago
            </div>
          )}
          {expiryStatus === "expiring" && (
            <div className="flex items-center gap-1 mt-1 text-caption text-orange-600 font-medium">
              <AlertCircle className="h-3 w-3" /> Expires in {expiryDays} days
            </div>
          )}
          {/* Prerequisite warning */}
          {isLocked && step.prerequisite && (
            <div className="flex items-center gap-1 mt-1 text-caption text-faint">
              <Lock className="h-3 w-3" />
              Requires {LEGAL_DOC_FLOW_MAP[step.prerequisite]?.label ?? step.prerequisite} first
            </div>
          )}
        </div>

        {/* Yes/No/Not Required buttons */}
        {canManage && !isLocked && (
          <div className="flex items-center gap-1 shrink-0">
            <button
              onClick={() => onToggleObtained(true)}
              className={cn(
                "rounded px-2 py-1 text-caption font-medium transition-colors",
                isObtained ? "bg-green-100 text-green-700" : "bg-muted text-muted-foreground hover:bg-green-50 hover:text-green-600",
              )}
            >
              Yes
            </button>
            <button
              onClick={() => onToggleObtained(false)}
              className={cn(
                "rounded px-2 py-1 text-caption font-medium transition-colors",
                isPending && !isObtained ? "bg-amber-100 text-amber-700" : "bg-muted text-muted-foreground hover:bg-amber-50 hover:text-amber-600",
              )}
            >
              No
            </button>
            {step.isOptional && (
              <button
                onClick={onMarkNotRequired}
                className={cn(
                  "rounded px-2 py-1 text-caption font-medium transition-colors",
                  isNotRequired ? "bg-gray-100 text-gray-600" : "bg-muted text-muted-foreground hover:bg-gray-50",
                )}
                title="Mark as not required"
              >
                N/A
              </button>
            )}
          </div>
        )}
      </div>

      {/* Expanded details */}
      {isExpanded && !isLocked && (
        <div className="border-t border-border px-3 pb-3 pt-2 space-y-2">
          <p className="text-caption text-muted-foreground">{step.description}</p>
          <div className="text-caption text-muted-foreground">
            <strong className="text-foreground">Typical Authority:</strong> {step.defaultAuthority}
            {step.typicalValidityMonths && (
              <span className="ml-2">· <strong className="text-foreground">Typical Validity:</strong> {step.typicalValidityMonths} months</span>
            )}
          </div>

          {doc ? (
            <>
              {/* Doc details grid */}
              <div className="grid grid-cols-2 gap-x-4 gap-y-1 text-caption text-muted-foreground mt-2">
                {doc.authority && <div>Authority: <strong className="text-foreground">{doc.authority}</strong></div>}
                {doc.docNumber && <div>Ref: <strong className="text-foreground">{doc.docNumber}</strong></div>}
                {doc.applicationDate && <div>Applied: <strong className="text-foreground">{formatDate(doc.applicationDate)}</strong></div>}
                {doc.issueDate && <div>Issued: <strong className="text-foreground">{formatDate(doc.issueDate)}</strong></div>}
                {doc.validFrom && <div>Valid From: <strong className="text-foreground">{formatDate(doc.validFrom)}</strong></div>}
                {doc.validTill && <div>Valid Till: <strong className="text-foreground">{formatDate(doc.validTill)}</strong></div>}
                {doc.amount != null && (
                  <div>{step.amountLabel ?? "Amount"}: <strong className="text-foreground">{formatCurrency(doc.amount)}</strong></div>
                )}
                {doc.expectedRegistryDate && (
                  <div>Expected Registry: <strong className="text-foreground">{formatDate(doc.expectedRegistryDate)}</strong></div>
                )}
              </div>

              {doc.notes && (
                <div className="text-caption text-muted-foreground italic">{doc.notes}</div>
              )}

              {/* Transfer duty → project cost bridge indicator */}
              {step.type === "TRANSFER_DUTY" && doc.amount != null && doc.amount > 0 && doc.projectId && isObtained && (
                <div className="flex items-center gap-1.5 rounded-md border border-green-200 bg-green-50/50 px-2.5 py-1.5 text-caption text-green-700">
                  <CheckCircle2 className="h-3 w-3" />
                  <span>Transfer duty of <strong>{formatCurrency(doc.amount)}</strong> auto-logged as a project cost (Transfer Duty).</span>
                </div>
              )}
              {step.type === "TRANSFER_DUTY" && doc.amount != null && doc.amount > 0 && !doc.projectId && (
                <div className="flex items-center gap-1.5 rounded-md border border-amber-200 bg-amber-50/50 px-2.5 py-1.5 text-caption text-amber-700">
                  <AlertCircle className="h-3 w-3" />
                  <span>Link this land to a project to auto-log the transfer duty as a project cost.</span>
                </div>
              )}

              {/* Actions */}
              <div className="flex items-center gap-2 pt-1">
                {doc.documentUrl && (
                  <a href={doc.documentUrl} target="_blank" rel="noreferrer"
                    className="flex items-center gap-1 text-caption text-brand hover:underline">
                    <Download className="h-3 w-3" />
                    {doc.documentName ?? "View document"}
                  </a>
                )}
                {canManage && (
                  <div className="ml-auto flex items-center gap-1">
                    <button onClick={onEdit} className="rounded p-1 text-muted-foreground hover:bg-muted hover:text-foreground" title="Edit details">
                      <FileText className="h-3.5 w-3.5" />
                    </button>
                    <button onClick={onDelete} className="rounded p-1 text-muted-foreground hover:bg-muted hover:text-danger" title="Delete">
                      <Trash2 className="h-3.5 w-3.5" />
                    </button>
                  </div>
                )}
              </div>
            </>
          ) : (
            <div className="text-caption text-faint italic mt-1">
              Click "Yes" to record this permission, or "No" to track it as pending.
            </div>
          )}
        </div>
      )}
    </div>
  );
}

// ─── Form Dialog (for editing details or adding custom docs) ───

function LegalDocFormDialog({
  open, onOpenChange, editing, landPurchaseId, projectId, context, onSaved,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  editing: LegalDocRow | null;
  landPurchaseId?: string;
  projectId?: string;
  context: "LAND" | "PROJECT";
  onSaved: () => void;
}) {
  const [saving, setSaving] = useState(false);
  const [uploading, setUploading] = useState(false);
  const [form, setForm] = useState({
    type: "OTHER" as LegalDocType,
    title: "",
    authority: "",
    status: "PENDING" as LegalDocStatus,
    appliesTo: context as "LAND" | "PROJECT" | "BOTH",
    docNumber: "",
    applicationDate: "",
    issueDate: "",
    validFrom: "",
    validTill: "",
    amount: "",
    expectedRegistryDate: "",
    notes: "",
    documentUrl: "" as string | null,
    documentName: "" as string | null,
  });

  useEffect(() => {
    if (editing) {
      setForm({
        type: editing.type,
        title: editing.title,
        authority: editing.authority ?? "",
        status: editing.status,
        appliesTo: editing.appliesTo,
        docNumber: editing.docNumber ?? "",
        applicationDate: editing.applicationDate ? editing.applicationDate.split("T")[0]! : "",
        issueDate: editing.issueDate ? editing.issueDate.split("T")[0]! : "",
        validFrom: editing.validFrom ? editing.validFrom.split("T")[0]! : "",
        validTill: editing.validTill ? editing.validTill.split("T")[0]! : "",
        amount: editing.amount?.toString() ?? "",
        expectedRegistryDate: editing.expectedRegistryDate ? editing.expectedRegistryDate.split("T")[0]! : "",
        notes: editing.notes ?? "",
        documentUrl: editing.documentUrl,
        documentName: editing.documentName,
      });
    } else {
      setForm({
        type: "OTHER", title: "", authority: "", status: "PENDING",
        appliesTo: context,
        docNumber: "", applicationDate: "", issueDate: "", validFrom: "", validTill: "",
        amount: "", expectedRegistryDate: "", notes: "",
        documentUrl: null, documentName: null,
      });
    }
  }, [editing, open, context]);

  function setField<K extends keyof typeof form>(key: K, value: typeof form[K]) {
    setForm((f) => ({ ...f, [key]: value }));
  }

  // When type changes, auto-fill defaults from flow config
  function handleTypeChange(type: LegalDocType) {
    const step = LEGAL_DOC_FLOW_MAP[type];
    if (step && !editing) {
      setForm((f) => ({
        ...f,
        type,
        title: step.label,
        authority: step.defaultAuthority,
        appliesTo: step.appliesTo,
      }));
    } else {
      setField("type", type);
    }
  }

  async function handleUpload(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    if (!file) return;
    setUploading(true);
    try {
      const formData = new FormData();
      formData.append("file", file);
      const res = await fetch("/api/uploads", { method: "POST", body: formData });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error ?? "Upload failed");
      setField("documentUrl", data.url);
      setField("documentName", data.fileName);
      toast.success("Document uploaded");
    } catch (err: unknown) {
      toast.error(err instanceof Error ? err.message : "Upload failed");
    } finally {
      setUploading(false);
    }
  }

  async function handleSubmit() {
    if (!form.title.trim()) { toast.error("Title is required"); return; }
    setSaving(true);
    try {
      const step = LEGAL_DOC_FLOW_MAP[form.type];
      const payload = {
        landPurchaseId: landPurchaseId ?? null,
        projectId: projectId ?? null,
        type: form.type,
        title: form.title.trim(),
        authority: form.authority.trim() || null,
        status: form.status,
        appliesTo: form.appliesTo,
        docNumber: form.docNumber.trim() || null,
        sortOrder: step ? LEGAL_DOC_FLOW.indexOf(step) : 0,
        prerequisiteType: step?.prerequisite ?? null,
        obtained: form.status === "APPROVED",
        applicationDate: form.applicationDate || null,
        issueDate: form.issueDate || null,
        validFrom: form.validFrom || null,
        validTill: form.validTill || null,
        amount: form.amount ? Number(form.amount) : null,
        expectedRegistryDate: form.expectedRegistryDate || null,
        notes: form.notes.trim() || null,
        documentUrl: form.documentUrl,
        documentName: form.documentName,
      };

      const url = editing ? `/api/legal-documents/${editing.id}` : "/api/legal-documents";
      const method = editing ? "PATCH" : "POST";
      const res = await fetch(url, {
        method,
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(payload),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error ?? "Failed to save");
      toast.success(editing ? "Legal document updated" : "Legal document added");
      onSaved();
    } catch (err: unknown) {
      toast.error(err instanceof Error ? err.message : "Failed to save");
    } finally {
      setSaving(false);
    }
  }

  const isATS = form.type === "AGREEMENT_TO_SELL";
  const step = LEGAL_DOC_FLOW_MAP[form.type];
  const amountLabel = step?.amountLabel ?? (isATS ? "Registration Amount" : "Fee / Amount Paid");

  return (
    <Dialog
      open={open}
      onOpenChange={onOpenChange}
      title={editing ? "Edit Legal Document" : "Add Legal Document"}
      description="Record permissions, licenses, NOCs, certificates, or agreements to sell."
      size="md"
      footer={
        <div className="flex justify-end gap-2">
          <Button variant="outline" onClick={() => onOpenChange(false)} disabled={saving}>Cancel</Button>
          <Button onClick={handleSubmit} disabled={saving}>
            {saving ? <Loader2 className="mr-1 h-3.5 w-3.5 animate-spin" /> : <CheckCircle2 className="mr-1 h-3.5 w-3.5" />}
            {saving ? "Saving…" : editing ? "Update" : "Add Document"}
          </Button>
        </div>
      }
    >
      <div className="space-y-3">
        <div className="grid grid-cols-2 gap-3">
          <div className="space-y-1.5">
            <Label>Document Type *</Label>
            <Select value={form.type} onChange={(e) => handleTypeChange(e.target.value as LegalDocType)}>
              {LEGAL_DOC_FLOW.map((s) => (
                <option key={s.type} value={s.type}>{s.label}</option>
              ))}
            </Select>
          </div>
          <div className="space-y-1.5">
            <Label>Status</Label>
            <Select value={form.status} onChange={(e) => setField("status", e.target.value as LegalDocStatus)}>
              {(Object.keys(STATUS_CONFIG) as LegalDocStatus[]).map((s) => (
                <option key={s} value={s}>{STATUS_CONFIG[s].label}</option>
              ))}
            </Select>
          </div>
        </div>

        <div className="space-y-1.5">
          <Label>Title *</Label>
          <Input value={form.title} onChange={(e) => setField("title", e.target.value)} placeholder="e.g. Map Approval — Tower A" />
        </div>

        <div className="grid grid-cols-2 gap-3">
          <div className="space-y-1.5">
            <Label>Issuing Authority</Label>
            <Input value={form.authority} onChange={(e) => setField("authority", e.target.value)} placeholder="e.g. DDA, Fire Dept, UPPCB" />
          </div>
          <div className="space-y-1.5">
            <Label>Reference / Document No.</Label>
            <Input value={form.docNumber} onChange={(e) => setField("docNumber", e.target.value)} placeholder="e.g. DDA/LU/2024/123" />
          </div>
        </div>

        <div className="grid grid-cols-3 gap-3">
          <div className="space-y-1.5">
            <Label>Application Date</Label>
            <Input type="date" value={form.applicationDate} onChange={(e) => setField("applicationDate", e.target.value)} />
          </div>
          <div className="space-y-1.5">
            <Label>Issue Date</Label>
            <Input type="date" value={form.issueDate} onChange={(e) => setField("issueDate", e.target.value)} />
          </div>
          <div className="space-y-1.5">
            <Label>Valid From</Label>
            <Input type="date" value={form.validFrom} onChange={(e) => setField("validFrom", e.target.value)} />
          </div>
        </div>

        <div className="grid grid-cols-2 gap-3">
          <div className="space-y-1.5">
            <Label>Valid Till</Label>
            <Input type="date" value={form.validTill} onChange={(e) => setField("validTill", e.target.value)} />
          </div>
          <div className="space-y-1.5">
            <Label>{amountLabel} (₹)</Label>
            <Input type="number" min={0} step="any" value={form.amount} onChange={(e) => setField("amount", e.target.value)} placeholder="e.g. 50000" />
          </div>
        </div>

        {isATS && (
          <div className="rounded-md border border-brand/30 bg-brand/5 p-3 space-y-3">
            <div className="text-body font-semibold text-brand">Agreement to Sell Details</div>
            <div className="space-y-1.5">
              <Label>Expected Registry Date</Label>
              <Input type="date" value={form.expectedRegistryDate} onChange={(e) => setField("expectedRegistryDate", e.target.value)} />
            </div>
            <div className="text-caption text-muted-foreground">
              ATS is a legal substitute for registry — used when the seller cannot registry immediately.
              The registration amount is paid, but full registry is deferred to the expected date.
            </div>
          </div>
        )}

        <div className="space-y-1.5">
          <Label>Proof Document</Label>
          {form.documentUrl ? (
            <div className="flex items-center justify-between gap-2 rounded-md border border-border bg-muted/30 px-3 py-2">
              <a href={form.documentUrl} target="_blank" rel="noreferrer"
                className="flex min-w-0 items-center gap-2 text-body text-foreground underline underline-offset-2 hover:text-muted-foreground">
                <FileText className="h-4 w-4 shrink-0 text-muted-foreground" />
                <span className="truncate">{form.documentName ?? "View document"}</span>
              </a>
              <button type="button" onClick={() => { setField("documentUrl", null); setField("documentName", null); }}
                className="shrink-0 rounded p-1 text-muted-foreground hover:bg-muted hover:text-danger">
                <X className="h-4 w-4" />
              </button>
            </div>
          ) : (
            <label className="flex cursor-pointer items-center justify-center gap-2 rounded-md border border-dashed border-border px-3 py-2.5 text-caption text-muted-foreground transition-colors hover:border-border-strong hover:text-foreground">
              <Upload className="h-4 w-4" />
              {uploading ? "Uploading…" : "Upload certificate / NOC / document (PDF, image)"}
              <input type="file" className="hidden" onChange={handleUpload} disabled={uploading}
                accept=".pdf,.doc,.docx,.jpg,.jpeg,.png,.zip" />
            </label>
          )}
        </div>

        <div className="space-y-1.5">
          <Label>Notes</Label>
          <Textarea value={form.notes} onChange={(e) => setField("notes", e.target.value)} rows={2}
            placeholder="Conditions, remarks, or additional details" />
        </div>
      </div>
    </Dialog>
  );
}

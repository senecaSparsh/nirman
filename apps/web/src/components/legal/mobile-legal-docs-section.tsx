"use client";

import { useState, useEffect, useRef, useCallback, useMemo } from "react";
import { useRouter } from "next/navigation";
import { toast } from "sonner";
import {
  FileText, Upload, X, Plus, Trash2, Loader2, CheckCircle2,
  Clock, AlertTriangle, XCircle, RefreshCw, Download, FileCheck2,
  ChevronRight, Pencil, ChevronDown, Lock, ShieldCheck, MapPin, Building2, CircleDot, AlertCircle,
} from "lucide-react";
import {
  MobileSectionTitle, MobileEmptyState, MobileStatusBadge,
} from "@/components/mobile/v2/primitives";
import { formatCurrency, formatDate, cn } from "@/lib/utils";
import type { LegalDocRow, LegalDocType, LegalDocStatus } from "@/components/legal/legal-docs-section";
import {
  LEGAL_DOC_FLOW, LEGAL_DOC_FLOW_MAP, STAGE_LABELS, STAGE_ORDER,
  getFlowStepsForContext, isPrerequisiteMet, daysUntilExpiry, getExpiryStatus,
  type LegalDocFlowStep,
} from "@/lib/legal-doc-flow";

const STATUS_STYLE: Record<LegalDocStatus, { bg: string; fg: string; label: string }> = {
  NOT_REQUIRED: { bg: "rgba(107,114,128,0.12)", fg: "#4b5563", label: "N/A" },
  PENDING: { bg: "rgba(245,158,11,0.12)", fg: "#b45309", label: "Pending" },
  APPROVED: { bg: "rgba(34,197,94,0.12)", fg: "#15803d", label: "Approved" },
  REJECTED: { bg: "rgba(239,68,68,0.12)", fg: "#b91c1c", label: "Rejected" },
  EXPIRED: { bg: "rgba(239,68,68,0.12)", fg: "#b91c1c", label: "Expired" },
  RENEWAL_DUE: { bg: "rgba(249,115,22,0.12)", fg: "#c2410c", label: "Renewal Due" },
};

const STAGE_ICONS: Record<string, typeof MapPin> = {
  FEASIBILITY: MapPin,
  SANCTION: Building2,
  POST_COMPLETION: ShieldCheck,
};

/**
 * MobileLegalDocsSection — mobile-optimized legal documents section.
 * Used on both /m/land/[id] and /m/projects/[id] pages.
 */
export function MobileLegalDocsSection({
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

  const docsByType = useMemo(() => {
    const m: Record<string, LegalDocRow> = {};
    for (const d of docs) m[d.type] = d;
    return m;
  }, [docs]);

  const flowSteps = useMemo(() => getFlowStepsForContext(context), [context]);

  const stepsByStage = useMemo(() => {
    const m: Record<string, LegalDocFlowStep[]> = {};
    for (const step of flowSteps) (m[step.stage] ??= []).push(step);
    return m;
  }, [flowSteps]);

  const requiredSteps = flowSteps.filter((s) => !s.isOptional);
  const obtainedRequired = requiredSteps.filter((s) => {
    const d = docsByType[s.type];
    return d?.obtained && d?.status === "APPROVED";
  }).length;
  const progressPct = requiredSteps.length > 0 ? Math.round((obtainedRequired / requiredSteps.length) * 100) : 0;

  const toggleExpand = (type: string) => {
    setExpandedSteps((s) => {
      const next = new Set(s);
      if (next.has(type)) next.delete(type); else next.add(type);
      return next;
    });
  };

  const handleToggleObtained = async (step: LegalDocFlowStep, currentDoc: LegalDocRow | undefined, value: boolean) => {
    if (!canManage) return;
    try {
      if (currentDoc) {
        const res = await fetch(`/api/legal-documents/${currentDoc.id}`, {
          method: "PATCH",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ obtained: value, status: value ? "APPROVED" : "PENDING" }),
        });
        if (!res.ok) { const d = await res.json(); throw new Error(d.error ?? "Failed"); }
      } else {
        const res = await fetch("/api/legal-documents", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            landPurchaseId: landPurchaseId ?? null,
            projectId: projectId ?? null,
            type: step.type, title: step.label, authority: step.defaultAuthority,
            status: value ? "APPROVED" : "PENDING", appliesTo: step.appliesTo,
            sortOrder: LEGAL_DOC_FLOW.indexOf(step), prerequisiteType: step.prerequisite, obtained: value,
          }),
        });
        if (!res.ok) { const d = await res.json(); throw new Error(d.error ?? "Failed"); }
      }
      toast.success(value ? `${step.label} marked as obtained` : `${step.label} marked as not obtained`);
      if (value) setExpandedSteps((s) => new Set(s).add(step.type));
      router.refresh();
    } catch (err: unknown) {
      toast.error(err instanceof Error ? err.message : "Failed");
    }
  };

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
            landPurchaseId: landPurchaseId ?? null, projectId: projectId ?? null,
            type: step.type, title: step.label, authority: step.defaultAuthority,
            status: "NOT_REQUIRED", appliesTo: step.appliesTo,
            sortOrder: LEGAL_DOC_FLOW.indexOf(step), prerequisiteType: step.prerequisite, obtained: false,
          }),
        });
        if (!res.ok) { const d = await res.json(); throw new Error(d.error ?? "Failed"); }
      }
      toast.success(`${step.label} marked as not required`);
      router.refresh();
    } catch (err: unknown) {
      toast.error(err instanceof Error ? err.message : "Failed");
    }
  };

  return (
    <div>
      <MobileSectionTitle
        right={canManage ? (
          <button
            onClick={() => { setEditing(null); setShowForm(true); }}
            className="flex items-center gap-1 text-[0.75rem] font-semibold rounded-full px-2.5 py-1"
            style={{ backgroundColor: "var(--color-brand)", color: "white" }}
          >
            <Plus className="size-3.5" /> Add
          </button>
        ) : undefined}
      >
        Permissions, Legal & NOC
      </MobileSectionTitle>

      {/* Progress bar */}
      <div className="px-1 mb-3">
        <div className="h-1.5 rounded-full overflow-hidden" style={{ backgroundColor: "var(--color-line)" }}>
          <div
            className="h-full rounded-full transition-all"
            style={{
              width: `${progressPct}%`,
              backgroundColor: progressPct === 100 ? "var(--color-go)" : "var(--color-brand)",
            }}
          />
        </div>
        <p className="text-[0.5rem] mt-1" style={{ color: "var(--color-ink-500)" }}>
          {obtainedRequired}/{requiredSteps.length} required permissions obtained ({progressPct}%)
        </p>
      </div>

      {/* Guided checklist by stage */}
      <div className="space-y-3">
        {STAGE_ORDER.map((stage) => {
          const steps = stepsByStage[stage];
          if (!steps || steps.length === 0) return null;
          const StageIcon = STAGE_ICONS[stage] ?? FileText;

          return (
            <div key={stage}>
              <div className="flex items-center gap-1.5 mb-1.5 pb-1" style={{ borderBottom: "1px solid var(--color-line)" }}>
                <StageIcon className="size-3" style={{ color: "var(--color-ink-500)" }} />
                <p className="text-[0.625rem] font-bold uppercase tracking-wide" style={{ color: "var(--color-ink-500)" }}>
                  {STAGE_LABELS[stage]}
                </p>
              </div>
              <div className="space-y-2">
                {steps.map((step) => {
                  const doc = docsByType[step.type];
                  const prereqMet = isPrerequisiteMet(step.prerequisite, docs, context);
                  const isExpanded = expandedSteps.has(step.type);
                  const isLocked = !prereqMet && step.prerequisite !== null;
                  const expiryStatus = getExpiryStatus(doc?.validTill ?? null);
                  const expiryDays = daysUntilExpiry(doc?.validTill ?? null);

                  return (
                    <MobileChecklistRow
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
            </div>
          );
        })}
      </div>

      {showForm && (
        <MobileLegalDocForm
          open={showForm}
          onClose={() => { setShowForm(false); setEditing(null); }}
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

function MobileChecklistRow({
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
  const statusStyle = doc ? STATUS_STYLE[doc.status] : null;

  return (
    <div
      className="rounded-xl border overflow-hidden"
      style={{
        backgroundColor: isLocked ? "var(--color-paper-2)" : "var(--color-paper)",
        borderColor: isObtained ? "rgba(34,197,94,0.3)" : "var(--color-line)",
        opacity: isLocked ? 0.6 : 1,
      }}
    >
      {/* Row header */}
      <div className="flex items-start gap-1.5 p-2.5">
        <button
          onClick={onToggleExpand}
          disabled={isLocked}
          className="mt-0.5 shrink-0 press"
          style={{ opacity: isLocked ? 0.3 : 1 }}
        >
          {isExpanded ? <ChevronDown className="size-3.5" style={{ color: "var(--color-ink-500)" }} /> : <ChevronRight className="size-3.5" style={{ color: "var(--color-ink-500)" }} />}
        </button>

        {/* Status icon */}
        <div className="mt-0.5 shrink-0">
          {isLocked ? (
            <Lock className="size-3.5" style={{ color: "var(--color-ink-400)" }} />
          ) : isObtained ? (
            <CheckCircle2 className="size-3.5" style={{ color: "var(--color-go)" }} />
          ) : isNotRequired ? (
            <CircleDot className="size-3.5" style={{ color: "var(--color-ink-400)" }} />
          ) : isPending ? (
            <Clock className="size-3.5" style={{ color: "#b45309" }} />
          ) : (
            <div className="size-3.5 rounded-full border-2" style={{ borderColor: "var(--color-line)" }} />
          )}
        </div>

        {/* Title */}
        <div className="min-w-0 flex-1">
          <div className="flex items-center gap-1 flex-wrap">
            <p className="text-[0.75rem] font-semibold leading-tight" style={{ color: "var(--color-ink-950)" }}>
              {step.label}
            </p>
            {!step.isOptional && !isObtained && !isNotRequired && !isLocked && (
              <span className="rounded px-1 text-[0.5rem] font-bold" style={{ backgroundColor: "rgba(239,68,68,0.1)", color: "#b91c1c" }}>REQ</span>
            )}
            {statusStyle && doc && (
              <span className="rounded-full px-1.5 py-0.5 text-[0.5rem] font-semibold" style={{ backgroundColor: statusStyle.bg, color: statusStyle.fg }}>
                {statusStyle.label}
              </span>
            )}
          </div>
          {!isExpanded && (
            <p className="text-[0.625rem] line-clamp-1 mt-0.5" style={{ color: "var(--color-ink-500)" }}>
              {doc ? doc.title : step.description}
            </p>
          )}
          {/* Expiry warning */}
          {expiryStatus === "expired" && (
            <p className="text-[0.5625rem] font-semibold mt-0.5" style={{ color: "var(--color-stop)" }}>
              Expired {Math.abs(expiryDays!)}d ago
            </p>
          )}
          {expiryStatus === "expiring" && (
            <p className="text-[0.5625rem] font-semibold mt-0.5" style={{ color: "#c2410c" }}>
              Expires in {expiryDays}d
            </p>
          )}
          {/* Prerequisite lock */}
          {isLocked && step.prerequisite && (
            <p className="text-[0.5625rem] mt-0.5" style={{ color: "var(--color-ink-400)" }}>
              <Lock className="inline size-2.5 mr-0.5" />
              Needs {LEGAL_DOC_FLOW_MAP[step.prerequisite]?.label ?? step.prerequisite}
            </p>
          )}
        </div>

        {/* Yes/No/N/A buttons */}
        {canManage && !isLocked && (
          <div className="flex items-center gap-0.5 shrink-0">
            <button
              onClick={() => onToggleObtained(true)}
              className="rounded px-1.5 py-0.5 text-[0.5625rem] font-bold press"
              style={{
                backgroundColor: isObtained ? "rgba(34,197,94,0.15)" : "var(--color-paper-2)",
                color: isObtained ? "#15803d" : "var(--color-ink-500)",
              }}
            >Yes</button>
            <button
              onClick={() => onToggleObtained(false)}
              className="rounded px-1.5 py-0.5 text-[0.5625rem] font-bold press"
              style={{
                backgroundColor: isPending && !isObtained ? "rgba(245,158,11,0.15)" : "var(--color-paper-2)",
                color: isPending && !isObtained ? "#b45309" : "var(--color-ink-500)",
              }}
            >No</button>
            {step.isOptional && (
              <button
                onClick={onMarkNotRequired}
                className="rounded px-1.5 py-0.5 text-[0.5625rem] font-bold press"
                style={{
                  backgroundColor: isNotRequired ? "rgba(107,114,128,0.15)" : "var(--color-paper-2)",
                  color: isNotRequired ? "#4b5563" : "var(--color-ink-500)",
                }}
              >N/A</button>
            )}
          </div>
        )}
      </div>

      {/* Expanded details */}
      {isExpanded && !isLocked && (
        <div className="px-2.5 pb-2.5 pt-1 border-t" style={{ borderColor: "var(--color-line)" }}>
          <p className="text-[0.625rem] mb-1.5" style={{ color: "var(--color-ink-500)" }}>{step.description}</p>
          <p className="text-[0.5625rem] mb-2" style={{ color: "var(--color-ink-400)" }}>
            Authority: {step.defaultAuthority}
            {step.typicalValidityMonths && ` · Validity: ${step.typicalValidityMonths}mo`}
          </p>

          {doc ? (
            <>
              <div className="grid grid-cols-2 gap-x-2 gap-y-0.5 text-[0.625rem]" style={{ color: "var(--color-ink-600)" }}>
                {doc.authority && <div><span style={{ color: "var(--color-ink-400)" }}>Auth: </span><span className="font-medium" style={{ color: "var(--color-ink-900)" }}>{doc.authority}</span></div>}
                {doc.docNumber && <div><span style={{ color: "var(--color-ink-400)" }}>Ref: </span><span className="font-medium" style={{ color: "var(--color-ink-900)" }}>{doc.docNumber}</span></div>}
                {doc.applicationDate && <div><span style={{ color: "var(--color-ink-400)" }}>Applied: </span><span className="font-medium" style={{ color: "var(--color-ink-900)" }}>{formatDate(doc.applicationDate)}</span></div>}
                {doc.issueDate && <div><span style={{ color: "var(--color-ink-400)" }}>Issued: </span><span className="font-medium" style={{ color: "var(--color-ink-900)" }}>{formatDate(doc.issueDate)}</span></div>}
                {doc.validTill && <div><span style={{ color: "var(--color-ink-400)" }}>Till: </span><span className="font-medium" style={{ color: "var(--color-ink-900)" }}>{formatDate(doc.validTill)}</span></div>}
                {doc.amount != null && <div><span style={{ color: "var(--color-ink-400)" }}>{step.amountLabel ?? "Amt"}: </span><span className="font-medium" style={{ color: "var(--color-ink-900)" }}>{formatCurrency(doc.amount)}</span></div>}
                {doc.expectedRegistryDate && <div><span style={{ color: "var(--color-ink-400)" }}>Registry: </span><span className="font-medium" style={{ color: "var(--color-ink-900)" }}>{formatDate(doc.expectedRegistryDate)}</span></div>}
              </div>
              {doc.notes && <p className="text-[0.625rem] italic mt-1" style={{ color: "var(--color-ink-500)" }}>{doc.notes}</p>}
              {/* Transfer duty → project cost bridge indicator */}
              {step.type === "TRANSFER_DUTY" && doc.amount != null && doc.amount > 0 && doc.projectId && isObtained && (
                <p className="text-[0.5625rem] font-medium mt-1 flex items-center gap-1" style={{ color: "var(--color-go)" }}>
                  <CheckCircle2 className="size-2.5" /> Transfer duty {formatCurrency(doc.amount)} auto-logged as project cost.
                </p>
              )}
              {step.type === "TRANSFER_DUTY" && doc.amount != null && doc.amount > 0 && !doc.projectId && (
                <p className="text-[0.5625rem] font-medium mt-1 flex items-center gap-1" style={{ color: "#b45309" }}>
                  <AlertCircle className="size-2.5" /> Link land to a project to auto-log the duty as a cost.
                </p>
              )}
              <div className="flex items-center gap-2 mt-2 pt-1.5 border-t" style={{ borderColor: "var(--color-line)" }}>
                {doc.documentUrl && (
                  <a href={doc.documentUrl} target="_blank" rel="noreferrer" className="flex items-center gap-1 text-[0.625rem] font-medium" style={{ color: "var(--color-brand)" }}>
                    <Download className="size-3" /> {doc.documentName ?? "View"}
                  </a>
                )}
                {canManage && (
                  <div className="ml-auto flex items-center gap-2">
                    <button onClick={onEdit} className="press" style={{ color: "var(--color-ink-500)" }}><Pencil className="size-3.5" /></button>
                    <button onClick={onDelete} className="press" style={{ color: "var(--color-ink-500)" }}><Trash2 className="size-3.5" /></button>
                  </div>
                )}
              </div>
            </>
          ) : (
            <p className="text-[0.5625rem] italic" style={{ color: "var(--color-ink-400)" }}>
              Tap "Yes" to record this permission.
            </p>
          )}
        </div>
      )}
    </div>
  );
}

function MobileLegalDocForm({
  open, onClose, editing, landPurchaseId, projectId, context, onSaved,
}: {
  open: boolean;
  onClose: () => void;
  editing: LegalDocRow | null;
  landPurchaseId?: string;
  projectId?: string;
  context: "LAND" | "PROJECT";
  onSaved: () => void;
}) {
  const router = useRouter();
  const [saving, setSaving] = useState(false);
  const [uploading, setUploading] = useState(false);
  const fileInputRef = useRef<HTMLInputElement>(null);
  const [form, setForm] = useState({
    type: "OTHER" as LegalDocType,
    title: "",
    authority: "",
    status: "PENDING" as LegalDocStatus,
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
        docNumber: "", applicationDate: "", issueDate: "", validFrom: "", validTill: "",
        amount: "", expectedRegistryDate: "", notes: "",
        documentUrl: null, documentName: null,
      });
    }
  }, [editing, open]);

  function setField<K extends keyof typeof form>(key: K, value: typeof form[K]) {
    setForm((f) => ({ ...f, [key]: value }));
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
        appliesTo: step?.appliesTo ?? context,
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
  const inputClass = "w-full rounded-lg border px-3 py-2 text-[0.8125rem]";
  const inputStyle = {
    backgroundColor: "var(--color-surface)",
    borderColor: "var(--color-line)",
    color: "var(--color-ink-900)",
  };

  return (
    <div className="fixed inset-0 z-50 flex items-end justify-center">
      <div className="absolute inset-0" style={{ backgroundColor: "rgba(0,0,0,0.4)" }} onClick={onClose} />
      <div
        className="relative w-full max-w-md rounded-t-[0.75rem] border-t max-h-[90vh] overflow-y-auto"
        style={{ backgroundColor: "var(--color-paper)", borderColor: "var(--color-line)" }}
      >
        {/* Header */}
        <div className="sticky top-0 z-10 pt-2 pb-1" style={{ backgroundColor: "var(--color-paper)" }}>
          <div className="w-8 h-0.5 rounded-full mx-auto mb-2" style={{ backgroundColor: "var(--color-ink-300)" }} />
          <div className="flex items-center justify-between px-3 pb-2 border-b" style={{ borderColor: "var(--color-line)" }}>
            <p className="text-[0.75rem] font-bold" style={{ color: "var(--color-ink-950)" }}>
              {editing ? "Edit Legal Document" : "Add Legal Document"}
            </p>
            <button onClick={onClose} className="press">
              <X className="size-4" style={{ color: "var(--color-ink-500)" }} />
            </button>
          </div>
        </div>

        {/* Body */}
        <div className="p-3 space-y-3 pb-20">
          {/* Type + Status */}
          <div className="grid grid-cols-2 gap-2">
            <div>
              <label className="text-[0.625rem] font-semibold uppercase mb-1 block" style={{ color: "var(--color-ink-500)" }}>Type *</label>
              <select
                value={form.type}
                onChange={(e) => {
                  const t = e.target.value as LegalDocType;
                  const step = LEGAL_DOC_FLOW_MAP[t];
                  if (step && !editing) {
                    setForm((f) => ({ ...f, type: t, title: step.label, authority: step.defaultAuthority }));
                  } else {
                    setField("type", t);
                  }
                }}
                className={inputClass}
                style={inputStyle}
              >
                {LEGAL_DOC_FLOW.map((s) => (
                  <option key={s.type} value={s.type}>{s.label}</option>
                ))}
              </select>
            </div>
            <div>
              <label className="text-[0.625rem] font-semibold uppercase mb-1 block" style={{ color: "var(--color-ink-500)" }}>Status</label>
              <select
                value={form.status}
                onChange={(e) => setField("status", e.target.value as LegalDocStatus)}
                className={inputClass}
                style={inputStyle}
              >
                {(Object.keys(STATUS_STYLE) as LegalDocStatus[]).map((s) => (
                  <option key={s} value={s}>{STATUS_STYLE[s].label}</option>
                ))}
              </select>
            </div>
          </div>

          {/* Title */}
          <div>
            <label className="text-[0.625rem] font-semibold uppercase mb-1 block" style={{ color: "var(--color-ink-500)" }}>Title *</label>
            <input
              type="text"
              value={form.title}
              onChange={(e) => setField("title", e.target.value)}
              placeholder="e.g. Map Approval — Tower A"
              className={inputClass}
              style={inputStyle}
            />
          </div>

          {/* Authority + Doc Number */}
          <div className="grid grid-cols-2 gap-2">
            <div>
              <label className="text-[0.625rem] font-semibold uppercase mb-1 block" style={{ color: "var(--color-ink-500)" }}>Authority</label>
              <input
                type="text"
                value={form.authority}
                onChange={(e) => setField("authority", e.target.value)}
                placeholder="e.g. DDA, Fire Dept"
                className={inputClass}
                style={inputStyle}
              />
            </div>
            <div>
              <label className="text-[0.625rem] font-semibold uppercase mb-1 block" style={{ color: "var(--color-ink-500)" }}>Ref. No.</label>
              <input
                type="text"
                value={form.docNumber}
                onChange={(e) => setField("docNumber", e.target.value)}
                placeholder="e.g. DDA/LU/2024/123"
                className={inputClass}
                style={inputStyle}
              />
            </div>
          </div>

          {/* Dates */}
          <div className="grid grid-cols-3 gap-2">
            <div>
              <label className="text-[0.625rem] font-semibold uppercase mb-1 block" style={{ color: "var(--color-ink-500)" }}>Issue Date</label>
              <input type="date" value={form.issueDate} onChange={(e) => setField("issueDate", e.target.value)} className={inputClass} style={inputStyle} />
            </div>
            <div>
              <label className="text-[0.625rem] font-semibold uppercase mb-1 block" style={{ color: "var(--color-ink-500)" }}>Valid From</label>
              <input type="date" value={form.validFrom} onChange={(e) => setField("validFrom", e.target.value)} className={inputClass} style={inputStyle} />
            </div>
            <div>
              <label className="text-[0.625rem] font-semibold uppercase mb-1 block" style={{ color: "var(--color-ink-500)" }}>Valid Till</label>
              <input type="date" value={form.validTill} onChange={(e) => setField("validTill", e.target.value)} className={inputClass} style={inputStyle} />
            </div>
          </div>

          {/* ATS-specific or amount */}
          {isATS ? (
            <div className="rounded-lg border p-3 space-y-2" style={{ borderColor: "var(--color-brand)", backgroundColor: "rgba(59,130,246,0.05)" }}>
              <p className="text-[0.75rem] font-bold" style={{ color: "var(--color-brand)" }}>Agreement to Sell</p>
              <div className="grid grid-cols-2 gap-2">
                <div>
                  <label className="text-[0.625rem] font-semibold uppercase mb-1 block" style={{ color: "var(--color-ink-500)" }}>Reg. Amount (₹)</label>
                  <input type="number" min={0} step="any" value={form.amount} onChange={(e) => setField("amount", e.target.value)} placeholder="5000000" className={inputClass} style={inputStyle} />
                </div>
                <div>
                  <label className="text-[0.625rem] font-semibold uppercase mb-1 block" style={{ color: "var(--color-ink-500)" }}>Expected Registry</label>
                  <input type="date" value={form.expectedRegistryDate} onChange={(e) => setField("expectedRegistryDate", e.target.value)} className={inputClass} style={inputStyle} />
                </div>
              </div>
              <p className="text-[0.625rem]" style={{ color: "var(--color-ink-500)" }}>
                ATS is a legal substitute for registry — used when the seller cannot registry immediately.
              </p>
            </div>
          ) : (
            <div>
              <label className="text-[0.625rem] font-semibold uppercase mb-1 block" style={{ color: "var(--color-ink-500)" }}>Fee / Amount (₹) — optional</label>
              <input type="number" min={0} step="any" value={form.amount} onChange={(e) => setField("amount", e.target.value)} placeholder="50000" className={inputClass} style={inputStyle} />
            </div>
          )}

          {/* Upload */}
          <div>
            <label className="text-[0.625rem] font-semibold uppercase mb-1 block" style={{ color: "var(--color-ink-500)" }}>Proof Document</label>
            {form.documentUrl ? (
              <div className="flex items-center justify-between gap-2 rounded-lg border px-3 py-2" style={{ borderColor: "var(--color-line)", backgroundColor: "var(--color-surface)" }}>
                <a href={form.documentUrl} target="_blank" rel="noreferrer" className="flex min-w-0 items-center gap-2 text-[0.75rem]" style={{ color: "var(--color-ink-900)" }}>
                  <FileText className="size-4 shrink-0" style={{ color: "var(--color-ink-500)" }} />
                  <span className="truncate">{form.documentName ?? "View"}</span>
                </a>
                <button type="button" onClick={() => { setField("documentUrl", null); setField("documentName", null); }} className="press shrink-0">
                  <X className="size-4" style={{ color: "var(--color-ink-500)" }} />
                </button>
              </div>
            ) : (
              <button
                type="button"
                onClick={() => fileInputRef.current?.click()}
                className="w-full flex items-center justify-center gap-2 rounded-lg border border-dashed px-3 py-2.5 text-[0.6875rem]"
                style={{ borderColor: "var(--color-line)", color: "var(--color-ink-500)" }}
              >
                {uploading ? <Loader2 className="size-3.5 animate-spin" /> : <Upload className="size-3.5" />}
                {uploading ? "Uploading…" : "Upload certificate / NOC / document"}
              </button>
            )}
            <input ref={fileInputRef} type="file" className="hidden" onChange={handleUpload} disabled={uploading} accept=".pdf,.doc,.docx,.jpg,.jpeg,.png,.zip" />
          </div>

          {/* Notes */}
          <div>
            <label className="text-[0.625rem] font-semibold uppercase mb-1 block" style={{ color: "var(--color-ink-500)" }}>Notes</label>
            <textarea
              value={form.notes}
              onChange={(e) => setField("notes", e.target.value)}
              rows={2}
              placeholder="Conditions, remarks, or additional details"
              className={inputClass}
              style={inputStyle}
            />
          </div>
        </div>

        {/* Footer */}
        <div className="sticky bottom-0 flex gap-2 p-3 border-t" style={{ backgroundColor: "var(--color-paper)", borderColor: "var(--color-line)" }}>
          <button
            onClick={onClose}
            disabled={saving}
            className="flex-1 rounded-lg border py-2.5 text-[0.75rem] font-semibold"
            style={{ borderColor: "var(--color-line)", color: "var(--color-ink-700)" }}
          >
            Cancel
          </button>
          <button
            onClick={handleSubmit}
            disabled={saving}
            className="flex-1 rounded-lg py-2.5 text-[0.75rem] font-semibold flex items-center justify-center gap-1"
            style={{ backgroundColor: "var(--color-brand)", color: "white" }}
          >
            {saving ? <Loader2 className="size-3.5 animate-spin" /> : <CheckCircle2 className="size-3.5" />}
            {saving ? "Saving…" : editing ? "Update" : "Add"}
          </button>
        </div>
      </div>
    </div>
  );
}

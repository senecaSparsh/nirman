"use client";

import { useState, useEffect, useRef, useCallback, useMemo } from "react";
import { useRouter } from "next/navigation";
import { toast } from "sonner";
import {
  FileText, Upload, X, Plus, Trash2, Loader2, CheckCircle2,
  Clock, Download,
  // eslint-disable-next-line @typescript-eslint/no-unused-vars
  ChevronRight, Pencil, ChevronDown, Lock, ShieldCheck, MapPin, Building2, CircleDot, AlertCircle,
} from "lucide-react";
import {
  MobileSectionTitle,
} from "@/components/mobile/v2/primitives";
import { MobileDialog } from "@/components/mobile/v2/dialog";
import { EnumSelect } from "@/components/mobile/v2/form-primitives";
import {formatCurrencyCompact, formatDate} from "@/lib/utils";
import { useConfirm } from "@/lib/use-confirm";
import type { LegalDocRow, LegalDocType, LegalDocStatus } from "@/components/legal/legal-docs-section";
import {
  LEGAL_DOC_FLOW, LEGAL_DOC_FLOW_MAP, STAGE_LABELS, STAGE_ORDER,
  getFlowStepsForContext, isPrerequisiteMet, daysUntilExpiry, getExpiryStatus,
  type LegalDocFlowStep,
} from "@/lib/legal-doc-flow";

const STATUS_STYLE: Record<LegalDocStatus, { bg: string; fg: string; label: string }> = {
  NOT_REQUIRED: { bg: "var(--color-concrete)", fg: "var(--color-ink-700)", label: "N/A" },
  PENDING: { bg: "var(--color-signal-wash)", fg: "var(--color-signal-dark)", label: "Pending" },
  APPROVED: { bg: "var(--color-go-wash)", fg: "var(--color-go)", label: "Approved" },
  REJECTED: { bg: "var(--color-stop-wash)", fg: "var(--color-stop)", label: "Rejected" },
  EXPIRED: { bg: "var(--color-stop-wash)", fg: "var(--color-stop)", label: "Expired" },
  RENEWAL_DUE: { bg: "var(--color-stop-wash)", fg: "var(--color-stop)", label: "Renewal Due" },
};

const STAGE_ICONS: Record<string, typeof MapPin> = {
  FEASIBILITY: MapPin,
  SANCTION: Building2,
  POST_COMPLETION: ShieldCheck,
};

// ── Stage header style (tree-hierarchy visual language) ──
const STAGE_HEADER_STYLE: Record<string, { bg: string; fg: string }> = {
  FEASIBILITY: { bg: "var(--color-ink-950)", fg: "var(--color-paper)" },
  SANCTION: { bg: "var(--color-steel)", fg: "#fff" },
  POST_COMPLETION: { bg: "var(--color-signal)", fg: "var(--color-ink-950)" },
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
  const [confirm, confirmDialog] = useConfirm();
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
    const ok = await confirm({ title: "Confirm?", description: "Delete this legal document?", confirmLabel: "Confirm", variant: "destructive" });
    if (!ok) return;
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
            className="flex items-center gap-1 text-m-body font-semibold rounded-full px-2.5 py-1"
            style={{ backgroundColor: "var(--color-brand)", color: "var(--color-paper)" }}
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
        <p className="text-m-caption mt-1" style={{ color: "var(--color-ink-500)" }}>
          {obtainedRequired}/{requiredSteps.length} required permissions obtained ({progressPct}%)
        </p>
      </div>

      {/* Guided checklist by stage — tree-hierarchy style */}
      <div className="space-y-3">
        {STAGE_ORDER.map((stage) => {
          const steps = stepsByStage[stage];
          if (!steps || steps.length === 0) return null;
          const StageIcon = STAGE_ICONS[stage] ?? FileText;
          const headerStyle = STAGE_HEADER_STYLE[stage] ?? STAGE_HEADER_STYLE.SANCTION!;
          const stageObtained = steps.filter((s) => {
            const d = docsByType[s.type];
            return d?.obtained && d?.status === "APPROVED";
          }).length;

          return (
            <div key={stage}>
              {/* ── Stage header — tree-row style (icon in rounded square + label + count) ── */}
              <div className="flex items-center gap-1.5 mb-2">
                <span
                  className="grid place-items-center size-4 rounded-[0.1875rem] shrink-0"
                  style={{ backgroundColor: headerStyle.bg }}
                >
                  <StageIcon className="size-2.5" style={{ color: headerStyle.fg }} />
                </span>
                <p
                  className="text-m-caption font-bold uppercase tracking-wide"
                  style={{ color: "var(--color-ink-500)" }}
                >
                  {STAGE_LABELS[stage]}
                </p>
                <span
                  className="text-m-caption font-semibold shrink-0"
                  style={{ color: "var(--color-ink-400)" }}
                >
                  {stageObtained}/{steps.length}
                </span>
              </div>
              <div className="flex flex-col">
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
      {confirmDialog}
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

  // ── Status → icon + color for the tree-row icon (matches HR tree) ──
  const iconConfig = isLocked
    ? { Icon: Lock, bg: "var(--color-concrete)", fg: "var(--color-ink-400)" }
    : isObtained
      ? { Icon: CheckCircle2, bg: "var(--color-go-wash)", fg: "var(--color-go)" }
      : isNotRequired
        ? { Icon: CircleDot, bg: "var(--color-concrete)", fg: "var(--color-ink-400)" }
        : isPending
          ? { Icon: Clock, bg: "var(--color-signal-wash)", fg: "var(--color-signal-dark)" }
          : { Icon: CircleDot, bg: "var(--color-concrete)", fg: "var(--color-ink-400)" };
  const { Icon: StatusIcon, bg: iconBg, fg: iconFg } = iconConfig;

  // ── Right content: expiry alert or status count ──
  const rightContent = expiryStatus === "expired" ? (
    <span className="text-m-caption font-bold shrink-0" style={{ color: "var(--color-stop)" }}>
      {Math.abs(expiryDays!)}d ago
    </span>
  ) : expiryStatus === "expiring" ? (
    <span className="text-m-caption font-bold shrink-0" style={{ color: "var(--color-stop)" }}>
      {expiryDays}d
    </span>
  ) : isLocked ? (
    <span className="text-m-caption font-medium shrink-0" style={{ color: "var(--color-ink-400)" }}>
      <Lock className="inline size-2.5" />
    </span>
  ) : null;

  // ── Sub-label (inline, like HR tree's designation · code) ──
  const sub = isLocked && step.prerequisite
    ? `Needs ${LEGAL_DOC_FLOW_MAP[step.prerequisite]?.label ?? step.prerequisite}`
    : doc?.docNumber
      ? `#${doc.docNumber}`
      : undefined;

  return (
    <div>
      {/* ── Tree row — flat, 24px height, matches HR tree exactly ── */}
      <div className="flex items-center" style={{ height: 24 }}>
        {/* Chevron — always shown, even for locked items (so you can see what's needed) */}
        <div className="shrink-0 w-4 flex items-center justify-center">
          <button type="button" onClick={onToggleExpand} className="text-m-body press">
            <ChevronRight
              className="size-3 transition-transform"
              style={{
                color: "var(--color-ink-500)",
                transform: isExpanded ? "rotate(90deg)" : "none",
              }}
            />
          </button>
        </div>

        {/* Status icon in rounded square (tree-hierarchy style) */}
        <span
          className="grid place-items-center size-4 rounded-[0.1875rem] shrink-0"
          style={{ backgroundColor: iconBg }}
        >
          <StatusIcon className="size-2.5" style={{ color: iconFg }} />
        </span>

        {/* Name + status badge (inline, like HR tree's name + role tag) */}
        <button
          type="button"
          onClick={onToggleExpand}
          className="min-w-0 truncate text-left press ml-1.5 text-m-label font-semibold"
          style={{ color: "var(--color-ink-950)" }}
        >
          <span className="truncate">{step.label}</span>
          {/* REQ badge (like HR tree's role tag) */}
          {!step.isOptional && !isObtained && !isNotRequired && !isLocked && (
            <span
              className="ml-1 inline-block rounded px-1 py-px text-m-caption font-bold uppercase align-middle shrink-0"
              style={{ backgroundColor: "var(--color-stop-wash)", color: "var(--color-stop)" }}
            >
              REQ
            </span>
          )}
          {/* Status badge (like HR tree's role tag) */}
          {statusStyle && doc && (
            <span
              className="ml-1 inline-block rounded px-1 py-px text-m-caption font-bold uppercase align-middle shrink-0"
              style={{ backgroundColor: statusStyle.bg, color: statusStyle.fg }}
            >
              {statusStyle.label}
            </span>
          )}
        </button>

        {/* Sub-label (inline, like HR tree's designation · code) */}
        {sub ? (
          <span className="text-m-caption shrink-0 ml-1 truncate max-w-[30%]" style={{ color: "var(--color-ink-400)" }}>
            {sub}
          </span>
        ) : null}

        {/* Right content (expiry alert / lock icon) */}
        {rightContent ? <div className="shrink-0 ml-1.5">{rightContent}</div> : null}
      </div>

      {/* ── Expanded details panel (below the tree row) — works even when locked ── */}
      {isExpanded && (
        <div
          className="ml-1 mb-1 rounded-[0.375rem] border p-2 space-y-2"
          style={{
            marginLeft: 24,
            borderColor: "var(--color-line)",
            backgroundColor: "var(--color-paper-2)",
          }}
        >
          {/* Lock warning for locked items */}
          {isLocked && step.prerequisite && (
            <div
              className="flex items-center gap-1.5 rounded-[0.25rem] px-2 py-1"
              style={{ backgroundColor: "var(--color-concrete)" }}
            >
              <Lock className="size-3 shrink-0" style={{ color: "var(--color-ink-500)" }} />
              <p className="text-m-caption font-medium" style={{ color: "var(--color-ink-600)" }}>
                Needs {LEGAL_DOC_FLOW_MAP[step.prerequisite]?.label ?? step.prerequisite} first
              </p>
            </div>
          )}

          {/* Description */}
          <p className="text-m-caption" style={{ color: "var(--color-ink-500)" }}>{step.description}</p>
          <p className="text-m-caption" style={{ color: "var(--color-ink-400)" }}>
            Authority: {step.defaultAuthority}
            {step.typicalValidityMonths && ` · Validity: ${step.typicalValidityMonths}mo`}
          </p>

          {/* Yes/No/N/A buttons — disabled when locked */}
          {canManage && !isLocked && (
            <div className="flex items-center gap-1">
              <button
                onClick={() => onToggleObtained(true)}
                className="rounded px-2 py-0.5 text-m-caption font-bold press"
                style={{
                  backgroundColor: isObtained ? "rgba(34,197,94,0.15)" : "var(--color-paper)",
                  color: isObtained ? "var(--color-go)" : "var(--color-ink-500)",
                  border: "1px solid var(--color-line)",
                }}
              >Yes</button>
              <button
                onClick={() => onToggleObtained(false)}
                className="rounded px-2 py-0.5 text-m-caption font-bold press"
                style={{
                  backgroundColor: isPending && !isObtained ? "rgba(245,158,11,0.15)" : "var(--color-paper)",
                  color: isPending && !isObtained ? "#b45309" : "var(--color-ink-500)",
                  border: "1px solid var(--color-line)",
                }}
              >No</button>
              {step.isOptional && (
                <button
                  onClick={onMarkNotRequired}
                  className="rounded px-2 py-0.5 text-m-caption font-bold press"
                  style={{
                    backgroundColor: isNotRequired ? "rgba(107,114,128,0.15)" : "var(--color-paper)",
                    color: isNotRequired ? "#4b5563" : "var(--color-ink-500)",
                    border: "1px solid var(--color-line)",
                  }}
                >N/A</button>
              )}
            </div>
          )}

          {/* Doc details */}
          {doc ? (
            <>
              <div className="grid grid-cols-2 gap-x-2 gap-y-0.5 text-m-label" style={{ color: "var(--color-ink-600)" }}>
                {doc.authority && <div><span style={{ color: "var(--color-ink-400)" }}>Auth: </span><span className="font-medium" style={{ color: "var(--color-ink-900)" }}>{doc.authority}</span></div>}
                {doc.docNumber && <div><span style={{ color: "var(--color-ink-400)" }}>Ref: </span><span className="font-medium" style={{ color: "var(--color-ink-900)" }}>{doc.docNumber}</span></div>}
                {doc.applicationDate && <div><span style={{ color: "var(--color-ink-400)" }}>Applied: </span><span className="font-medium" style={{ color: "var(--color-ink-900)" }}>{formatDate(doc.applicationDate)}</span></div>}
                {doc.issueDate && <div><span style={{ color: "var(--color-ink-400)" }}>Issued: </span><span className="font-medium" style={{ color: "var(--color-ink-900)" }}>{formatDate(doc.issueDate)}</span></div>}
                {doc.validTill && <div><span style={{ color: "var(--color-ink-400)" }}>Till: </span><span className="font-medium" style={{ color: "var(--color-ink-900)" }}>{formatDate(doc.validTill)}</span></div>}
                {doc.amount != null && <div><span style={{ color: "var(--color-ink-400)" }}>{step.amountLabel ?? "Amt"}: </span><span className="font-medium" style={{ color: "var(--color-ink-900)" }}>{formatCurrencyCompact(doc.amount)}</span></div>}
                {doc.expectedRegistryDate && <div><span style={{ color: "var(--color-ink-400)" }}>Registry: </span><span className="font-medium" style={{ color: "var(--color-ink-900)" }}>{formatDate(doc.expectedRegistryDate)}</span></div>}
              </div>
              {doc.notes && <p className="text-m-label italic" style={{ color: "var(--color-ink-500)" }}>{doc.notes}</p>}
              {/* Transfer duty → project cost bridge indicator */}
              {step.type === "TRANSFER_DUTY" && doc.amount != null && doc.amount > 0 && doc.projectId && isObtained && (
                <p className="text-m-caption font-medium flex items-center gap-1" style={{ color: "var(--color-go)" }}>
                  <CheckCircle2 className="size-2.5" /> Transfer duty {formatCurrencyCompact(doc.amount)} auto-logged as project cost.
                </p>
              )}
              {step.type === "TRANSFER_DUTY" && doc.amount != null && doc.amount > 0 && !doc.projectId && (
                <p className="text-m-caption font-medium flex items-center gap-1" style={{ color: "#b45309" }}>
                  <AlertCircle className="size-2.5" /> Link land to a project to auto-log the duty as a cost.
                </p>
              )}
              <div className="flex items-center gap-2 pt-1.5 border-t" style={{ borderColor: "var(--color-line)" }}>
                {doc.documentUrl && (
                  <a href={doc.documentUrl} target="_blank" rel="noreferrer" className="flex items-center gap-1 text-m-label font-medium" style={{ color: "var(--color-brand)" }}>
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
            <p className="text-m-caption italic" style={{ color: "var(--color-ink-400)" }}>
              Tap &quot;Yes&quot; to record this permission.
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
  const _router = useRouter();
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
  const inputClass = "w-full h-7 px-1 text-m-caption outline-none border-b focus:border-b-2 transition-colors";
  const inputStyle = {
    backgroundColor: "transparent",
  };

  return (
    <MobileDialog open={true} onClose={onClose} title={editing ? "Edit Legal Document" : "Add Legal Document"}>
        {/* Body */}
        <div className="flex flex-col gap-3 pb-20">
          {/* Document Details */}
          <div className="rounded-[0.625rem] border p-3 flex flex-col gap-3" style={{ borderColor: "var(--color-line)", backgroundColor: "var(--color-paper)" }}>
            <p className="text-m-section font-extrabold tracking-tight" style={{ color: "var(--color-ink-950)" }}>
              Document Details
            </p>
            {/* Type + Status */}
            <div className="grid grid-cols-2 gap-2 divide-x" style={{ borderColor: "var(--color-line)" }}>
              <div>
                <EnumSelect
                  label="Type"
                  required
                  value={form.type}
                  onChange={(v) => {
                    const t = v as LegalDocType;
                    const step = LEGAL_DOC_FLOW_MAP[t];
                    if (step && !editing) {
                      setForm((f) => ({ ...f, type: t, title: step.label, authority: step.defaultAuthority }));
                    } else {
                      setField("type", t);
                    }
                  }}
                  options={LEGAL_DOC_FLOW.map((s) => ({ value: s.type, label: s.label }))}
                />
              </div>
              <div className="pl-2">
                <EnumSelect
                  label="Status"
                  value={form.status}
                  onChange={(v) => setField("status", v as LegalDocStatus)}
                  options={(Object.keys(STATUS_STYLE) as LegalDocStatus[]).map((s) => ({ value: s, label: STATUS_STYLE[s].label }))}
                />
              </div>
            </div>

            {/* Title */}
            <div>
              <label className="text-m-label font-semibold uppercase mb-1 block" style={{ color: "var(--color-ink-500)" }}>Title *</label>
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
            <div className="grid grid-cols-2 gap-2 divide-x" style={{ borderColor: "var(--color-line)" }}>
              <div>
                <label className="text-m-label font-semibold uppercase mb-1 block" style={{ color: "var(--color-ink-500)" }}>Authority</label>
                <input
                  type="text"
                  value={form.authority}
                  onChange={(e) => setField("authority", e.target.value)}
                  placeholder="e.g. DDA, Fire Dept"
                  className={inputClass}
                  style={inputStyle}
                />
              </div>
              <div className="pl-2">
                <label className="text-m-label font-semibold uppercase mb-1 block" style={{ color: "var(--color-ink-500)" }}>Ref. No.</label>
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
          </div>

          {/* Validity Dates */}
          <div className="rounded-[0.625rem] border p-3 flex flex-col gap-3" style={{ borderColor: "var(--color-line)", backgroundColor: "var(--color-paper)" }}>
            <p className="text-m-section font-extrabold tracking-tight" style={{ color: "var(--color-ink-950)" }}>
              Validity Dates
            </p>
            <div className="grid grid-cols-3 gap-2">
              <div>
                <label className="text-m-label font-semibold uppercase mb-1 block" style={{ color: "var(--color-ink-500)" }}>Issue Date</label>
                <input type="date" value={form.issueDate} onChange={(e) => setField("issueDate", e.target.value)} className={inputClass} style={inputStyle} />
              </div>
              <div>
                <label className="text-m-label font-semibold uppercase mb-1 block" style={{ color: "var(--color-ink-500)" }}>Valid From</label>
                <input type="date" value={form.validFrom} onChange={(e) => setField("validFrom", e.target.value)} className={inputClass} style={inputStyle} />
              </div>
              <div>
                <label className="text-m-label font-semibold uppercase mb-1 block" style={{ color: "var(--color-ink-500)" }}>Valid Till</label>
                <input type="date" value={form.validTill} onChange={(e) => setField("validTill", e.target.value)} className={inputClass} style={inputStyle} />
              </div>
            </div>
          </div>

          {/* Financial Details */}
          <div className="rounded-[0.625rem] border p-3 flex flex-col gap-3" style={{ borderColor: "var(--color-line)", backgroundColor: "var(--color-paper)" }}>
            <p className="text-m-section font-extrabold tracking-tight" style={{ color: "var(--color-ink-950)" }}>
              Financial Details
            </p>
          {isATS ? (
            <div className="rounded-[0.5rem] border p-3 space-y-2" style={{ borderColor: "var(--color-brand)", backgroundColor: "rgba(59,130,246,0.05)" }}>
              <p className="text-m-section font-bold" style={{ color: "var(--color-brand)" }}>Agreement to Sell</p>
              <div className="grid grid-cols-2 gap-2">
                <div>
                  <label className="text-m-label font-semibold uppercase mb-1 block" style={{ color: "var(--color-ink-500)" }}>Reg. Amount (₹)</label>
                  <input type="number" min={0} step="any" value={form.amount} onChange={(e) => setField("amount", e.target.value)} placeholder="5000000" className={inputClass} style={inputStyle} />
                </div>
                <div>
                  <label className="text-m-label font-semibold uppercase mb-1 block" style={{ color: "var(--color-ink-500)" }}>Expected Registry</label>
                  <input type="date" value={form.expectedRegistryDate} onChange={(e) => setField("expectedRegistryDate", e.target.value)} className={inputClass} style={inputStyle} />
                </div>
              </div>
              <p className="text-m-label" style={{ color: "var(--color-ink-500)" }}>
                ATS is a legal substitute for registry — used when the seller cannot registry immediately.
              </p>
            </div>
          ) : (
            <div>
              <label className="text-m-label font-semibold uppercase mb-1 block" style={{ color: "var(--color-ink-500)" }}>Fee / Amount (₹) — optional</label>
              <input type="number" min={0} step="any" value={form.amount} onChange={(e) => setField("amount", e.target.value)} placeholder="50000" className={inputClass} style={inputStyle} />
            </div>
          )}
          </div>

          {/* Attachment */}
          <div className="rounded-[0.625rem] border p-3 flex flex-col gap-3" style={{ borderColor: "var(--color-line)", backgroundColor: "var(--color-paper)" }}>
            <p className="text-m-section font-extrabold tracking-tight" style={{ color: "var(--color-ink-950)" }}>
              Attachment
            </p>
          <div>
            <label className="text-m-label font-semibold uppercase mb-1 block" style={{ color: "var(--color-ink-500)" }}>Proof Document</label>
            {form.documentUrl ? (
              <div className="flex items-center justify-between gap-2 rounded-[0.5rem] border px-3 py-2" style={{ borderColor: "var(--color-line)", backgroundColor: "var(--color-surface)" }}>
                <a href={form.documentUrl} target="_blank" rel="noreferrer" className="flex min-w-0 items-center gap-2 text-m-section" style={{ color: "var(--color-ink-900)" }}>
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
                className="w-full flex items-center justify-center gap-2 rounded-[0.5rem] border border-dashed px-3 py-2.5 text-m-body"
                style={{ borderColor: "var(--color-line)", color: "var(--color-ink-500)" }}
              >
                {uploading ? <Loader2 className="size-3.5 animate-spin" /> : <Upload className="size-3.5" />}
                {uploading ? "Uploading…" : "Upload certificate / NOC / document"}
              </button>
            )}
            <input ref={fileInputRef} type="file" className="hidden" onChange={handleUpload} disabled={uploading} accept=".pdf,.doc,.docx,.jpg,.jpeg,.png,.zip" />
          </div>
          </div>

          {/* Notes */}
          <div className="rounded-[0.625rem] border p-3 flex flex-col gap-3" style={{ borderColor: "var(--color-line)", backgroundColor: "var(--color-paper)" }}>
            <p className="text-m-section font-extrabold tracking-tight" style={{ color: "var(--color-ink-950)" }}>
              Notes
            </p>
            <div>
              <label className="text-m-label font-semibold uppercase mb-1 block" style={{ color: "var(--color-ink-500)" }}>Notes</label>
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
        </div>

        {/* Footer */}
        <div className="sticky bottom-0 flex gap-2 p-3 border-t" style={{ backgroundColor: "var(--color-paper)", borderColor: "var(--color-line)" }}>
          <button
            onClick={onClose}
            disabled={saving}
            className="flex-1 rounded-[0.5rem] border py-2.5 text-m-section font-semibold"
            style={{ borderColor: "var(--color-line)", color: "var(--color-ink-700)" }}
          >
            Cancel
          </button>
          <button
            onClick={handleSubmit}
            disabled={saving}
            className="flex-1 rounded-[0.5rem] py-2.5 text-m-section font-semibold flex items-center justify-center gap-1"
            style={{ backgroundColor: "var(--color-brand)", color: "var(--color-brand-foreground)" }}
          >
            {saving ? <Loader2 className="size-3.5 animate-spin" /> : <CheckCircle2 className="size-3.5" />}
            {saving ? "Saving…" : editing ? "Update" : "Add"}
          </button>
        </div>
    </MobileDialog>
  );
}

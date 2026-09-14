"use client";

import { useRef, useState } from "react";
import { useRouter } from "next/navigation";
import {
  FileText, Loader2, Plus, Upload, X,
} from "lucide-react";
import { toast } from "sonner";
import { haptic } from "@/lib/haptic";
import { MobileDialog } from "@/components/mobile/v2/dialog";
import {
  SectionCard, UnderlineInput, EnumSelect,
} from "@/components/mobile/v2/form-primitives";
import {
  LEGAL_DOC_FLOW, LEGAL_DOC_FLOW_MAP, getFlowStepsForContext,
} from "@/lib/legal-doc-flow";
import type { LegalDocStatus, LegalDocType } from "@/components/legal/legal-docs-section";

type EntityKind = "PROJECT" | "LAND";

interface FormState {
  entityKind: EntityKind | "";
  projectId: string;
  landPurchaseId: string;
  type: LegalDocType;
  title: string;
  authority: string;
  status: LegalDocStatus;
  docNumber: string;
  applicationDate: string;
  issueDate: string;
  validFrom: string;
  validTill: string;
  amount: string;
  expectedRegistryDate: string;
  notes: string;
  documentUrl: string | null;
  documentName: string | null;
}

const STATUS_OPTIONS: { value: LegalDocStatus; label: string }[] = [
  { value: "PENDING", label: "Pending" },
  { value: "APPROVED", label: "Approved" },
  { value: "REJECTED", label: "Rejected" },
  { value: "EXPIRED", label: "Expired" },
  { value: "RENEWAL_DUE", label: "Renewal Due" },
  { value: "NOT_REQUIRED", label: "N/A" },
];

/**
 * MobileNewLegalDocForm — form content for creating a legal document
 * (permission, license, NOC, certificate, ATS) from the /m/permissions
 * overview page.
 *
 * Unlike the per-entity MobileLegalDocForm (embedded on project/land
 * detail pages), this one asks the user to pick WHICH project or land
 * parcel the document belongs to — the API requires a link.
 *
 * Used inside <MobileFabModal> (spring-from-FAB animation) via
 * <MobilePermissionsFab>, or wrapped by <MobileNewLegalDocDialog>
 * (legacy bottom-sheet) for inline creation from other pages.
 * Mirrors MobileNewRateContractForm.
 */
export function MobileNewLegalDocForm({
  onClose,
  projects,
  landPurchases,
}: {
  onClose: () => void;
  projects: { id: string; name: string }[];
  landPurchases: { id: string; sellerName: string; location: string | null }[];
}) {
  const router = useRouter();
  const [saving, setSaving] = useState(false);
  const [uploading, setUploading] = useState(false);
  const fileInputRef = useRef<HTMLInputElement>(null);
  const [form, setForm] = useState<FormState>({
    entityKind: projects.length > 0 ? "PROJECT" : landPurchases.length > 0 ? "LAND" : "",
    projectId: "",
    landPurchaseId: "",
    type: "OTHER",
    title: "",
    authority: "",
    status: "PENDING",
    docNumber: "",
    applicationDate: "",
    issueDate: "",
    validFrom: "",
    validTill: "",
    amount: "",
    expectedRegistryDate: "",
    notes: "",
    documentUrl: null,
    documentName: null,
  });

  function set<K extends keyof FormState>(key: K, value: FormState[K]) {
    setForm((f) => ({ ...f, [key]: value }));
  }

  const entityOptions = form.entityKind === "LAND"
    ? landPurchases.map((l) => ({
        value: l.id,
        label: l.location ? `${l.sellerName} — ${l.location}` : l.sellerName,
      }))
    : projects.map((p) => ({ value: p.id, label: p.name }));

  const typeOptions = [
    ...(form.entityKind
      ? getFlowStepsForContext(form.entityKind)
      : LEGAL_DOC_FLOW
    ).map((s) => ({ value: s.type, label: s.label })),
    { value: "OTHER", label: "Other Document" },
  ];

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
      setForm((f) => ({ ...f, documentUrl: data.url, documentName: data.fileName }));
      toast.success("Document uploaded");
    } catch (err: unknown) {
      toast.error(err instanceof Error ? err.message : "Upload failed");
    } finally {
      setUploading(false);
    }
  }

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (!form.entityKind) {
      toast.error("Choose whether this document belongs to a project or land parcel");
      return;
    }
    const projectId = form.entityKind === "PROJECT" ? form.projectId : "";
    const landPurchaseId = form.entityKind === "LAND" ? form.landPurchaseId : "";
    if (!projectId && !landPurchaseId) {
      toast.error(form.entityKind === "PROJECT" ? "Select a project" : "Select a land parcel");
      return;
    }
    if (!form.title.trim()) {
      toast.error("Title is required");
      return;
    }

    setSaving(true);
    haptic(10);
    try {
      const step = LEGAL_DOC_FLOW_MAP[form.type];
      const res = await fetch("/api/legal-documents", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          landPurchaseId: landPurchaseId || null,
          projectId: projectId || null,
          type: form.type,
          title: form.title.trim(),
          authority: form.authority.trim() || null,
          status: form.status,
          appliesTo: step?.appliesTo ?? form.entityKind,
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
        }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error ?? "Failed to create legal document");
      haptic([10, 40, 80]);
      toast.success("Legal document added");
      onClose();
      router.refresh();
    } catch (err) {
      haptic([50, 20, 50]);
      toast.error(err instanceof Error ? err.message : "Something went wrong");
    } finally {
      setSaving(false);
    }
  }

  const step = LEGAL_DOC_FLOW_MAP[form.type];
  const isATS = form.type === "AGREEMENT_TO_SELL";

  return (
    <form onSubmit={handleSubmit} className="flex flex-col gap-3">
      {/* Linked To */}
      <SectionCard title="Linked To">
        <div
          className="grid grid-cols-2 gap-2 divide-x"
          style={{ borderColor: "var(--color-line)" }}
        >
          <EnumSelect
            label="Belongs To"
            required
            value={form.entityKind}
            onChange={(v) =>
              setForm((f) => {
                const kind = v as EntityKind;
                // If the chosen doc type doesn't apply to the new context
                // (e.g. RERA under LAND), reset it so the picker isn't stale.
                const stepStillValid =
                  f.type === "OTHER" ||
                  getFlowStepsForContext(kind).some((s) => s.type === f.type);
                return {
                  ...f,
                  entityKind: kind,
                  projectId: "",
                  landPurchaseId: "",
                  ...(stepStillValid
                    ? {}
                    : { type: "OTHER", title: "", authority: "" }),
                };
              })
            }
            options={[
              ...(projects.length > 0 ? [{ value: "PROJECT", label: "Project" }] : []),
              ...(landPurchases.length > 0 ? [{ value: "LAND", label: "Land Parcel" }] : []),
            ]}
          />
          <div className="pl-2">
            <EnumSelect
              label={form.entityKind === "LAND" ? "Land Parcel" : "Project"}
              required
              value={form.entityKind === "LAND" ? form.landPurchaseId : form.projectId}
              onChange={(v) =>
                form.entityKind === "LAND" ? set("landPurchaseId", v) : set("projectId", v)
              }
              placeholder={form.entityKind ? "— Select —" : "— Pick type first —"}
              options={entityOptions}
            />
          </div>
        </div>
      </SectionCard>

      {/* Document Details */}
      <SectionCard title="Document Details">
        <div
          className="grid grid-cols-2 gap-2 divide-x"
          style={{ borderColor: "var(--color-line)" }}
        >
          <EnumSelect
            label="Type"
            required
            value={form.type}
            onChange={(v) => {
              const t = v as LegalDocType;
              const s = LEGAL_DOC_FLOW_MAP[t];
              if (s) {
                setForm((f) => ({ ...f, type: t, title: s.label, authority: s.defaultAuthority }));
              } else {
                set("type", t);
              }
            }}
            options={typeOptions}
          />
          <div className="pl-2">
            <EnumSelect
              label="Status"
              value={form.status}
              onChange={(v) => set("status", v as LegalDocStatus)}
              options={STATUS_OPTIONS}
            />
          </div>
        </div>

        <UnderlineInput
          label="Title"
          required
          value={form.title}
          onChange={(v) => set("title", v)}
          placeholder="e.g. Map Approval — Tower A"
        />

        <div
          className="grid grid-cols-2 gap-2 divide-x"
          style={{ borderColor: "var(--color-line)" }}
        >
          <UnderlineInput
            label="Authority"
            value={form.authority}
            onChange={(v) => set("authority", v)}
            placeholder="e.g. DDA, Fire Dept"
          />
          <div className="pl-2">
            <UnderlineInput
              label="Ref. No."
              value={form.docNumber}
              onChange={(v) => set("docNumber", v)}
              placeholder="e.g. DDA/LU/2024/123"
            />
          </div>
        </div>
      </SectionCard>

      {/* Validity */}
      <SectionCard title="Validity">
        <div
          className="grid grid-cols-2 gap-2 divide-x"
          style={{ borderColor: "var(--color-line)" }}
        >
          <UnderlineInput
            label="Applied On"
            value={form.applicationDate}
            onChange={(v) => set("applicationDate", v)}
            type="date"
          />
          <div className="pl-2">
            <UnderlineInput
              label="Issue Date"
              value={form.issueDate}
              onChange={(v) => set("issueDate", v)}
              type="date"
            />
          </div>
        </div>
        <div
          className="grid grid-cols-2 gap-2 divide-x"
          style={{ borderColor: "var(--color-line)" }}
        >
          <UnderlineInput
            label="Valid From"
            value={form.validFrom}
            onChange={(v) => set("validFrom", v)}
            type="date"
          />
          <div className="pl-2">
            <UnderlineInput
              label="Valid Till"
              value={form.validTill}
              onChange={(v) => set("validTill", v)}
              type="date"
            />
          </div>
        </div>
      </SectionCard>

      {/* Financials */}
      <SectionCard title="Financials">
        {isATS ? (
          <div
            className="rounded-[0.5rem] border p-3 space-y-2"
            style={{ borderColor: "var(--color-brand)", backgroundColor: "rgba(59,130,246,0.05)" }}
          >
            <p className="text-m-section font-bold" style={{ color: "var(--color-brand)" }}>
              Agreement to Sell
            </p>
            <div className="grid grid-cols-2 gap-2">
              <UnderlineInput
                label="Reg. Amount (₹)"
                value={form.amount}
                onChange={(v) => set("amount", v)}
                placeholder="5000000"
                type="number"
                min={0}
                step="any"
                inputMode="decimal"
              />
              <UnderlineInput
                label="Expected Registry"
                value={form.expectedRegistryDate}
                onChange={(v) => set("expectedRegistryDate", v)}
                type="date"
              />
            </div>
            <p className="text-m-label" style={{ color: "var(--color-ink-500)" }}>
              ATS is a legal substitute for registry — used when the seller cannot registry immediately.
            </p>
          </div>
        ) : (
          <UnderlineInput
            label={`${step?.amountLabel ?? "Fee / Amount"} (₹) — optional`}
            value={form.amount}
            onChange={(v) => set("amount", v)}
            placeholder="50000"
            type="number"
            min={0}
            step="any"
            inputMode="decimal"
          />
        )}
      </SectionCard>

      {/* Attachment */}
      <SectionCard title="Attachment">
        <div>
          <label className="block text-m-caption font-bold mb-0" style={{ color: "var(--color-ink-700)" }}>
            Proof Document
          </label>
          {form.documentUrl ? (
            <div
              className="flex items-center justify-between gap-2 rounded-[0.5rem] border px-3 py-2"
              style={{ borderColor: "var(--color-line)", backgroundColor: "var(--color-paper-2)" }}
            >
              <a
                href={form.documentUrl}
                target="_blank"
                rel="noreferrer"
                className="flex min-w-0 items-center gap-2 text-m-section"
                style={{ color: "var(--color-ink-900)" }}
              >
                <FileText className="size-4 shrink-0" style={{ color: "var(--color-ink-500)" }} />
                <span className="truncate">{form.documentName ?? "View"}</span>
              </a>
              <button
                type="button"
                onClick={() => setForm((f) => ({ ...f, documentUrl: null, documentName: null }))}
                className="press shrink-0"
              >
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
          <input
            ref={fileInputRef}
            type="file"
            className="hidden"
            onChange={handleUpload}
            disabled={uploading}
            accept=".pdf,.doc,.docx,.jpg,.jpeg,.png,.zip"
          />
        </div>
      </SectionCard>

      {/* Notes */}
      <SectionCard title="Notes">
        <div>
          <label className="block text-m-caption font-bold mb-0" style={{ color: "var(--color-ink-700)" }}>
            Notes (optional)
          </label>
          <textarea
            value={form.notes}
            onChange={(e) => set("notes", e.target.value)}
            rows={2}
            placeholder="Conditions, remarks, or additional details"
            className="w-full px-1 py-1 text-m-caption outline-none border-b focus:border-b-2 resize-none transition-colors"
            style={{ borderColor: "var(--color-line)", backgroundColor: "transparent", color: "var(--color-ink-950)" }}
          />
        </div>
      </SectionCard>

      {/* ══════ STICKY BOTTOM ACTION BAR ══════ */}
      <div
        className="sticky bottom-0 left-0 right-0 z-20 border-t -mx-4 -mb-4 px-4 py-2"
        style={{ backgroundColor: "var(--color-paper)", borderColor: "var(--color-line)" }}
      >
        <div className="flex items-center justify-end gap-3">
          <button
            type="submit"
            disabled={saving}
            className="flex-1 h-11 rounded-[0.5rem] text-m-section font-bold text-m-body press disabled:opacity-50 flex items-center justify-center gap-1.5"
            style={{ backgroundColor: "var(--color-ink-950)", color: "var(--color-paper)" }}
          >
            {saving ? <Loader2 className="size-4 animate-spin" /> : <Plus className="size-4" />}
            {saving ? "Adding…" : "Add Document"}
          </button>
        </div>
      </div>
    </form>
  );
}

/**
 * MobileNewLegalDocDialog — legacy bottom-sheet backdrop wrapper.
 * Prefer the FAB + <MobileFabModal> pairing (see MobilePermissionsFab).
 */
export function MobileNewLegalDocDialog({
  open,
  onClose,
  projects,
  landPurchases,
}: {
  open: boolean;
  onClose: () => void;
  projects: { id: string; name: string }[];
  landPurchases: { id: string; sellerName: string; location: string | null }[];
}) {
  return (
    <MobileDialog open={open} onClose={onClose} title="Add Legal Document">
      <MobileNewLegalDocForm
        onClose={onClose}
        projects={projects}
        landPurchases={landPurchases}
      />
    </MobileDialog>
  );
}

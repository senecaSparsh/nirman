"use client";

import { useState, useEffect } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import {
  ShoppingCart, Plus, Trash2, Send, Loader2,
  CheckCircle2, Eye,
} from "lucide-react";
import { toast } from "sonner";
import { useLongPressNav } from "@/lib/use-long-press-nav";
import { useOfflineQueue } from "@/lib/offline/use-offline-queue";
import { useDrafts } from "@/lib/offline/use-drafts";
import { DraftBanner } from "@/components/mobile/draft-banner";
import { MobileSelectWithCreate } from "@/components/mobile/MobileSelectWithCreate";
import { MobileFabModal } from "@/components/mobile/v2/fab-modal";
import { MobileNewProjectDialog } from "@/app/m/projects/MobileNewProjectDialog";
import { MobileNewMaterialDialog } from "@/app/m/materials/MobileNewMaterialDialog";
import { MobileNewSupplierDialog } from "@/app/m/suppliers/MobileNewSupplierDialog";
import { MobileEmptyState } from "@/components/mobile/v2/primitives";
import { useSmartDefaults } from "@/lib/use-smart-defaults";
import { SmartDefaultsBadge } from "@/components/mobile/v2/smart-defaults-badge";
import { SectionCard, UnderlineInput } from "@/components/mobile/v2/form-primitives";

interface ProjectItem { id: string; name: string; }
interface MaterialItem { id: string; name: string; code: string; unit: string; }
interface SupplierItem { id: string; name: string; }

interface FormData {
  projects: ProjectItem[];
  materials: MaterialItem[];
  suppliers: SupplierItem[];
}

interface ReqLine {
  materialId: string;
  qty: string;
  notes: string;
  preferredSupplierId: string;
}

interface ReqDraft {
  projectId: string;
  neededByDate: string;
  notes: string;
  lines: ReqLine[];
}

const inputClass =
  "w-full h-7 px-1 text-m-caption outline-none border-b focus:border-b-2 transition-colors";
const inputStyle = {
    borderColor: "var(--color-line)",
    backgroundColor: "transparent",
    color: "var(--color-ink-950)",
  };

/**
 * Mobile material indent (requisition) creation form.
 * Site users request materials → approver reviews → PO conversion.
 */
// eslint-disable-next-line @typescript-eslint/no-unused-vars
export function MobileNewRequisitionClient({ data, onClose, onCreated }: { data: FormData; onClose?: () => void; onCreated?: (id: string) => void }) {
  const router = useRouter();
  const { online, enqueue } = useOfflineQueue();
  const submitLongPress = useLongPressNav("/m/procurement?tab=indents", "Indents list");
  const { draft, hasDraft, draftUpdatedAt, saveDraft, clearDraft } = useDrafts<ReqDraft>("requisition", "requisition-new");
  const [draftRestored, setDraftRestored] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [success, setSuccess] = useState<{ id: string; reqNumber: string; submitted: boolean } | null>(null);
  const [localSuppliers, setLocalSuppliers] = useState<SupplierItem[]>(data.suppliers);

  // ── Smart defaults — pre-fill project from last-used (if no draft) ──
  const { getDefault, recordDefaults } = useSmartDefaults("requisition");
  const [defaultsApplied, setDefaultsApplied] = useState(false);

  const [projectId, setProjectId] = useState("");
  const [neededByDate, setNeededByDate] = useState("");
  const [notes, setNotes] = useState("");
  const [lines, setLines] = useState<ReqLine[]>(
    [{ materialId: "", qty: "", notes: "", preferredSupplierId: "" }],
  );

  // Apply smart defaults on mount (if no draft to restore)
  useEffect(() => {
    if (hasDraft || draftRestored || defaultsApplied) return;
    const defProject = getDefault("projectId");
    if (defProject && data.projects.some((p) => p.id === defProject)) {
      setProjectId(defProject);
      setDefaultsApplied(true);
    }
  }, [hasDraft, draftRestored, defaultsApplied, getDefault, data.projects]);

  function addLine() {
    setLines([...lines, { materialId: "", qty: "", notes: "", preferredSupplierId: "" }]);
  }

  function removeLine(idx: number) {
    if (lines.length === 1) return;
    setLines(lines.filter((_, i) => i !== idx));
  }

  function updateLine(idx: number, field: keyof ReqLine, val: string) {
    setLines(lines.map((l, i) => (i === idx ? { ...l, [field]: val } : l)));
  }

  // Auto-save draft
  useEffect(() => {
    const hasContent = projectId || neededByDate || notes ||
      lines.some((l) => l.materialId || l.qty);
    if (!hasContent) return;
    saveDraft({ projectId, neededByDate, notes, lines });
  }, [projectId, neededByDate, notes, lines, saveDraft]);

  function restoreDraftState() {
    if (!draft) return;
    setProjectId(draft.projectId);
    setNeededByDate(draft.neededByDate);
    setNotes(draft.notes);
    setLines(draft.lines.length > 0 ? draft.lines : [{ materialId: "", qty: "", notes: "", preferredSupplierId: "" }]);
  }

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (!projectId) {
      toast.error("Please select a project");
      return;
    }
    const validLines = lines.filter((l) => l.materialId && Number(l.qty) > 0);
    if (validLines.length === 0) {
      toast.error("Add at least one material with quantity > 0");
      return;
    }
    setSubmitting(true);
    try {
      // Record smart defaults for next time
      recordDefaults({ projectId });

      const payload = {
        projectId,
        neededByDate: neededByDate || null,
        notes: notes.trim() || null,
        autoSubmit: true,
        lines: validLines.map((l) => ({
          materialId: l.materialId,
          qtyRequested: Number(l.qty),
          notes: l.notes.trim() || null,
          preferredSupplierId: l.preferredSupplierId || null,
        })),
      };

      // Offline: queue for later sync
      if (!online) {
        await enqueue("requisition", payload);
        toast.success("Indent queued offline", {
          description: "Will sync when back online",
        });
        clearDraft();
        if (onCreated) {
          onCreated("");
        } else {
          router.push("/m/procurement?tab=indents");
          router.refresh();
        }
        return;
      }

      const res = await fetch("/api/requisitions", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(payload),
      });
      const result = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(result.error ?? "Failed to create indent");
      if (result.submitted) {
        toast.success(`Indent ${result.reqNumber ?? "created"} submitted for approval`);
      } else {
        toast.warning(
          `Indent ${result.reqNumber ?? "created"} saved as draft`,
          {
            description: result.submitError
              ? `Auto-submit failed: ${result.submitError}`
              : "You can submit it for approval from the indent list.",
          },
        );
      }
      clearDraft();
      setSuccess({ id: result.id, reqNumber: result.reqNumber ?? "created", submitted: result.submitted });
    } catch (err: unknown) {
      toast.error(err instanceof Error ? err.message : "Error creating indent");
    } finally {
      setSubmitting(false);
    }
  }

  if (data.projects.length === 0) {
    return (
      <MobileEmptyState
        icon={ShoppingCart}
        title="No projects available"
        description="Create a project first to raise material indents"
        action={
          <Link
            href="/m/real-estate?tab=projects"
            className="flex items-center justify-center gap-1.5 rounded-[0.5rem] border-2 border-dashed px-6 py-2.5 text-m-body font-bold text-m-body press"
            style={{ borderColor: "var(--color-signal)", color: "var(--color-signal-dark)" }}
          >
            <Plus className="size-3.5" />
            Go to Projects
          </Link>
        }
      />
    );
  }

  /* ── Success state ── */
  if (success) {
    return (
      <div className="flex flex-col items-center justify-center py-12 px-4 text-center">
        <div
          className="grid place-items-center size-14 rounded-full mb-3"
          style={{ backgroundColor: success.submitted ? "color-mix(in srgb, var(--color-go) 12%, transparent)" : "color-mix(in srgb, var(--color-signal) 12%, transparent)" }}
        >
          <CheckCircle2 className="size-7" style={{ color: success.submitted ? "var(--color-go)" : "var(--color-signal)" }} />
        </div>
        <p className="text-m-section font-extrabold tracking-tight mb-1" style={{ color: "var(--color-ink-950)" }}>
          {success.submitted ? "Indent Submitted" : "Indent Saved as Draft"}
        </p>
        <p className="text-m-caption font-mono mb-3" style={{ color: "var(--color-ink-700)" }}>
          {success.reqNumber}
        </p>
        <p className="text-m-caption mb-4" style={{ color: "var(--color-ink-700)" }}>
          {success.submitted
            ? "It's now in the approval queue for a manager to review."
            : "You can submit it for approval from the indent list."}
        </p>
        <div className="flex flex-col gap-3 w-full max-w-xs">
          {success.id ? (
            <button
              onClick={() => {
                if (onCreated) {
                  onCreated(success.id);
                } else {
                  router.push(`/m/requisitions/${success.id}`);
                }
              }}
              className="rounded-[0.5rem] px-4 py-2.5 text-m-body font-bold press active:scale-95"
              style={{ backgroundColor: "var(--color-ink-950)", color: "var(--color-paper)" }}
            >
              <Eye className="size-4 inline mr-1" /> View Indent
            </button>
          ) : null}
          <button
            onClick={() => {
              // Reset form for another indent
              setSuccess(null);
              setProjectId(""); setNeededByDate(""); setNotes("");
              setLines([{ materialId: "", qty: "", notes: "", preferredSupplierId: "" }]);
              router.refresh();
            }}
            className="rounded-[0.5rem] px-4 py-2.5 text-m-body font-bold border-2 press active:scale-95"
            style={{ borderColor: "var(--color-line)", color: "var(--color-ink-700)", backgroundColor: "var(--color-paper)" }}
          >
            <Plus className="size-4 inline mr-1" /> Create Another
          </button>
          <button
            onClick={() => {
              if (onCreated) {
                onCreated("");
              } else {
                router.push("/m/procurement?tab=indents");
                router.refresh();
              }
            }}
            className="rounded-[0.5rem] px-4 py-2.5 text-m-body font-bold press active:scale-95"
            style={{ backgroundColor: "var(--color-ink-950)", color: "var(--color-paper)" }}
          >
            View All Indents
          </button>
        </div>
      </div>
    );
  }

  return (
    <div className="space-y-3">
      {hasDraft && !draftRestored && (
        <DraftBanner
          formName="Material Indent"
          updatedAt={draftUpdatedAt}
          onRestore={() => { restoreDraftState(); setDraftRestored(true); }}
          onDiscard={() => { clearDraft(); setDraftRestored(true); }}
        />
      )}
      {defaultsApplied && !hasDraft && (
        <SmartDefaultsBadge onDismiss={() => setDefaultsApplied(false)} />
      )}

      <form onSubmit={handleSubmit} className="space-y-3">
        {/* ── Project + date ── */}
        <SectionCard title="Indent Details">
          {/* Project + Needed by date (side by side) */}
          <div className="grid grid-cols-2 gap-2 divide-x" style={{ borderColor: "var(--color-line)" }}>
            <div>
              <MobileSelectWithCreate
                label="Project"
                required
                placeholder="— Select project —"
                value={projectId}
                onChange={setProjectId}
                options={data.projects.map((p) => ({ value: p.id, label: p.name }))}
                inputClass={inputClass}
                inputStyle={inputStyle}
                renderDialog={({ open, onClose, onCreated, originRect }) => (
                  <MobileFabModal open={open} onClose={onClose} originRect={originRect} title="New Project" nested>
                    <MobileNewProjectDialog
                      open={open}
                      onClose={onClose}
                      onCreated={(p) => onCreated(p.id, p.name)}
                    />
                  </MobileFabModal>
                )}
              />
            </div>
            <UnderlineInput
              label="Needed by date"
              type="date"
              value={neededByDate}
              onChange={setNeededByDate}
            />
          </div>
        </SectionCard>

        {/* ── Material lines ── */}
        <SectionCard
          title="Materials"
          action={
            <button
              type="button"
              onClick={addLine}
              className="flex items-center gap-1 rounded-[0.375rem] px-2 py-1 text-m-caption font-bold text-m-body press active:scale-95"
              style={{ backgroundColor: "var(--color-concrete)", color: "var(--color-ink-500)" }}
            >
              <Plus className="size-3" />
              <span>Add</span>
            </button>
          }
        >

          <div className="space-y-3">
            {lines.map((line, idx) => {
              const mat = data.materials.find((m) => m.id === line.materialId);
              return (
                <div
                  key={idx}
                  className="rounded-[0.5rem] border p-2 space-y-2.5"
                  style={{ borderColor: "var(--color-line)", backgroundColor: "var(--color-paper-2)" }}
                >
                  {/* Material + Qty (side by side) */}
                  <div className="flex items-start gap-2">
                    <div className="min-w-0 flex-1">
                      <MobileSelectWithCreate
                        label=""
                        createLabel="material"
                        required
                        placeholder="— Select material —"
                        value={line.materialId}
                        onChange={(val) => updateLine(idx, "materialId", val)}
                        options={data.materials.map((m) => ({ value: m.id, label: `${m.name} (${m.code})` }))}
                        inputClass={`${inputClass} text-m-body`}
                        inputStyle={inputStyle}
                        labelClass="hidden"
                        renderDialog={({ open, onClose, onCreated }) => (
                          <MobileNewMaterialDialog
                            open={open}
                            onClose={onClose}
                            categories={[]}
                            onCreated={(m) => onCreated(m.id, m.name)}
                            nested
                          />
                        )}
                      />
                    </div>
                    <div className="shrink-0 flex items-center gap-1">
                      <input
                        type="text"
                        inputMode="decimal"
                        step="any"
                        value={line.qty}
                        onChange={(e) => updateLine(idx, "qty", e.target.value)}
                        placeholder="Qty"
                        className="w-16 h-7 px-1 text-m-caption font-mono font-bold outline-none border-b focus:border-b-2 transition-colors text-center"
                        style={inputStyle}
                      />
                      <span className="text-m-caption shrink-0 truncate" style={{ color: "var(--color-ink-700)" }}>
                        {mat?.unit || "units"}
                      </span>
                    </div>
                    {lines.length > 1 ? (
                      <button
                        type="button"
                        onClick={() => removeLine(idx)}
                        className="p-1.5 text-m-body press active:scale-95 shrink-0"
                        style={{ color: "var(--color-ink-700)" }}
                      >
                        <Trash2 className="size-4" />
                      </button>
                    ) : null}
                  </div>

                  {/* Supplier + Line note (side by side) */}
                  <div className="grid grid-cols-2 gap-2 divide-x" style={{ borderColor: "var(--color-line)" }}>
                    <div>
                      <MobileSelectWithCreate
                        label="Preferred Supplier"
                        value={line.preferredSupplierId}
                        onChange={(val) => updateLine(idx, "preferredSupplierId", val)}
                        options={localSuppliers.map((s) => ({ value: s.id, label: s.name }))}
                        placeholder="No preferred supplier"
                        compact
                        renderDialog={({ open, onClose, onCreated }) => (
                          <MobileNewSupplierDialog
                            open={open}
                            onClose={onClose}
                            onCreated={(s) => {
                              setLocalSuppliers((prev) =>
                                prev.find((x) => x.id === s.id) ? prev : [...prev, { id: s.id, name: s.name }],
                              );
                              onCreated(s.id, s.name);
                            }}
                          />
                        )}
                      />
                    </div>
                    <div>
                      <input
                        type="text"
                        value={line.notes}
                        onChange={(e) => updateLine(idx, "notes", e.target.value)}
                        placeholder="Line note (optional)"
                        className={`${inputClass} text-m-label`}
                        style={inputStyle}
                      />
                    </div>
                  </div>
                </div>
              );
            })}
          </div>
        </SectionCard>

        {/* ── Notes ── */}
        <div>
          <label className="block text-m-caption font-semibold mb-1" style={{ color: "var(--color-ink-700)" }}>
            Indent notes
          </label>
          <textarea
            value={notes}
            onChange={(e) => setNotes(e.target.value)}
            rows={2}
            placeholder="e.g. Urgent — foundation work starting Monday"
            className={`${inputClass} resize-none`}
            style={inputStyle}
          />
        </div>

        {/* ── Submit (sticky bottom) ── */}
      </form>

      <div
        className="sticky bottom-0 left-0 right-0 z-20 border-t backdrop-blur-sm"
        style={{
          backgroundColor: "color-mix(in srgb, var(--color-paper) 97%, transparent)",
          borderColor: "var(--color-line)",
          paddingBottom: "calc(0.5rem + env(safe-area-inset-bottom))",
        }}
      >
        <div className="max-w-md mx-auto px-3.5 py-2.5">
          <button
            type="button"
            onClick={(e) => { if (submitLongPress.wasLongPress()) return; handleSubmit(e as unknown as React.FormEvent); }}
            disabled={submitting}
            {...submitLongPress.longPressProps}
            className="flex w-full items-center justify-center gap-1 rounded-[0.625rem] py-3 text-m-section font-bold text-m-body press transition-transform active:scale-95 disabled:opacity-50 select-none"
            style={{ backgroundColor: "var(--color-ink-950)", color: "var(--color-paper)", touchAction: "none" }}
          >
            {submitting ? (
              <Loader2 className="size-4 animate-spin" />
            ) : (
              <>
                <Send className="size-4" />
                <span>Submit Indent</span>
              </>
            )}
          </button>
        </div>
      </div>
    </div>
  );
}

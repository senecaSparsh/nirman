"use client";

import { useState, useEffect } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import {
  ShoppingCart, Plus, Trash2, Send, Loader2, ChevronLeft, WifiOff,
} from "lucide-react";
import { toast } from "sonner";
import { MobileBackButton } from "@/components/mobile/v2/mobile-back-button";
import { useOfflineQueue } from "@/lib/offline/use-offline-queue";
import { useDrafts } from "@/lib/offline/use-drafts";
import { DraftBanner } from "@/components/mobile/draft-banner";

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
  "w-full rounded-[0.375rem] border px-2.5 py-2 text-[0.75rem] font-medium outline-none focus:ring-2";
const inputStyle = {
  borderColor: "var(--color-line)",
  backgroundColor: "var(--color-paper)",
  color: "var(--color-ink-950)",
};

/**
 * Mobile material indent (requisition) creation form.
 * Site users request materials → approver reviews → PO conversion.
 */
export function MobileNewRequisitionClient({ data }: { data: FormData }) {
  const router = useRouter();
  const { online, enqueue } = useOfflineQueue();
  const { draft, hasDraft, draftUpdatedAt, saveDraft, clearDraft } = useDrafts<ReqDraft>("requisition", "requisition-new");
  const [submitting, setSubmitting] = useState(false);

  const [projectId, setProjectId] = useState(data.projects[0]?.id ?? "");
  const [neededByDate, setNeededByDate] = useState("");
  const [notes, setNotes] = useState("");
  const [lines, setLines] = useState<ReqLine[]>(
    data.materials.length > 0
      ? [{ materialId: data.materials[0]!.id, qty: "", notes: "", preferredSupplierId: "" }]
      : [{ materialId: "", qty: "", notes: "", preferredSupplierId: "" }],
  );

  function addLine() {
    const defaultMat = data.materials[0]?.id ?? "";
    setLines([...lines, { materialId: defaultMat, qty: "", notes: "", preferredSupplierId: "" }]);
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
      const payload = {
        projectId,
        neededByDate: neededByDate || null,
        notes: notes.trim() || null,
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
        router.push("/m/requisitions");
        router.refresh();
        return;
      }

      const res = await fetch("/api/requisitions", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(payload),
      });
      const result = await res.json();
      if (!res.ok) throw new Error(result.error ?? "Failed to create indent");
      toast.success(`Indent ${result.reqNumber ?? "created"} submitted`);
      clearDraft();
      router.push("/m/requisitions");
      router.refresh();
    } catch (err: unknown) {
      toast.error(err instanceof Error ? err.message : "Error creating indent");
    } finally {
      setSubmitting(false);
    }
  }

  if (data.projects.length === 0) {
    return (
      <div>
        <div className="mb-4">
          <MobileBackButton fallback="/m/requisitions" style={{ color: "var(--color-ink-700)" }} />
        </div>
        <div
          className="flex flex-col items-center justify-center rounded-[0.5rem] border py-12 text-center"
          style={{ borderColor: "var(--color-line)", backgroundColor: "var(--color-paper-2)" }}
        >
          <ShoppingCart className="size-8 mb-2" style={{ color: "var(--color-ink-300)" }} />
          <p className="text-[0.875rem] font-semibold" style={{ color: "var(--color-ink-700)" }}>
            No projects available
          </p>
          <p className="text-[0.6875rem] mt-1 mb-4" style={{ color: "var(--color-ink-500)" }}>
            Create a project first to raise material indents
          </p>
          <Link
            href="/m/projects"
            className="flex items-center justify-center gap-1.5 rounded-[0.5rem] border-2 border-dashed px-6 py-2.5 text-[0.6875rem] font-bold press"
            style={{ borderColor: "var(--color-signal)", color: "var(--color-signal-dark)" }}
          >
            <Plus className="size-3.5" />
            Go to Projects
          </Link>
        </div>
      </div>
    );
  }

  return (
    <div className="space-y-3">
      <div className="flex items-center gap-2 mb-2">
        <MobileBackButton fallback="/m/requisitions" className="shrink-0" style={{ color: "var(--color-ink-700)" }} />
        <p className="text-[0.875rem] font-bold" style={{ color: "var(--color-ink-950)" }}>
          New Material Indent
        </p>
      </div>

      {hasDraft && (
        <DraftBanner
          formName="Material Indent"
          updatedAt={draftUpdatedAt}
          onRestore={restoreDraftState}
          onDiscard={clearDraft}
        />
      )}

      <form onSubmit={handleSubmit} className="space-y-3">
        {/* ── Project + date ── */}
        <div
          className="rounded-[0.625rem] border p-3 space-y-2.5"
          style={{ borderColor: "var(--color-line)", backgroundColor: "var(--color-paper)" }}
        >
          <div className="flex items-center gap-1.5 border-b pb-2" style={{ borderColor: "var(--color-line)" }}>
            <ShoppingCart className="size-3.5" style={{ color: "var(--color-steel)" }} />
            <span className="text-[0.5625rem] font-bold uppercase tracking-wide" style={{ color: "var(--color-ink-500)" }}>
              Indent Details
            </span>
          </div>

          <div>
            <label className="block text-[0.5625rem] font-semibold mb-1" style={{ color: "var(--color-ink-500)" }}>
              Project <span style={{ color: "var(--color-stop)" }}>*</span>
            </label>
            <select
              value={projectId}
              onChange={(e) => setProjectId(e.target.value)}
              className={inputClass}
              style={inputStyle}
              required
            >
              {data.projects.map((p) => (
                <option key={p.id} value={p.id}>{p.name}</option>
              ))}
            </select>
          </div>

          <div>
            <label className="block text-[0.5625rem] font-semibold mb-1" style={{ color: "var(--color-ink-500)" }}>
              Needed by date
            </label>
            <input
              type="date"
              value={neededByDate}
              onChange={(e) => setNeededByDate(e.target.value)}
              className={inputClass}
              style={inputStyle}
            />
          </div>
        </div>

        {/* ── Material lines ── */}
        <div
          className="rounded-[0.625rem] border p-3 space-y-2.5"
          style={{ borderColor: "var(--color-line)", backgroundColor: "var(--color-paper)" }}
        >
          <div className="flex items-center justify-between border-b pb-2" style={{ borderColor: "var(--color-line)" }}>
            <span className="text-[0.5625rem] font-bold uppercase tracking-wide" style={{ color: "var(--color-ink-500)" }}>
              Materials
            </span>
            <button
              type="button"
              onClick={addLine}
              className="flex items-center gap-1 rounded-[0.375rem] px-2 py-1 text-[0.5625rem] font-bold press active:scale-95"
              style={{ backgroundColor: "var(--color-concrete)", color: "var(--color-steel)" }}
            >
              <Plus className="size-3" />
              <span>Add</span>
            </button>
          </div>

          <div className="space-y-2">
            {lines.map((line, idx) => {
              const mat = data.materials.find((m) => m.id === line.materialId);
              return (
                <div
                  key={idx}
                  className="rounded-[0.5rem] border p-2 space-y-1.5"
                  style={{ borderColor: "var(--color-line)", backgroundColor: "var(--color-paper-2)" }}
                >
                  <div className="flex items-start gap-2">
                    <div className="min-w-0 flex-1">
                      <select
                        value={line.materialId}
                        onChange={(e) => updateLine(idx, "materialId", e.target.value)}
                        className={`${inputClass} text-[0.6875rem]`}
                        style={inputStyle}
                      >
                        {data.materials.map((m) => (
                          <option key={m.id} value={m.id}>
                            {m.name} ({m.code})
                          </option>
                        ))}
                      </select>
                    </div>
                    {lines.length > 1 ? (
                      <button
                        type="button"
                        onClick={() => removeLine(idx)}
                        className="p-1.5 press active:scale-95 shrink-0"
                        style={{ color: "var(--color-ink-500)" }}
                      >
                        <Trash2 className="size-4" />
                      </button>
                    ) : null}
                  </div>

                  <div className="flex items-center gap-2">
                    <input
                      type="text"
                      inputMode="decimal"
                      step="any"
                      value={line.qty}
                      onChange={(e) => updateLine(idx, "qty", e.target.value)}
                      placeholder="Qty"
                      className="w-20 rounded-[0.375rem] border px-2 py-1 text-[0.6875rem] font-mono font-bold outline-none"
                      style={inputStyle}
                    />
                    <span className="text-[0.5625rem] font-medium truncate" style={{ color: "var(--color-ink-500)" }}>
                      {mat?.unit || "units"}
                    </span>
                  </div>

                  {data.suppliers.length > 0 ? (
                    <select
                      value={line.preferredSupplierId}
                      onChange={(e) => updateLine(idx, "preferredSupplierId", e.target.value)}
                      className={`${inputClass} text-[0.625rem]`}
                      style={inputStyle}
                    >
                      <option value="">No preferred supplier</option>
                      {data.suppliers.map((s) => (
                        <option key={s.id} value={s.id}>{s.name}</option>
                      ))}
                    </select>
                  ) : null}

                  <input
                    type="text"
                    value={line.notes}
                    onChange={(e) => updateLine(idx, "notes", e.target.value)}
                    placeholder="Line note (optional)"
                    className={`${inputClass} text-[0.625rem]`}
                    style={inputStyle}
                  />
                </div>
              );
            })}
          </div>
        </div>

        {/* ── Notes ── */}
        <div>
          <label className="block text-[0.5625rem] font-semibold mb-1" style={{ color: "var(--color-ink-500)" }}>
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

        {/* ── Submit ── */}
        <button
          type="submit"
          disabled={submitting}
          className="flex w-full items-center justify-center gap-2 rounded-[0.625rem] py-3.5 text-[0.8125rem] font-bold press transition-transform active:scale-95 disabled:opacity-50"
          style={{ backgroundColor: "var(--color-ink-950)", color: "#fff" }}
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
      </form>
    </div>
  );
}

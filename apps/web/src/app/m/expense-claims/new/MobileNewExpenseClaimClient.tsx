"use client";

import { useState, useEffect, useRef } from "react";
import { useRouter } from "next/navigation";
import { Loader2, Send, Plus, Trash2, IndianRupee, Camera, CheckCircle2, Eye } from "lucide-react";
import { toast } from "sonner";
import { useLongPressNav } from "@/lib/use-long-press-nav";
import { useSmartDefaults } from "@/lib/use-smart-defaults";
import { useTodayDateState } from "@/lib/use-today-date";
import { SmartDefaultsBadge } from "@/components/mobile/v2/smart-defaults-badge";
import { SectionCard, SelectorModal } from "@/components/mobile/v2/form-primitives";
import { MobileFabModal } from "@/components/mobile/v2/fab-modal";
import { MobileNewProjectDialog } from "@/app/m/projects/MobileNewProjectDialog";
import { MobileNewEmployeeDialog } from "@/app/m/hr/employees/MobileNewEmployeeDialog";
import { formatCurrency } from "@/lib/utils";

type Employee = { id: string; name: string };
type Project = { id: string; name: string };
type Category = { id: string; name: string; isActive: boolean };

type ExpenseLine = {
  categoryId: string;
  category: string;
  amount: string;
  gstRate: string;
  date: string;
  notes: string;
  receiptUrl: string | null;
  receiptFile: File | null;
};

function emptyLine(defaultDate: string): ExpenseLine {
  return {
    categoryId: "",
    category: "",
    amount: "",
    gstRate: "",
    date: defaultDate,
    notes: "",
    receiptUrl: null,
    receiptFile: null,
  };
}

export function MobileNewExpenseClaimClient({
  employees,
  projects,
  categories,
  currentUserId,
  onCreated,
  onClose: _onClose,
}: {
  employees: Employee[];
  projects: Project[];
  categories: Category[];
  currentUserId: string | null;
  onClose?: () => void;
  onCreated?: (id: string) => void;
}) {
  const router = useRouter();
  const [saving, setSaving] = useState(false);
  const [success, setSuccess] = useState<{ id: string; submitted: boolean; lineCount: number; total: number } | null>(null);
  const [uploading, setUploading] = useState(false);
  const [claimantId, setClaimantId] = useState("");
  const [projectId, setProjectId] = useState("");
  const [description, setDescription] = useState("");
  const [modal, setModal] = useState<"claimant" | "project" | null>(null);
  const [showCreateProject, setShowCreateProject] = useState(false);
  const [showCreateEmployee, setShowCreateEmployee] = useState(false);
  const [extraProjects, setExtraProjects] = useState<Project[]>([]);
  const [extraEmployees, setExtraEmployees] = useState<Employee[]>([]);
  const [categoryModalLine, setCategoryModalLine] = useState<number | null>(null);
  const submitLongPress = useLongPressNav("/m/expense-claims", "Expense claims");
  const { getDefault, recordDefaults } = useSmartDefaults("expense-claim");
  const [defaultsApplied, setDefaultsApplied] = useState(false);
  const [today] = useTodayDateState();
  const [lines, setLines] = useState<ExpenseLine[]>([]);
  const fileInputRefs = useRef<(HTMLInputElement | null)[]>([]);

  // ── Default claimant to current user ──
  useEffect(() => {
    if (currentUserId && !claimantId) {
      const me = employees.find((e) => e.id === currentUserId);
      if (me) setClaimantId(currentUserId);
    }
  }, [currentUserId, employees, claimantId]);

  // ── Smart defaults: pre-fill project from last-used ──
  useEffect(() => {
    if (defaultsApplied) return;
    const defProject = getDefault("projectId");
    if (defProject && projects.some((p) => p.id === defProject)) {
      setProjectId(defProject);
    }
    setDefaultsApplied(true);
  }, [defaultsApplied, getDefault, projects]);

  // ── Auto-add first line when today's date is ready ──
  useEffect(() => {
    if (today && lines.length === 0) {
      setLines([emptyLine(today)]);
    }
  }, [today, lines.length]);

  const selectedClaimant = employees.find((e) => e.id === claimantId);
  const selectedProject = [...projects, ...extraProjects].filter((p, i, arr) => arr.findIndex((x) => x.id === p.id) === i).find((p) => p.id === projectId);

  // ── Compute total from valid lines ──
  const totalAmount = lines.reduce((sum, l) => {
    const amt = parseFloat(l.amount);
    if (!amt || amt <= 0) return sum;
    const gst = l.gstRate ? (amt * parseFloat(l.gstRate)) / 100 : 0;
    return sum + amt + gst;
  }, 0);

  function updateLine(idx: number, patch: Partial<ExpenseLine>) {
    setLines((prev) => prev.map((l, i) => (i === idx ? { ...l, ...patch } : l)));
  }

  function addLine() {
    setLines((prev) => [...prev, emptyLine(today)]);
  }

  function removeLine(idx: number) {
    setLines((prev) => prev.filter((_, i) => i !== idx));
  }

  async function uploadReceipt(file: File): Promise<string | null> {
    setUploading(true);
    try {
      const formData = new FormData();
      formData.append("file", file);
      const res = await fetch("/api/uploads", { method: "POST", body: formData });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error ?? "Upload failed");
      return data.url ?? null;
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Upload failed");
      return null;
    } finally {
      setUploading(false);
    }
  }

  function handleFileSelect(idx: number, file: File | null) {
    if (!file) return;
    updateLine(idx, { receiptFile: file, receiptUrl: null });
  }

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (!claimantId) {
      toast.error("Claimant is required");
      return;
    }
    // Validate lines — at least one valid line with amount > 0
    const validLines = lines.filter((l) => l.category.trim() && parseFloat(l.amount) > 0);
    if (validLines.length === 0) {
      toast.error("Add at least one expense line with category and amount");
      return;
    }
    setSaving(true);
    try {
      // Record smart defaults
      recordDefaults({ projectId });

      // Step 1: Create claim shell
      const createRes = await fetch("/api/expense-claims", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          claimantId,
          projectId: projectId || undefined,
          description: description.trim() || undefined,
        }),
      });
      const createData = await createRes.json().catch(() => ({}));
      if (!createRes.ok) throw new Error(createData.error ?? "Failed to create claim");
      const claimId = createData.id;

      // Step 2: Upload receipts + add lines
      for (const line of validLines) {
        let receiptUrl = line.receiptUrl;
        if (line.receiptFile) {
          const uploaded = await uploadReceipt(line.receiptFile);
          if (uploaded) receiptUrl = uploaded;
        }
        const lineRes = await fetch(`/api/expense-claims/${claimId}/lines`, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            categoryId: line.categoryId || null,
            category: line.category.trim(),
            amount: Number(line.amount),
            gstRate: line.gstRate ? Number(line.gstRate) : null,
            date: line.date || undefined,
            receiptUrl: receiptUrl || null,
            notes: line.notes.trim() || null,
          }),
        });
        if (!lineRes.ok) {
          const ld = await lineRes.json().catch(() => ({}));
          throw new Error(ld.error ?? "Failed to add expense line");
        }
      }

      // Step 3: Auto-submit the claim
      const submitRes = await fetch(`/api/expense-claims/${claimId}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ action: "submit" }),
      });
      if (!submitRes.ok) {
        // Claim created + lines added but submit failed — still usable
        setSuccess({ id: claimId, submitted: false, lineCount: validLines.length, total: totalAmount });
        return;
      }

      setSuccess({ id: claimId, submitted: true, lineCount: validLines.length, total: totalAmount });
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Something went wrong");
    } finally {
      setSaving(false);
    }
  }

  const handleSelect = (id: string) => {
    if (modal === "claimant") setClaimantId(id);
    else if (modal === "project") setProjectId(id);
    setModal(null);
  };

  const handleCategorySelect = (catId: string, catName: string) => {
    if (categoryModalLine !== null) {
      updateLine(categoryModalLine, { categoryId: catId, category: catName });
    }
    setCategoryModalLine(null);
  };

  const activeCategories = categories.filter((c) => c.isActive);

  if (success) {
    return (
      <div className="flex flex-col items-center justify-center py-12 px-4 text-center">
        <div className="grid place-items-center size-14 rounded-full mb-3" style={{ backgroundColor: success.submitted ? "color-mix(in srgb, var(--color-go) 12%, transparent)" : "color-mix(in srgb, var(--color-signal) 12%, transparent)" }}>
          <CheckCircle2 className="size-7" style={{ color: success.submitted ? "var(--color-go)" : "var(--color-signal)" }} />
        </div>
        <p className="text-m-section font-extrabold tracking-tight mb-1" style={{ color: "var(--color-ink-950)" }}>
          {success.submitted ? "Expense Claim Submitted" : "Expense Claim Saved as Draft"}
        </p>
        <p className="text-m-caption font-mono mb-1" style={{ color: "var(--color-ink-700)" }}>
          {success.lineCount} line {success.lineCount === 1 ? "item" : "items"} · {formatCurrency(success.total)}
        </p>
        <p className="text-m-caption mb-4" style={{ color: "var(--color-ink-500)" }}>
          {success.submitted
            ? "It's now in the approval queue for a manager to review."
            : "Submit it for approval from the claim detail page."}
        </p>
        <div className="flex flex-col gap-3 w-full max-w-xs">
          <button onClick={() => { if (onCreated) onCreated(success.id); else { router.push(`/m/expense-claims/${success.id}`); router.refresh(); } }} className="rounded-[0.5rem] px-4 py-2.5 text-m-body font-bold press active:scale-95" style={{ backgroundColor: "var(--color-ink-950)", color: "var(--color-paper)" }}>
            <Eye className="size-4 inline mr-1" /> View Claim
          </button>
          <button onClick={() => { setSuccess(null); setDescription(""); setLines([emptyLine(today)]); setExtraProjects([]); setExtraEmployees([]); router.refresh(); }} className="rounded-[0.5rem] px-4 py-2.5 text-m-body font-bold border-2 press active:scale-95" style={{ borderColor: "var(--color-line)", color: "var(--color-ink-700)", backgroundColor: "var(--color-paper)" }}>
            <Plus className="size-4 inline mr-1" /> Create Another
          </button>
        </div>
      </div>
    );
  }

  return (
    <div className="pb-32">
      <form onSubmit={handleSubmit} className="flex flex-col gap-3">
        {/* ══════ SECTION: CLAIM DETAILS ══════ */}
        <SectionCard title="Claim Details">
          <SelectorCardInline
            label="Claimant"
            value={selectedClaimant?.name}
            required
            onClick={() => setModal("claimant")}
          />

          <SelectorCardInline
            label="Project (optional)"
            value={selectedProject?.name}
            onClick={() => setModal("project")}
          />
          {selectedProject && <SmartDefaultsBadge />}

          <div>
            <label className="block text-m-caption font-bold mb-0" style={{ color: "var(--color-ink-700)" }}>
              Description
            </label>
            <textarea
              value={description}
              onChange={(e) => setDescription(e.target.value)}
              rows={2}
              placeholder="What is this claim for?"
              className="w-full px-1 text-m-caption outline-none border-b focus:border-b-2 transition-colors resize-none"
              style={{ borderColor: "var(--color-line)", backgroundColor: "transparent", color: "var(--color-ink-950)" }}
            />
          </div>
        </SectionCard>

        {/* ══════ SECTION: EXPENSE LINES ══════ */}
        <SectionCard title={`Expense Lines (${lines.length})`}>
          {lines.map((line, idx) => (
            <div
              key={idx}
              className="rounded-[0.5rem] border p-3 mb-2"
              style={{ borderColor: "var(--color-line)", backgroundColor: "var(--color-paper)" }}
            >
              {/* Category selector */}
              <div className="mb-2">
                <label className="block text-m-caption font-bold mb-0" style={{ color: "var(--color-ink-700)" }}>
                  Category <span style={{ color: "var(--color-stop)" }}>*</span>
                </label>
                <button
                  type="button"
                  onClick={() => setCategoryModalLine(idx)}
                  className="w-full h-7 px-1 text-m-caption outline-none border-b focus:border-b-2 transition-colors text-left press"
                  style={{
                    borderColor: "var(--color-line)",
                    backgroundColor: "transparent",
                    color: line.category ? "var(--color-ink-950)" : "var(--color-ink-500)",
                  }}
                >
                  <span className="truncate block">{line.category || "— Select —"}</span>
                </button>
              </div>

              {/* Amount + Date */}
              <div className="flex gap-3 mb-2">
                <div className="flex-1">
                  <label className="block text-m-caption font-bold mb-0" style={{ color: "var(--color-ink-700)" }}>
                    Amount <span style={{ color: "var(--color-stop)" }}>*</span>
                  </label>
                  <div className="flex items-center border-b focus:border-b-2 transition-colors" style={{ borderColor: "var(--color-line)" }}>
                    <IndianRupee className="size-3 shrink-0" style={{ color: "var(--color-ink-500)" }} />
                    <input
                      type="number"
                      min="0"
                      step="0.01"
                      inputMode="decimal"
                      value={line.amount}
                      onChange={(e) => updateLine(idx, { amount: e.target.value })}
                      placeholder="0"
                      className="w-full px-1 h-7 text-m-caption outline-none tabular-nums"
                      style={{ backgroundColor: "transparent", color: "var(--color-ink-950)" }}
                    />
                  </div>
                </div>
                <div className="flex-1">
                  <label className="block text-m-caption font-bold mb-0" style={{ color: "var(--color-ink-700)" }}>
                    Date
                  </label>
                  <input
                    type="date"
                    value={line.date}
                    onChange={(e) => updateLine(idx, { date: e.target.value })}
                    className="w-full h-7 px-1 text-m-caption outline-none border-b focus:border-b-2 transition-colors"
                    style={{ borderColor: "var(--color-line)", backgroundColor: "transparent", color: "var(--color-ink-950)" }}
                  />
                </div>
              </div>

              {/* GST + Notes */}
              <div className="flex gap-3 mb-2">
                <div className="w-20">
                  <label className="block text-m-caption font-bold mb-0" style={{ color: "var(--color-ink-700)" }}>
                    GST %
                  </label>
                  <input
                    type="number"
                    min="0"
                    max="28"
                    step="0.01"
                    inputMode="decimal"
                    value={line.gstRate}
                    onChange={(e) => updateLine(idx, { gstRate: e.target.value })}
                    placeholder="0"
                    className="w-full h-7 px-1 text-m-caption outline-none border-b focus:border-b-2 transition-colors tabular-nums"
                    style={{ borderColor: "var(--color-line)", backgroundColor: "transparent", color: "var(--color-ink-950)" }}
                  />
                </div>
                <div className="flex-1">
                  <label className="block text-m-caption font-bold mb-0" style={{ color: "var(--color-ink-700)" }}>
                    Notes
                  </label>
                  <input
                    type="text"
                    value={line.notes}
                    onChange={(e) => updateLine(idx, { notes: e.target.value })}
                    placeholder="Optional"
                    className="w-full h-7 px-1 text-m-caption outline-none border-b focus:border-b-2 transition-colors"
                    style={{ borderColor: "var(--color-line)", backgroundColor: "transparent", color: "var(--color-ink-950)" }}
                  />
                </div>
              </div>

              {/* Receipt photo */}
              <div className="flex items-center justify-between gap-2">
                <div className="flex items-center gap-2">
                  <input
                    ref={(el) => { fileInputRefs.current[idx] = el; }}
                    type="file"
                    accept="image/*,application/pdf"
                    capture="environment"
                    className="hidden"
                    onChange={(e) => handleFileSelect(idx, e.target.files?.[0] ?? null)}
                  />
                  <button
                    type="button"
                    onClick={() => fileInputRefs.current[idx]?.click()}
                    disabled={uploading}
                    className="flex items-center gap-1 text-m-caption font-semibold press"
                    style={{ color: "var(--color-signal)" }}
                  >
                    <Camera className="size-3.5" />
                    {line.receiptFile ? "Receipt selected" : "Add receipt"}
                  </button>
                  {uploading && <Loader2 className="size-3 animate-spin" />}
                </div>
                {lines.length > 1 && (
                  <button
                    type="button"
                    onClick={() => removeLine(idx)}
                    className="flex items-center gap-1 text-m-caption font-semibold press"
                    style={{ color: "var(--color-stop)" }}
                  >
                    <Trash2 className="size-3.5" />
                  </button>
                )}
              </div>
            </div>
          ))}

          {/* Add line button */}
          <button
            type="button"
            onClick={addLine}
            className="w-full flex items-center justify-center gap-1.5 py-2 text-m-caption font-bold press"
            style={{ color: "var(--color-signal)" }}
          >
            <Plus className="size-3.5" />
            Add another line
          </button>

          {/* Total */}
          {totalAmount > 0 && (
            <div
              className="mt-2 flex items-center justify-between border-t pt-2"
              style={{ borderColor: "var(--color-line)" }}
            >
              <span className="text-m-caption font-bold uppercase tracking-wider" style={{ color: "var(--color-steel)" }}>
                Total
              </span>
              <span className="text-m-body font-bold tabular-nums" style={{ color: "var(--color-ink-950)" }}>
                {formatCurrency(totalAmount)}
              </span>
            </div>
          )}
        </SectionCard>
      </form>

      {/* ══════ STICKY BOTTOM BAR ══════ */}
      <div
        className="sticky bottom-0 left-0 right-0 z-30 border-t"
        style={{ backgroundColor: "var(--color-paper)", borderColor: "var(--color-line)" }}
      >
        <div className="px-3 py-2 flex items-center justify-end gap-2">
          <button
            type="button"
            onClick={(e) => { if (submitLongPress.wasLongPress()) return; handleSubmit(e as unknown as React.FormEvent); }}
            disabled={saving || uploading}
            {...submitLongPress.longPressProps}
            className="flex-1 flex items-center justify-center gap-1.5 rounded-[0.5rem] py-2.5 text-m-body font-bold press disabled:opacity-50 select-none"
            style={{ backgroundColor: "var(--color-ink-950)", color: "var(--color-paper)", touchAction: "none" }}
          >
            {saving ? (
              <Loader2 className="size-4 animate-spin" />
            ) : (
              <>
                <Send className="size-3.5" />
                <span>Create &amp; Submit</span>
              </>
            )}
          </button>
        </div>
      </div>

      {/* ══════ SELECTOR MODALS ══════ */}
      {modal === "claimant" ? (
        <SelectorModal
          title="Select Claimant"
          items={[...employees, ...extraEmployees].filter((e, i, arr) => arr.findIndex((x) => x.id === e.id) === i).map((e) => ({ id: e.id, label: e.name }))}
          selectedId={claimantId}
          onSelect={handleSelect}
          onClose={() => setModal(null)}
          onCreate={() => setShowCreateEmployee(true)}
          createLabel="Create new employee"
        />
      ) : null}

      {modal === "project" ? (
        <SelectorModal
          title="Select Project"
          items={[
            { id: "", label: "No project", sub: undefined as string | undefined },
            ...[...projects, ...extraProjects].filter((p, i, arr) => arr.findIndex((x) => x.id === p.id) === i).map((p) => ({ id: p.id, label: p.name })),
          ]}
          selectedId={projectId}
          onSelect={handleSelect}
          onClose={() => setModal(null)}
          onCreate={() => setShowCreateProject(true)}
          createLabel="Create new project"
        />
      ) : null}

      {categoryModalLine !== null && (
        <SelectorModal
          title="Select Category"
          items={activeCategories.map((c) => ({ id: c.id, label: c.name }))}
          selectedId={lines[categoryModalLine]?.categoryId ?? ""}
          onSelect={(id) => {
            const cat = categories.find((c) => c.id === id);
            handleCategorySelect(id, cat?.name ?? "");
          }}
          onClose={() => setCategoryModalLine(null)}
        />
      )}

      {/* ══════ INLINE CREATE PROJECT DIALOG ══════ */}
      {showCreateProject ? (
        <MobileFabModal open onClose={() => setShowCreateProject(false)} title="New Project" nested>
          <MobileNewProjectDialog
            open
            onClose={() => setShowCreateProject(false)}
            onCreated={(p) => {
              setExtraProjects((prev) => prev.some((x) => x.id === p.id) ? prev : [...prev, { id: p.id, name: p.name }]);
              setProjectId(p.id);
              setShowCreateProject(false);
              setModal(null);
            }}
          />
        </MobileFabModal>
      ) : null}

      {/* ══════ INLINE CREATE EMPLOYEE DIALOG ══════ */}
      {showCreateEmployee ? (
        <MobileFabModal open onClose={() => setShowCreateEmployee(false)} title="New Employee" nested>
          <MobileNewEmployeeDialog
            open
            onClose={() => setShowCreateEmployee(false)}
            projects={[]}
            stockLocations={[]}
            departments={[]}
            nested
            onCreated={(e) => {
              setExtraEmployees((prev) => prev.some((x) => x.id === e.id) ? prev : [...prev, { id: e.id, name: e.name }]);
              setClaimantId(e.id);
              setShowCreateEmployee(false);
              setModal(null);
            }}
          />
        </MobileFabModal>
      ) : null}
    </div>
  );
}

/* Inline selector card — tappable underline-style selector */
function SelectorCardInline({
  onClick,
  label,
  value,
  required,
}: {
  onClick: () => void;
  label: string;
  value?: string;
  required?: boolean;
}) {
  const hasValue = !!value;
  return (
    <div>
      <label className="block text-m-caption font-bold mb-0" style={{ color: "var(--color-ink-700)" }}>
        {label}{required ? <span style={{ color: "var(--color-stop)" }}> *</span> : null}
      </label>
      <button
        type="button"
        onClick={onClick}
        className="w-full h-7 px-1 text-m-caption outline-none border-b focus:border-b-2 transition-colors text-left press"
        style={{
          borderColor: "var(--color-line)",
          backgroundColor: "transparent",
          color: hasValue ? "var(--color-ink-950)" : "var(--color-ink-500)",
        }}
      >
        {hasValue ? (
          <span className="truncate block">{value}</span>
        ) : (
          <span>— Select —</span>
        )}
      </button>
    </div>
  );
}

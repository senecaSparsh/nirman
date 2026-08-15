"use client";

import { useState, useEffect, useCallback } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import { X, Loader2, Wrench, Plus, Trash2, ChevronRight } from "lucide-react";
import { toast } from "sonner";
import { haptic } from "@/lib/haptic";
import { formatCurrency } from "@/lib/utils";

type TdsCategory = "INDIVIDUAL" | "COMPANY" | "OTHER";

interface BoqLineItem {
  id: string;
  serialNo: string;
  description: string;
  unit: string | null;
  estimatedQty: number | null;
  rate: number | null;
}

interface SelectedLine {
  boqItemId: string;
  serialNo: string;
  description: string;
  unit: string | null;
  agreedRate: string;
}

interface FormState {
  projectId: string;
  subcontractorId: string;
  workTitle: string;
  description: string;
  startDate: string;
  endDate: string;
  retentionPct: string;
  tdsCategory: TdsCategory;
  advanceAmount: string;
  advanceRecoveryPct: string;
  defectLiabilityMonths: string;
}

/**
 * MobileNewWorkOrderDialog — bottom-sheet form for issuing a subcontractor
 * work order. The form has two steps:
 * 1. Select project + subcontractor + terms
 * 2. Select BOQ line items and set agreed rates
 *
 * BOQ items are fetched client-side when a project is selected.
 */
export function MobileNewWorkOrderDialog({
  open,
  onClose,
  projects,
  subcontractors,
}: {
  open: boolean;
  onClose: () => void;
  projects: { id: string; name: string }[];
  subcontractors: { id: string; name: string; trade: string | null }[];
}) {
  const router = useRouter();
  const [saving, setSaving] = useState(false);
  const [step, setStep] = useState<1 | 2>(1);
  const [boqItems, setBoqItems] = useState<BoqLineItem[]>([]);
  const [loadingBoq, setLoadingBoq] = useState(false);
  const [showBoqPicker, setShowBoqPicker] = useState(false);
  const [selectedLines, setSelectedLines] = useState<SelectedLine[]>([]);
  const [form, setForm] = useState<FormState>({
    projectId: "",
    subcontractorId: "",
    workTitle: "",
    description: "",
    startDate: "",
    endDate: "",
    retentionPct: "5",
    tdsCategory: "COMPANY",
    advanceAmount: "",
    advanceRecoveryPct: "",
    defectLiabilityMonths: "",
  });

  function set<K extends keyof FormState>(key: K, value: FormState[K]) {
    setForm((f) => ({ ...f, [key]: value }));
  }

  // Fetch BOQ items when project changes
  const fetchBoqItems = useCallback(async (projectId: string) => {
    if (!projectId) { setBoqItems([]); return; }
    setLoadingBoq(true);
    try {
      const res = await fetch(`/api/boq/tree?projectId=${projectId}`);
      const data = await res.json();
      // Flatten the tree to LINE_ITEM type only
      const lines: BoqLineItem[] = [];
      function walk(nodes: any[]) {
        for (const n of nodes) {
          if (n.type === "LINE_ITEM") {
            lines.push({
              id: n.id,
              serialNo: n.serialNo,
              description: n.description,
              unit: n.unit,
              estimatedQty: n.estimatedQty,
              rate: n.rate,
            });
          }
          if (n.children && n.children.length > 0) walk(n.children);
        }
      }
      walk(data.tree ?? []);
      setBoqItems(lines);
    } catch {
      setBoqItems([]);
    } finally {
      setLoadingBoq(false);
    }
  }, []);

  useEffect(() => {
    if (form.projectId) fetchBoqItems(form.projectId);
    else setBoqItems([]);
    // Reset selected lines when project changes
    setSelectedLines([]);
  }, [form.projectId, fetchBoqItems]);

  function addLine(item: BoqLineItem) {
    if (selectedLines.some((l) => l.boqItemId === item.id)) return;
    setSelectedLines((prev) => [
      ...prev,
      {
        boqItemId: item.id,
        serialNo: item.serialNo,
        description: item.description,
        unit: item.unit,
        agreedRate: item.rate?.toString() ?? "0",
      },
    ]);
    haptic(10);
  }

  function removeLine(idx: number) {
    setSelectedLines((prev) => prev.filter((_, i) => i !== idx));
    haptic(10);
  }

  function updateLineRate(idx: number, rate: string) {
    setSelectedLines((prev) => prev.map((l, i) => (i === idx ? { ...l, agreedRate: rate } : l)));
  }

  function resetForm() {
    setForm({
      projectId: "", subcontractorId: "", workTitle: "", description: "",
      startDate: "", endDate: "", retentionPct: "5", tdsCategory: "COMPANY",
      advanceAmount: "", advanceRecoveryPct: "", defectLiabilityMonths: "",
    });
    setSelectedLines([]);
    setStep(1);
  }

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (!form.projectId) { toast.error("Project is required"); return; }
    if (!form.subcontractorId) { toast.error("Subcontractor is required"); return; }
    if (!form.workTitle.trim()) { toast.error("Work title is required"); return; }
    if (selectedLines.length === 0) { toast.error("Select at least one BOQ line item"); return; }
    for (const l of selectedLines) {
      if (!l.agreedRate || Number(l.agreedRate) < 0) {
        toast.error(`Agreed rate for "${l.description}" must be ≥ 0`);
        return;
      }
    }

    setSaving(true);
    haptic(10);
    try {
      const res = await fetch("/api/work-orders", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          projectId: form.projectId,
          subcontractorId: form.subcontractorId,
          workTitle: form.workTitle.trim(),
          description: form.description.trim() || undefined,
          startDate: form.startDate ? new Date(form.startDate).toISOString() : undefined,
          endDate: form.endDate ? new Date(form.endDate).toISOString() : undefined,
          retentionPct: form.retentionPct === "" ? undefined : Number(form.retentionPct),
          tdsCategory: form.tdsCategory,
          advanceAmount: form.advanceAmount === "" ? undefined : Number(form.advanceAmount),
          advanceRecoveryPct: form.advanceRecoveryPct === "" ? undefined : Number(form.advanceRecoveryPct),
          defectLiabilityMonths: form.defectLiabilityMonths === "" ? undefined : Number(form.defectLiabilityMonths),
          lines: selectedLines.map((l) => ({
            boqItemId: l.boqItemId,
            agreedRate: Number(l.agreedRate),
          })),
        }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error ?? "Failed to create work order");
      haptic([10, 40, 80]);
      toast.success("Work order issued");
      resetForm();
      onClose();
      router.refresh();
    } catch (err) {
      haptic([50, 20, 50]);
      toast.error(err instanceof Error ? err.message : "Something went wrong");
    } finally {
      setSaving(false);
    }
  }

  if (!open) return null;

  const inputClass = "w-full h-10 rounded-[0.5rem] border px-3 text-[0.75rem] outline-none";
  const inputStyle = { borderColor: "var(--color-line)", backgroundColor: "var(--color-paper)", color: "var(--color-ink-950)" };
  const labelClass = "text-[0.5625rem] font-semibold block mb-1";
  const labelStyle = { color: "var(--color-ink-500)" };

  return (
    <div className="fixed inset-0 z-50 flex items-end justify-center" style={{ backgroundColor: "rgba(0,0,0,0.5)" }} onClick={onClose}>
      <div className="w-full max-w-[34rem] rounded-t-[1rem] border-t p-4 pb-safe max-h-[90vh] overflow-y-auto" style={{ backgroundColor: "var(--color-paper)", borderColor: "var(--color-line)" }} onClick={(e) => e.stopPropagation()}>
        {/* Header */}
        <div className="flex items-center justify-between mb-3">
          <div className="flex items-center gap-2">
            <span className="grid place-items-center size-7 rounded-[0.375rem]" style={{ backgroundColor: "var(--color-concrete)" }}>
              <Wrench className="size-3.5" style={{ color: "var(--color-ink-600)" }} />
            </span>
            <p className="text-[0.875rem] font-bold" style={{ color: "var(--color-ink-950)" }}>
              New Work Order {step === 2 && "· Scope"}
            </p>
          </div>
          <button onClick={() => { resetForm(); onClose(); }} className="grid place-items-center size-7 rounded-[0.375rem] press" style={{ color: "var(--color-ink-500)" }} aria-label="Close">
            <X className="size-4" />
          </button>
        </div>

        {/* Step indicator */}
        <div className="flex gap-1 mb-3">
          <div className="flex-1 h-1 rounded-full" style={{ backgroundColor: step >= 1 ? "var(--color-ink-950)" : "var(--color-line)" }} />
          <div className="flex-1 h-1 rounded-full" style={{ backgroundColor: step >= 2 ? "var(--color-ink-950)" : "var(--color-line)" }} />
        </div>

        {step === 1 ? (
          <form
            onSubmit={(e) => { e.preventDefault(); if (!form.projectId || !form.subcontractorId || !form.workTitle.trim()) { toast.error("Fill required fields first"); return; } setStep(2); haptic(10); }}
            className="flex flex-col gap-3"
          >
            {/* Project */}
            <div>
              <label className={labelClass} style={labelStyle}>Project <span style={{ color: "var(--color-stop)" }}>*</span></label>
              <select value={form.projectId} onChange={(e) => set("projectId", e.target.value)} className={inputClass} style={inputStyle}>
                <option value="">— Select project —</option>
                {projects.map((p) => (<option key={p.id} value={p.id}>{p.name}</option>))}
              </select>
            </div>

            {/* Subcontractor */}
            <div>
              <label className={labelClass} style={labelStyle}>Subcontractor <span style={{ color: "var(--color-stop)" }}>*</span></label>
              <select value={form.subcontractorId} onChange={(e) => set("subcontractorId", e.target.value)} className={inputClass} style={inputStyle}>
                <option value="">— Select subcontractor —</option>
                {subcontractors.map((s) => (<option key={s.id} value={s.id}>{s.name}{s.trade ? ` (${s.trade})` : ""}</option>))}
              </select>
            </div>

            {/* Work Title */}
            <div>
              <label className={labelClass} style={labelStyle}>Work Title <span style={{ color: "var(--color-stop)" }}>*</span></label>
              <input type="text" value={form.workTitle} onChange={(e) => set("workTitle", e.target.value)} placeholder="e.g. Plumbing for Tower A" autoFocus enterKeyHint="next" className={inputClass} style={inputStyle} />
            </div>

            {/* Description */}
            <div>
              <label className={labelClass} style={labelStyle}>Description</label>
              <textarea value={form.description} onChange={(e) => set("description", e.target.value)} rows={2} placeholder="Scope details…" className="w-full rounded-[0.5rem] border px-3 py-2 text-[0.75rem] outline-none resize-none" style={inputStyle} />
            </div>

            {/* Dates */}
            <div className="grid grid-cols-2 gap-3">
              <div>
                <label className={labelClass} style={labelStyle}>Start Date</label>
                <input type="date" value={form.startDate} onChange={(e) => set("startDate", e.target.value)} className={inputClass} style={inputStyle} />
              </div>
              <div>
                <label className={labelClass} style={labelStyle}>End Date</label>
                <input type="date" value={form.endDate} onChange={(e) => set("endDate", e.target.value)} className={inputClass} style={inputStyle} />
              </div>
            </div>

            {/* Financial terms */}
            <div className="grid grid-cols-2 gap-3">
              <div>
                <label className={labelClass} style={labelStyle}>Retention %</label>
                <input type="number" min={0} max={100} step="any" value={form.retentionPct} onChange={(e) => set("retentionPct", e.target.value)} inputMode="decimal" className={inputClass} style={inputStyle} />
              </div>
              <div>
                <label className={labelClass} style={labelStyle}>TDS Category</label>
                <select value={form.tdsCategory} onChange={(e) => set("tdsCategory", e.target.value as TdsCategory)} className={inputClass} style={inputStyle}>
                  <option value="INDIVIDUAL">Individual (1%)</option>
                  <option value="COMPANY">Company (2%)</option>
                  <option value="OTHER">Other (2%)</option>
                </select>
              </div>
            </div>

            <div className="grid grid-cols-2 gap-3">
              <div>
                <label className={labelClass} style={labelStyle}>Advance (₹)</label>
                <input type="number" min={0} step="any" value={form.advanceAmount} onChange={(e) => set("advanceAmount", e.target.value)} placeholder="0" inputMode="decimal" className={inputClass} style={inputStyle} />
              </div>
              <div>
                <label className={labelClass} style={labelStyle}>Advance Recovery %</label>
                <input type="number" min={0} max={100} step="any" value={form.advanceRecoveryPct} onChange={(e) => set("advanceRecoveryPct", e.target.value)} placeholder="0" inputMode="decimal" className={inputClass} style={inputStyle} />
              </div>
            </div>

            <div>
              <label className={labelClass} style={labelStyle}>Defect Liability (months)</label>
              <input type="number" min={0} value={form.defectLiabilityMonths} onChange={(e) => set("defectLiabilityMonths", e.target.value)} placeholder="e.g. 12" inputMode="numeric" className={inputClass} style={inputStyle} />
            </div>

            {/* Next button */}
            <button type="submit" className="w-full h-11 rounded-[0.5rem] text-[0.75rem] font-bold press flex items-center justify-center gap-1.5" style={{ backgroundColor: "var(--color-ink-950)", color: "#fff" }}>
              Next: Select Scope
              <ChevronRight className="size-4" />
            </button>
          </form>
        ) : (
          <form onSubmit={handleSubmit} className="flex flex-col gap-3">
            {/* Selected BOQ lines */}
            <div>
              <label className={labelClass} style={labelStyle}>
                BOQ Line Items ({selectedLines.length}) <span style={{ color: "var(--color-stop)" }}>*</span>
              </label>
              {selectedLines.length === 0 ? (
                <div className="rounded-[0.5rem] border border-dashed p-4 text-center" style={{ borderColor: "var(--color-line)" }}>
                  <p className="text-[0.625rem]" style={{ color: "var(--color-ink-500)" }}>
                    {loadingBoq ? "Loading BOQ items…" : "Tap + Add to select scope items"}
                  </p>
                </div>
              ) : (
                <div className="flex flex-col gap-1.5">
                  {selectedLines.map((l, i) => (
                    <div key={l.boqItemId} className="rounded-[0.5rem] border p-2" style={{ borderColor: "var(--color-line)", backgroundColor: "var(--color-paper-2)" }}>
                      <div className="flex items-start gap-2">
                        <div className="flex-1 min-w-0">
                          <p className="text-[0.4375rem] font-bold tabular-nums" style={{ color: "var(--color-ink-500)" }}>{l.serialNo}</p>
                          <p className="text-[0.6875rem] font-semibold leading-tight truncate" style={{ color: "var(--color-ink-950)" }}>{l.description}</p>
                        </div>
                        <button type="button" onClick={() => removeLine(i)} className="press shrink-0" style={{ color: "var(--color-ink-300)" }}>
                          <Trash2 className="size-3.5" />
                        </button>
                      </div>
                      <div className="flex items-center gap-2 mt-1.5">
                        <span className="text-[0.4375rem]" style={{ color: "var(--color-ink-500)" }}>Agreed rate:</span>
                        <div className="relative flex-1">
                          <span className="absolute left-2 top-1/2 -translate-y-1/2 text-[0.5625rem] font-bold" style={{ color: "var(--color-ink-500)" }}>₹</span>
                          <input
                            type="number"
                            min={0}
                            step="any"
                            value={l.agreedRate}
                            onChange={(e) => updateLineRate(i, e.target.value)}
                            inputMode="decimal"
                            className="w-full h-7 rounded-[0.375rem] border pl-5 pr-2 text-[0.6875rem] font-bold tabular-nums outline-none"
                            style={inputStyle}
                          />
                        </div>
                        <span className="text-[0.4375rem]" style={{ color: "var(--color-ink-500)" }}>{l.unit ?? ""}</span>
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </div>

            {/* Add BOQ item button */}
            <button
              type="button"
              onClick={() => setShowBoqPicker(true)}
              disabled={loadingBoq || boqItems.length === 0}
              className="flex items-center justify-center gap-1.5 h-9 rounded-[0.5rem] border-2 border-dashed text-[0.6875rem] font-bold press disabled:opacity-50"
              style={{ borderColor: "var(--color-line)", color: "var(--color-ink-600)" }}
            >
              <Plus className="size-3.5" />
              {boqItems.length === 0 && !loadingBoq ? "No BOQ items for this project" : "Add BOQ Item"}
            </button>

            {/* Actions */}
            <div className="flex gap-2 pt-1">
              <button type="button" onClick={() => setStep(1)} disabled={saving} className="flex-1 h-11 rounded-[0.5rem] border text-[0.75rem] font-bold press disabled:opacity-50" style={{ borderColor: "var(--color-line)", color: "var(--color-ink-500)", backgroundColor: "transparent" }}>
                Back
              </button>
              <button type="submit" disabled={saving || selectedLines.length === 0} className="flex-[2] h-11 rounded-[0.5rem] text-[0.75rem] font-bold press disabled:opacity-50 flex items-center justify-center gap-1.5" style={{ backgroundColor: "var(--color-ink-950)", color: "#fff" }}>
                {saving ? <Loader2 className="size-4 animate-spin" /> : null}
                {saving ? "Issuing…" : "Issue Work Order"}
              </button>
            </div>
          </form>
        )}

        {/* BOQ Picker Sheet */}
        {showBoqPicker && (
          <div className="fixed inset-0 z-[60] flex items-end justify-center" style={{ backgroundColor: "rgba(0,0,0,0.5)" }} onClick={() => setShowBoqPicker(false)}>
            <div className="w-full max-w-[34rem] rounded-t-[1rem] border-t p-4 pb-safe max-h-[70vh] overflow-y-auto" style={{ backgroundColor: "var(--color-paper)", borderColor: "var(--color-line)" }} onClick={(e) => e.stopPropagation()}>
              <div className="flex items-center justify-between mb-3">
                <p className="text-[0.875rem] font-bold" style={{ color: "var(--color-ink-950)" }}>Select BOQ Items</p>
                <button onClick={() => setShowBoqPicker(false)} className="grid place-items-center size-7 rounded-[0.375rem] press" style={{ color: "var(--color-ink-500)" }}>
                  <X className="size-4" />
                </button>
              </div>
              {loadingBoq ? (
                <div className="flex items-center justify-center py-8">
                  <Loader2 className="size-5 animate-spin" style={{ color: "var(--color-ink-500)" }} />
                </div>
              ) : boqItems.length === 0 ? (
                <div className="text-center py-8">
                  <p className="text-[0.6875rem] mb-3" style={{ color: "var(--color-ink-500)" }}>
                    No BOQ line items found for this project.
                  </p>
                  <Link
                    href={`/m/boq?project=${form.projectId}`}
                    className="inline-flex items-center gap-1.5 rounded-[0.5rem] border-2 border-dashed px-4 py-2 text-[0.6875rem] font-bold press"
                    style={{ borderColor: "var(--color-signal)", color: "var(--color-signal-dark)" }}
                  >
                    <Plus className="size-3.5" />
                    Create BOQ Items
                  </Link>
                </div>
              ) : (
                <div className="flex flex-col gap-1.5">
                  {boqItems.map((item) => {
                    const isSelected = selectedLines.some((l) => l.boqItemId === item.id);
                    return (
                      <button
                        key={item.id}
                        onClick={() => { if (!isSelected) { addLine(item); haptic(10); } }}
                        disabled={isSelected}
                        className="flex items-start gap-2 rounded-[0.5rem] border p-2 text-left press disabled:opacity-40"
                        style={{ borderColor: "var(--color-line)", backgroundColor: isSelected ? "var(--color-concrete)" : "var(--color-paper)" }}
                      >
                        <div className="flex-1 min-w-0">
                          <p className="text-[0.4375rem] font-bold tabular-nums" style={{ color: "var(--color-ink-500)" }}>{item.serialNo}</p>
                          <p className="text-[0.6875rem] font-semibold leading-tight" style={{ color: "var(--color-ink-950)" }}>{item.description}</p>
                          <p className="text-[0.4375rem] mt-0.5" style={{ color: "var(--color-ink-500)" }}>
                            {item.estimatedQty ? `${item.estimatedQty} ` : ""}{item.unit ?? ""} {item.rate ? `· ₹${formatCurrency(item.rate)}/${item.unit ?? ""}` : ""}
                          </p>
                        </div>
                        {isSelected ? (
                          <span className="text-[0.4375rem] font-bold shrink-0" style={{ color: "var(--color-go)" }}>ADDED</span>
                        ) : (
                          <Plus className="size-3.5 shrink-0 mt-0.5" style={{ color: "var(--color-ink-500)" }} />
                        )}
                      </button>
                    );
                  })}
                </div>
              )}
            </div>
          </div>
        )}
      </div>
    </div>
  );
}

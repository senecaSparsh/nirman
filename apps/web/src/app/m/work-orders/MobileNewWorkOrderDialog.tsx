"use client";

import { useState, useEffect, useCallback } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import { X, Loader2, Plus, Trash2, ChevronRight } from "lucide-react";
import { toast } from "sonner";
import { haptic } from "@/lib/haptic";
import { formatCurrency } from "@/lib/utils";
import { MobileSelectWithCreate } from "@/components/mobile/MobileSelectWithCreate";
import { MobileNewProjectDialog } from "@/app/m/projects/MobileNewProjectDialog";
import { MobileDialog } from "@/components/mobile/v2/dialog";

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
 * MobileNewWorkOrderForm — form content for issuing a subcontractor
 * work order. The form has two steps:
 * 1. Select project + subcontractor + terms
 * 2. Select BOQ line items and set agreed rates
 *
 * Used inside <MobileFabModal> (spring-from-FAB animation) on the
 * work-orders page, or wrapped by <MobileNewWorkOrderDialog> (legacy
 * bottom-sheet backdrop) for inline creation from other pages.
 * Mirrors MobileNewLeaveForm / MobileNewMaterialForm.
 *
 * No header or Cancel button here — the wrapper supplies the title
 * and the close affordance (FAB morphs +→× in MobileFabModal, X
 * button in the legacy bottom-sheet).
 */
export function MobileNewWorkOrderForm({
  onClose,
  projects,
  subcontractors,
}: {
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
      function walk(nodes: unknown[]) {
        for (const n of nodes) {
          if (typeof n === "object" && n !== null && "type" in n && (n as Record<string, unknown>).type === "LINE_ITEM") {
            const node = n as Record<string, unknown>;
            lines.push({
              id: node.id as string,
              serialNo: node.serialNo as string,
              description: node.description as string,
              unit: node.unit as string | null,
              estimatedQty: node.estimatedQty as number | null,
              rate: node.rate as number | null,
            });
          }
          if (typeof n === "object" && n !== null && "children" in n) {
            const children = (n as Record<string, unknown>).children;
            if (Array.isArray(children)) walk(children);
          }
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
    if (selectedLines.length === 0) { toast.error("Select at least one Bill of Quantities line item"); return; }
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

  const inputClass = "w-full h-7 px-1 text-m-caption outline-none border-b focus:border-b-2 transition-colors";
  const inputStyle = { borderColor: "var(--color-line)", backgroundColor: "transparent", color: "var(--color-ink-950)" };
  const labelClass = "block text-m-caption font-bold mb-0";
  const labelStyle = { color: "var(--color-ink-700)" };
  const sectionClass = "rounded-[0.625rem] border p-3 flex flex-col gap-3";
  const sectionStyle = { borderColor: "var(--color-line)", backgroundColor: "var(--color-paper)" };
  const sectionTitleClass = "text-m-section font-extrabold tracking-tight";
  const sectionTitleStyle = { color: "var(--color-ink-950)" };

  return (
    <div className="flex flex-col gap-3">
      {/* Step indicator */}
      <div className="flex gap-1">
        <div className="flex-1 h-1 rounded-full" style={{ backgroundColor: step >= 1 ? "var(--color-ink-950)" : "var(--color-line)" }} />
        <div className="flex-1 h-1 rounded-full" style={{ backgroundColor: step >= 2 ? "var(--color-ink-950)" : "var(--color-line)" }} />
      </div>

      {step === 1 ? (
        <form
          onSubmit={(e) => { e.preventDefault(); if (!form.projectId || !form.subcontractorId || !form.workTitle.trim()) { toast.error("Fill required fields first"); return; } setStep(2); haptic(10); }}
          className="flex flex-col gap-3"
        >
          {/* Details */}
          <div className={sectionClass} style={sectionStyle}>
            <p className={sectionTitleClass} style={sectionTitleStyle}>Details</p>
            <MobileSelectWithCreate
              label="Project"
              required
              value={form.projectId}
              onChange={(v) => set("projectId", v)}
              placeholder="— Select project —"
              options={projects.map((p) => ({ value: p.id, label: p.name }))}
              inputClass={inputClass}
              inputStyle={inputStyle}
              labelClass={labelClass}
              labelStyle={labelStyle}
              renderDialog={({ open, onClose, onCreated }) => (
                <MobileNewProjectDialog open={open} onClose={onClose} onCreated={(p) => onCreated(p.id, p.name)} />
              )}
            />
            <div>
              <label className={labelClass} style={labelStyle}>Subcontractor <span style={{ color: "var(--color-stop)" }}>*</span></label>
              <select value={form.subcontractorId} onChange={(e) => set("subcontractorId", e.target.value)} className={inputClass} style={inputStyle}>
                <option value="">— Select subcontractor —</option>
                {subcontractors.map((s) => (<option key={s.id} value={s.id}>{s.name}{s.trade ? ` (${s.trade})` : ""}</option>))}
              </select>
            </div>
            <div>
              <label className={labelClass} style={labelStyle}>Work Title <span style={{ color: "var(--color-stop)" }}>*</span></label>
              <input type="text" value={form.workTitle} onChange={(e) => set("workTitle", e.target.value)} placeholder="e.g. Plumbing for Tower A" autoFocus enterKeyHint="next" className={inputClass} style={inputStyle} />
            </div>
            <div>
              <label className={labelClass} style={labelStyle}>Description</label>
              <textarea value={form.description} onChange={(e) => set("description", e.target.value)} rows={2} placeholder="Scope details…" className="w-full px-1 py-1 text-m-caption outline-none border-b focus:border-b-2 resize-none transition-colors" style={inputStyle} />
            </div>
          </div>

          {/* Schedule */}
          <div className={sectionClass} style={sectionStyle}>
            <p className={sectionTitleClass} style={sectionTitleStyle}>Schedule</p>
            <div className="grid grid-cols-2 gap-2 divide-x" style={{ borderColor: "var(--color-line)" }}>
              <div>
                <label className={labelClass} style={labelStyle}>Start Date</label>
                <input type="date" value={form.startDate} onChange={(e) => set("startDate", e.target.value)} className={inputClass} style={inputStyle} />
              </div>
              <div className="pl-2">
                <label className={labelClass} style={labelStyle}>End Date</label>
                <input type="date" value={form.endDate} onChange={(e) => set("endDate", e.target.value)} className={inputClass} style={inputStyle} />
              </div>
            </div>
          </div>

          {/* Terms */}
          <div className={sectionClass} style={sectionStyle}>
            <p className={sectionTitleClass} style={sectionTitleStyle}>Terms</p>
            <div className="grid grid-cols-2 gap-2 divide-x" style={{ borderColor: "var(--color-line)" }}>
              <div>
                <label className={labelClass} style={labelStyle}>Retention %</label>
                <input type="number" min={0} max={100} step="any" value={form.retentionPct} onChange={(e) => set("retentionPct", e.target.value)} inputMode="decimal" className={inputClass} style={inputStyle} />
              </div>
              <div className="pl-2">
                <label className={labelClass} style={labelStyle}>TDS Category</label>
                <select value={form.tdsCategory} onChange={(e) => set("tdsCategory", e.target.value as TdsCategory)} className={inputClass} style={inputStyle}>
                  <option value="INDIVIDUAL">Individual (1%)</option>
                  <option value="COMPANY">Company (2%)</option>
                  <option value="OTHER">Other (2%)</option>
                </select>
              </div>
            </div>
            <div className="grid grid-cols-2 gap-2 divide-x" style={{ borderColor: "var(--color-line)" }}>
              <div>
                <label className={labelClass} style={labelStyle}>Advance (₹)</label>
                <input type="number" min={0} step="any" value={form.advanceAmount} onChange={(e) => set("advanceAmount", e.target.value)} placeholder="0" inputMode="decimal" className={inputClass} style={inputStyle} />
              </div>
              <div className="pl-2">
                <label className={labelClass} style={labelStyle}>Advance Recovery %</label>
                <input type="number" min={0} max={100} step="any" value={form.advanceRecoveryPct} onChange={(e) => set("advanceRecoveryPct", e.target.value)} placeholder="0" inputMode="decimal" className={inputClass} style={inputStyle} />
              </div>
            </div>
            <div>
              <label className={labelClass} style={labelStyle}>Defect Liability (months)</label>
              <input type="number" min={0} value={form.defectLiabilityMonths} onChange={(e) => set("defectLiabilityMonths", e.target.value)} placeholder="e.g. 12" inputMode="numeric" className={inputClass} style={inputStyle} />
            </div>
          </div>

          {/* Next button */}
          <button type="submit" className="w-full h-11 rounded-[0.5rem] text-m-section font-bold text-m-body press flex items-center justify-center gap-1.5" style={{ backgroundColor: "var(--color-ink-950)", color: "var(--color-paper)" }}>
            Next: Select Scope
            <ChevronRight className="size-4" />
          </button>
        </form>
      ) : (
        <form onSubmit={handleSubmit} className="flex flex-col gap-3">
          {/* Scope */}
          <div className={sectionClass} style={sectionStyle}>
            <p className={sectionTitleClass} style={sectionTitleStyle}>Scope</p>
            <div>
              <label className={labelClass} style={labelStyle}>
                Bill of Quantities Line Items ({selectedLines.length}) <span style={{ color: "var(--color-stop)" }}>*</span>
              </label>
              {selectedLines.length === 0 ? (
                <div className="rounded-[0.5rem] border border-dashed p-4 text-center" style={{ borderColor: "var(--color-line)" }}>
                  <p className="text-m-label" style={{ color: "var(--color-ink-500)" }}>
                    {loadingBoq ? "Loading Bill of Quantities items…" : "Tap + Add to select scope items"}
                  </p>
                </div>
              ) : (
                <div className="flex flex-col gap-1.5">
                  {selectedLines.map((l, i) => (
                    <div key={l.boqItemId} className="rounded-[0.5rem] border p-2" style={{ borderColor: "var(--color-line)", backgroundColor: "var(--color-paper-2)" }}>
                      <div className="flex items-start gap-2">
                        <div className="flex-1 min-w-0">
                          <p className="text-m-caption font-bold tabular-nums" style={{ color: "var(--color-ink-500)" }}>{l.serialNo}</p>
                          <p className="text-m-body font-semibold leading-tight truncate" style={{ color: "var(--color-ink-950)" }}>{l.description}</p>
                        </div>
                        <button type="button" onClick={() => removeLine(i)} className="text-m-body press shrink-0" style={{ color: "var(--color-ink-300)" }}>
                          <Trash2 className="size-3.5" />
                        </button>
                      </div>
                      <div className="flex items-center gap-2 mt-1.5">
                        <span className="text-m-caption" style={{ color: "var(--color-ink-500)" }}>Agreed rate:</span>
                        <div className="relative flex-1">
                          <span className="absolute left-2 top-1/2 -translate-y-1/2 text-m-caption font-bold" style={{ color: "var(--color-ink-500)" }}>₹</span>
                          <input
                            type="number"
                            min={0}
                            step="any"
                            value={l.agreedRate}
                            onChange={(e) => updateLineRate(i, e.target.value)}
                            inputMode="decimal"
                            className="w-full h-7 rounded-[0.375rem] border pl-5 pr-2 text-m-body font-bold tabular-nums outline-none"
                            style={inputStyle}
                          />
                        </div>
                        <span className="text-m-caption" style={{ color: "var(--color-ink-500)" }}>{l.unit ?? ""}</span>
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
              className="flex items-center justify-center gap-1.5 h-9 rounded-[0.5rem] border-2 border-dashed text-m-body font-bold text-m-body press disabled:opacity-50"
              style={{ borderColor: "var(--color-line)", color: "var(--color-ink-600)" }}
            >
              <Plus className="size-3.5" />
              {boqItems.length === 0 && !loadingBoq ? "No BOQ items for this project" : "Add Bill of Quantities Item"}
            </button>
          </div>

          {/* Impact preview — commitment summary before issuing */}
          {selectedLines.length > 0 && (() => {
            const totalCommitment = selectedLines.reduce((s, l) => {
              const boq = boqItems.find((b) => b.id === l.boqItemId);
              const qty = boq?.estimatedQty ?? 0;
              return s + qty * (Number(l.agreedRate) || 0);
            }, 0);
            const advance = Number(form.advanceAmount) || 0;
            const retentionPct = Number(form.retentionPct) || 0;
            return (
              <div className="rounded-[0.5rem] border p-2.5 flex flex-col gap-1" style={{ borderColor: "var(--color-line)", backgroundColor: "var(--color-concrete)" }}>
                <div className="flex items-center justify-between">
                  <span className="text-m-caption font-semibold" style={{ color: "var(--color-ink-500)" }}>Est. commitment</span>
                  <span className="text-m-section font-bold tabular-nums" style={{ color: "var(--color-ink-950)" }}>{formatCurrency(totalCommitment)}</span>
                </div>
                <div className="flex items-center justify-between text-m-caption" style={{ color: "var(--color-ink-500)" }}>
                  <span>Retention {retentionPct}%{advance > 0 ? ` · Advance ${formatCurrency(advance)}` : ""}</span>
                  <span>{selectedLines.length} scope line{selectedLines.length !== 1 ? "s" : ""}</span>
                </div>
              </div>
            );
          })()}

          {/* Actions */}
          <div className="flex flex-col gap-2 pt-1">
            <button type="button" onClick={() => setStep(1)} disabled={saving} className="w-full h-11 rounded-[0.5rem] border text-m-section font-bold text-m-body press disabled:opacity-50" style={{ borderColor: "var(--color-line)", color: "var(--color-ink-500)", backgroundColor: "transparent" }}>
              Back
            </button>
            <button type="submit" disabled={saving || selectedLines.length === 0} className="w-full h-11 rounded-[0.5rem] text-m-section font-bold text-m-body press disabled:opacity-50 flex items-center justify-center gap-1.5" style={{ backgroundColor: "var(--color-ink-950)", color: "var(--color-paper)" }}>
              {saving ? <Loader2 className="size-4 animate-spin" /> : null}
              {saving ? "Issuing…" : "Issue Work Order"}
            </button>
          </div>
        </form>
      )}

      {/* BOQ Picker Sheet */}
      {showBoqPicker && (
        <div className="fixed inset-0 z-[60] flex items-end justify-center" style={{ backgroundColor: "color-mix(in srgb, var(--color-ink-950) 50%, transparent)" }} onClick={() => setShowBoqPicker(false)}>
          <div className="w-full max-w-md rounded-t-[1rem] border-t p-4 pb-safe max-h-[70vh] overflow-y-auto" style={{ backgroundColor: "var(--color-paper)", borderColor: "var(--color-line)" }} onClick={(e) => e.stopPropagation()}>
            <div className="flex items-center justify-between mb-3">
              <p className="text-m-section font-bold" style={{ color: "var(--color-ink-950)" }}>Select Bill of Quantities Items</p>
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
                <p className="text-m-body mb-3" style={{ color: "var(--color-ink-500)" }}>
                  No Bill of Quantities line items found for this project.
                </p>
                <Link
                  href={`/m/boq?project=${form.projectId}`}
                  className="inline-flex items-center gap-1.5 rounded-[0.5rem] border-2 border-dashed px-4 py-2 text-m-body font-bold text-m-body press"
                  style={{ borderColor: "var(--color-signal)", color: "var(--color-signal-dark)" }}
                >
                  <Plus className="size-3.5" />
                  Create Bill of Quantities Items
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
                      className="flex items-start gap-2 rounded-[0.5rem] border p-2 text-left text-m-body press disabled:opacity-40"
                      style={{ borderColor: "var(--color-line)", backgroundColor: isSelected ? "var(--color-concrete)" : "var(--color-paper)" }}
                    >
                      <div className="flex-1 min-w-0">
                        <p className="text-m-caption font-bold tabular-nums" style={{ color: "var(--color-ink-500)" }}>{item.serialNo}</p>
                        <p className="text-m-body font-semibold leading-tight" style={{ color: "var(--color-ink-950)" }}>{item.description}</p>
                        <p className="text-m-caption mt-0.5" style={{ color: "var(--color-ink-500)" }}>
                          {item.estimatedQty ? `${item.estimatedQty} ` : ""}{item.unit ?? ""} {item.rate ? `· ₹${formatCurrency(item.rate)}/${item.unit ?? ""}` : ""}
                        </p>
                      </div>
                      {isSelected ? (
                        <span className="text-m-caption font-bold shrink-0" style={{ color: "var(--color-go)" }}>ADDED</span>
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
  );
}

/**
 * MobileNewWorkOrderDialog — legacy bottom-sheet backdrop wrapper.
 *
 * Kept for backward compatibility / inline creation from other pages.
 * Prefer wrapping <MobileNewWorkOrderForm> in <MobileFabModal> instead —
 * that gives the spring-from-FAB animation matching the materials and
 * leaves pages.
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
  return (
    <MobileDialog open={open} onClose={onClose} title="New Work Order">
      <MobileNewWorkOrderForm
        onClose={onClose}
        projects={projects}
        subcontractors={subcontractors}
      />
    </MobileDialog>
  );
}

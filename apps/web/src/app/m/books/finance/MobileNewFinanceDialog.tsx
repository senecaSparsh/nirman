"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { X, Loader2, Wallet, Building2, Plus } from "lucide-react";
import { toast } from "sonner";
import { haptic } from "@/lib/haptic";
import { MobileSelectWithCreate } from "@/components/mobile/MobileSelectWithCreate";
import { MobileNewProjectDialog } from "@/app/m/projects/MobileNewProjectDialog";
import { PhotoUploader } from "@/components/ui/photo-uploader";

type Tab = "expense" | "projectCost";

interface ProjectOption {
  id: string;
  name: string;
}

interface ExpenseForm {
  projectId: string;
  category: string;
  amount: string;
  date: string;
  notes: string;
}

interface ProjectCostForm {
  projectId: string;
  costType:
    | "LABOUR"
    | "OVERHEAD"
    | "EQUIPMENT"
    | "CONTRACTOR"
    | "PERMIT"
    | "TRANSFER_DUTY"
    | "OTHER";
  amount: string;
  date: string;
  vendor: string;
  subcontractorId: string;
  notes: string;
}

const COST_TYPE_LABELS: Record<ProjectCostForm["costType"], string> = {
  LABOUR: "Labour",
  OVERHEAD: "Overhead",
  EQUIPMENT: "Equipment",
  CONTRACTOR: "Contractor",
  PERMIT: "Permit",
  TRANSFER_DUTY: "Transfer Duty",
  OTHER: "Other",
};

const EXPENSE_CATEGORIES = [
  "Office Supplies",
  "Travel",
  "Utilities",
  "Fuel",
  "Maintenance",
  "Professional Fees",
  "Marketing",
  "Insurance",
  "Rent",
  "Transfer Duty",
  "Stamp Duty",
  "Registration Fee",
  "Legal Fees",
  "Miscellaneous",
];

/**
 * MobileNewFinanceDialog — bottom-sheet form for recording an expense or
 * project cost from the mobile surface. Two tabs:
 *  - Expense: POST /api/expenses (PERM.EXPENSE_CREATE)
 *  - Project Cost: POST /api/project-costs (PERM.FINANCE_MANAGE)
 */
export function MobileNewFinanceDialog({
  open,
  onClose,
  projects,
  subcontractors = [],
  canCreateExpense,
  canCreateProjectCost,
}: {
  open: boolean;
  onClose: () => void;
  projects: ProjectOption[];
  subcontractors?: { id: string; name: string; trade: string | null }[];
  canCreateExpense: boolean;
  canCreateProjectCost: boolean;
}) {
  const router = useRouter();
  const [saving, setSaving] = useState(false);
  const [tab, setTab] = useState<Tab>(
    canCreateExpense ? "expense" : "projectCost",
  );
  const [expenseForm, setExpenseForm] = useState<ExpenseForm>({
    projectId: "",
    category: "",
    amount: "",
    date: new Date().toISOString().slice(0, 10),
    notes: "",
  });
  const [costForm, setCostForm] = useState<ProjectCostForm>({
    projectId: "",
    costType: "LABOUR",
    amount: "",
    date: new Date().toISOString().slice(0, 10),
    vendor: "",
    subcontractorId: "",
    notes: "",
  });
  const [receiptPhotos, setReceiptPhotos] = useState<{ url: string; fileName?: string }[]>([]);

  function setExpense<K extends keyof ExpenseForm>(
    key: K,
    value: ExpenseForm[K],
  ) {
    setExpenseForm((f) => ({ ...f, [key]: value }));
  }
  function setCost<K extends keyof ProjectCostForm>(
    key: K,
    value: ProjectCostForm[K],
  ) {
    setCostForm((f) => ({ ...f, [key]: value }));
  }

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();

    if (tab === "expense") {
      if (!expenseForm.category.trim()) {
        toast.error("Category is required");
        return;
      }
      if (!expenseForm.amount || Number(expenseForm.amount) <= 0) {
        toast.error("Amount must be > 0");
        return;
      }

      setSaving(true);
      haptic(10);
      try {
        const res = await fetch("/api/expenses", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            projectId: expenseForm.projectId || undefined,
            category: expenseForm.category.trim(),
            amount: Number(expenseForm.amount),
            date: expenseForm.date
              ? new Date(expenseForm.date).toISOString()
              : undefined,
            notes: expenseForm.notes.trim() || undefined,
          }),
        });
        const data = await res.json();
        if (!res.ok) throw new Error(data.error ?? "Failed to record expense");
        haptic([10, 40, 80]);
        toast.success("Expense recorded");
        onClose();
        router.refresh();
      } catch (err) {
        haptic([50, 20, 50]);
        toast.error(
          err instanceof Error ? err.message : "Something went wrong",
        );
      } finally {
        setSaving(false);
      }
    } else {
      if (!costForm.projectId) {
        toast.error("Project is required for project costs");
        return;
      }
      if (!costForm.amount || Number(costForm.amount) <= 0) {
        toast.error("Amount must be > 0");
        return;
      }

      setSaving(true);
      haptic(10);
      try {
        const res = await fetch("/api/project-costs", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            projectId: costForm.projectId,
            costType: costForm.costType,
            amount: Number(costForm.amount),
            date: costForm.date
              ? new Date(costForm.date).toISOString()
              : undefined,
            vendor: costForm.vendor.trim() || undefined,
            subcontractorId: costForm.subcontractorId || undefined,
            notes: costForm.notes.trim() || undefined,
            receiptUrl: receiptPhotos.length > 0 ? receiptPhotos[0]!.url : undefined,
          }),
        });
        const data = await res.json();
        if (!res.ok)
          throw new Error(data.error ?? "Failed to add project cost");
        haptic([10, 40, 80]);
        toast.success("Project cost added");
        onClose();
        router.refresh();
      } catch (err) {
        haptic([50, 20, 50]);
        toast.error(
          err instanceof Error ? err.message : "Something went wrong",
        );
      } finally {
        setSaving(false);
      }
    }
  }

  if (!open) return null;

  const inputClass =
    "w-full h-10 rounded-[0.5rem] border px-3 text-m-section outline-none";
  const inputStyle = {
    borderColor: "var(--color-line)",
    backgroundColor: "var(--color-paper)",
    color: "var(--color-ink-950)",
  };
  const labelClass = "text-m-caption font-semibold block mb-1";
  const labelStyle = { color: "var(--color-ink-500)" };

  return (
    <div
      className="fixed inset-0 z-50 flex items-end justify-center"
      style={{ backgroundColor: "color-mix(in srgb, var(--color-ink-950) 50%, transparent)" }}
      onClick={onClose}
    >
      <div
        className="w-full max-w-md rounded-t-[1rem] border-t p-4 pb-safe max-h-[90vh] overflow-y-auto"
        style={{
          backgroundColor: "var(--color-paper)",
          borderColor: "var(--color-line)",
        }}
        onClick={(e) => e.stopPropagation()}
      >
        {/* Header */}
        <div className="flex items-center justify-between mb-3">
          <div className="flex items-center gap-2">
            <span
              className="grid place-items-center size-7 rounded-[0.375rem]"
              style={{ backgroundColor: "var(--color-concrete)" }}
            >
              {tab === "expense" ? (
                <Wallet
                  className="size-3.5"
                  style={{ color: "var(--color-ink-600)" }}
                />
              ) : (
                <Building2
                  className="size-3.5"
                  style={{ color: "var(--color-ink-600)" }}
                />
              )}
            </span>
            <p
              className="text-m-section font-bold"
              style={{ color: "var(--color-ink-950)" }}
            >
              {tab === "expense" ? "New Expense" : "New Project Cost"}
            </p>
          </div>
          <button
            onClick={onClose}
            className="touch grid place-items-center rounded-[0.375rem] text-m-body press"
            style={{ color: "var(--color-ink-500)" }}
            aria-label="Close"
          >
            <X className="size-4" />
          </button>
        </div>

        {/* Tab selector — only show if both permissions exist */}
        {canCreateExpense && canCreateProjectCost && (
          <div className="flex gap-2 mb-3">
            <button
              type="button"
              onClick={() => {
                setTab("expense");
                haptic(10);
              }}
              className="flex-1 h-9 rounded-[0.5rem] border-2 text-m-caption font-bold text-m-body press"
              style={{
                borderColor:
                  tab === "expense"
                    ? "var(--color-ink-950)"
                    : "var(--color-line)",
                backgroundColor:
                  tab === "expense"
                    ? "var(--color-ink-950)"
                    : "var(--color-paper)",
                color:
                  tab === "expense"
                    ? "var(--color-paper)"
                    : "var(--color-ink-500)",
              }}
            >
              Expense
            </button>
            <button
              type="button"
              onClick={() => {
                setTab("projectCost");
                haptic(10);
              }}
              className="flex-1 h-9 rounded-[0.5rem] border-2 text-m-caption font-bold text-m-body press"
              style={{
                borderColor:
                  tab === "projectCost"
                    ? "var(--color-ink-950)"
                    : "var(--color-line)",
                backgroundColor:
                  tab === "projectCost"
                    ? "var(--color-ink-950)"
                    : "var(--color-paper)",
                color:
                  tab === "projectCost"
                    ? "var(--color-paper)"
                    : "var(--color-ink-500)",
              }}
            >
              Project Cost
            </button>
          </div>
        )}

        <form onSubmit={handleSubmit} className="flex flex-col gap-3">
          {tab === "expense" ? (
            <>
              {/* Project (optional for expenses) */}
              <MobileSelectWithCreate
                label="Project (optional)"
                value={expenseForm.projectId}
                onChange={(v) => setExpense("projectId", v)}
                placeholder="— General (no project) —"
                options={projects.map((p) => ({ value: p.id, label: p.name }))}
                inputClass={inputClass}
                inputStyle={inputStyle}
                renderDialog={({ open, onClose, onCreated }) => (
                  <MobileNewProjectDialog
                    open={open}
                    onClose={onClose}
                    onCreated={(p) => onCreated(p.id, p.name)}
                  />
                )}
              />

              {/* Category */}
              <div>
                <label className={labelClass} style={labelStyle}>
                  Category <span style={{ color: "var(--color-stop)" }}>*</span>
                </label>
                <input
                  type="text"
                  list="expense-categories"
                  value={expenseForm.category}
                  onChange={(e) => setExpense("category", e.target.value)}
                  placeholder="e.g. Office Supplies"
                  autoFocus
                  enterKeyHint="next"
                  className={inputClass}
                  style={inputStyle}
                />
                <datalist id="expense-categories">
                  {EXPENSE_CATEGORIES.map((c) => (
                    <option key={c} value={c} />
                  ))}
                </datalist>
              </div>

              {/* Amount + Date */}
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className={labelClass} style={labelStyle}>
                    Amount (₹){" "}
                    <span style={{ color: "var(--color-stop)" }}>*</span>
                  </label>
                  <input
                    type="number"
                    min={0.01}
                    step="any"
                    value={expenseForm.amount}
                    onChange={(e) => setExpense("amount", e.target.value)}
                    placeholder="0"
                    inputMode="decimal"
                    className={inputClass}
                    style={inputStyle}
                  />
                </div>
                <div>
                  <label className={labelClass} style={labelStyle}>
                    Date
                  </label>
                  <input
                    type="date"
                    value={expenseForm.date}
                    onChange={(e) => setExpense("date", e.target.value)}
                    className={inputClass}
                    style={inputStyle}
                  />
                </div>
              </div>

              {/* Notes */}
              <div>
                <label className={labelClass} style={labelStyle}>
                  Notes (optional)
                </label>
                <textarea
                  value={expenseForm.notes}
                  onChange={(e) => setExpense("notes", e.target.value)}
                  rows={2}
                  placeholder="Additional context…"
                  className="w-full rounded-[0.5rem] border px-3 py-2 text-m-section outline-none resize-none"
                  style={inputStyle}
                />
              </div>
            </>
          ) : (
            <>
              {/* Project (required for project costs) */}
              <MobileSelectWithCreate
                label="Project"
                required
                value={costForm.projectId}
                onChange={(v) => setCost("projectId", v)}
                placeholder="— Select project —"
                options={projects.map((p) => ({ value: p.id, label: p.name }))}
                inputClass={inputClass}
                inputStyle={inputStyle}
                renderDialog={({ open, onClose, onCreated }) => (
                  <MobileNewProjectDialog
                    open={open}
                    onClose={onClose}
                    onCreated={(p) => onCreated(p.id, p.name)}
                  />
                )}
              />

              {/* Cost Type */}
              <div>
                <label className={labelClass} style={labelStyle}>
                  Cost Type{" "}
                  <span style={{ color: "var(--color-stop)" }}>*</span>
                </label>
                <div className="flex flex-wrap gap-1.5">
                  {(
                    Object.keys(
                      COST_TYPE_LABELS,
                    ) as ProjectCostForm["costType"][]
                  ).map((t) => (
                    <button
                      key={t}
                      type="button"
                      onClick={() => {
                        setCost("costType", t);
                        haptic(10);
                      }}
                      className="h-8 px-3 rounded-[0.375rem] border-2 text-m-caption font-bold text-m-body press"
                      style={{
                        borderColor:
                          costForm.costType === t
                            ? "var(--color-ink-950)"
                            : "var(--color-line)",
                        backgroundColor:
                          costForm.costType === t
                            ? "var(--color-ink-950)"
                            : "var(--color-paper)",
                        color:
                          costForm.costType === t
                            ? "var(--color-paper)"
                            : "var(--color-ink-500)",
                      }}
                    >
                      {COST_TYPE_LABELS[t]}
                    </button>
                  ))}
                </div>
              </div>

              {/* Amount + Date */}
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className={labelClass} style={labelStyle}>
                    Amount (₹){" "}
                    <span style={{ color: "var(--color-stop)" }}>*</span>
                  </label>
                  <input
                    type="number"
                    min={0.01}
                    step="any"
                    value={costForm.amount}
                    onChange={(e) => setCost("amount", e.target.value)}
                    placeholder="0"
                    inputMode="decimal"
                    autoFocus
                    className={inputClass}
                    style={inputStyle}
                  />
                </div>
                <div>
                  <label className={labelClass} style={labelStyle}>
                    Date
                  </label>
                  <input
                    type="date"
                    value={costForm.date}
                    onChange={(e) => setCost("date", e.target.value)}
                    className={inputClass}
                    style={inputStyle}
                  />
                </div>
              </div>

              {/* Vendor */}
              <div>
                <label className={labelClass} style={labelStyle}>
                  Vendor (optional)
                </label>
                <input
                  type="text"
                  value={costForm.vendor}
                  onChange={(e) => setCost("vendor", e.target.value)}
                  placeholder="e.g. ABC Contractors"
                  enterKeyHint="next"
                  className={inputClass}
                  style={inputStyle}
                />
              </div>

              {/* Subcontractor (from master) */}
              {subcontractors.length > 0 && (
                <div>
                  <label className={labelClass} style={labelStyle}>
                    Subcontractor (optional)
                  </label>
                  <select
                    value={costForm.subcontractorId}
                    onChange={(e) => setCost("subcontractorId", e.target.value)}
                    className={inputClass}
                    style={inputStyle}
                  >
                    <option value="">— None —</option>
                    {subcontractors.map((s) => (
                      <option key={s.id} value={s.id}>
                        {s.name}{s.trade ? ` (${s.trade})` : ""}
                      </option>
                    ))}
                  </select>
                </div>
              )}

              {/* Notes */}
              <div>
                <label className={labelClass} style={labelStyle}>
                  Notes (optional)
                </label>
                <textarea
                  value={costForm.notes}
                  onChange={(e) => setCost("notes", e.target.value)}
                  rows={2}
                  placeholder="Additional context…"
                  className="w-full rounded-[0.5rem] border px-3 py-2 text-m-section outline-none resize-none"
                  style={inputStyle}
                />
              </div>

              {/* Receipt photo */}
              <div>
                <label className={labelClass} style={labelStyle}>
                  Receipt Photo (optional)
                </label>
                <PhotoUploader photos={receiptPhotos} onChange={setReceiptPhotos} maxPhotos={1} />
              </div>
            </>
          )}

          {/* Actions */}
          <div className="flex flex-col gap-2 pt-1">
            <button
              type="button"
              onClick={onClose}
              disabled={saving}
              className="w-full h-11 rounded-[0.5rem] border text-m-section font-bold text-m-body press disabled:opacity-50"
              style={{
                borderColor: "var(--color-line)",
                color: "var(--color-ink-500)",
                backgroundColor: "transparent",
              }}
            >
              Cancel
            </button>
            <button
              type="submit"
              disabled={saving}
              className="w-full h-11 rounded-[0.5rem] text-m-section font-bold text-m-body press disabled:opacity-50 flex items-center justify-center gap-1.5"
              style={{
                backgroundColor: "var(--color-ink-950)",
                color: "var(--color-paper)",
              }}
            >
              {saving ? <Loader2 className="size-4 animate-spin" /> : null}
              {saving
                ? "Saving…"
                : tab === "expense"
                  ? "Record Expense"
                  : "Add Cost"}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}

/**
 * MobileFinanceFab — floating action button + dialog launcher.
 */
export function MobileFinanceFab({
  projects,
  subcontractors = [],
  canCreateExpense,
  canCreateProjectCost,
}: {
  projects: ProjectOption[];
  subcontractors?: { id: string; name: string; trade: string | null }[];
  canCreateExpense: boolean;
  canCreateProjectCost: boolean;
}) {
  const [open, setOpen] = useState(false);

  if (!canCreateExpense && !canCreateProjectCost) return null;

  return (
    <>
      <button
        onClick={() => setOpen(true)}
        className="fixed right-3 z-30 grid place-items-center size-12 rounded-full shadow-lg press"
        style={{
          bottom:
            "calc(3.5rem + max(env(safe-area-inset-bottom), 0px) + 0.75rem)",
          backgroundColor: "var(--color-ink-950)",
          color: "var(--color-paper)",
          boxShadow: "0 4px 12px rgba(0,0,0,0.2)",
        }}
        aria-label="Add expense or project cost"
      >
        <Plus className="size-5" />
      </button>

      {open && (
        <MobileNewFinanceDialog
          open={open}
          onClose={() => setOpen(false)}
          projects={projects}
          subcontractors={subcontractors}
          canCreateExpense={canCreateExpense}
          canCreateProjectCost={canCreateProjectCost}
        />
      )}
    </>
  );
}

"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { toast } from "sonner";
import {
  Repeat,
  Pause,
  Play,
  Trash2,
  Zap,
  Gauge,
  Plus,
} from "lucide-react";
import {
  MobileSectionTitle,
  MobileEmptyState,
} from "@/components/mobile/v2/primitives";
import { MobileFabModal } from "@/components/mobile/v2/fab-modal";
import { useFabModal } from "@/lib/use-fab-modal";
import { useConfirm } from "@/lib/use-confirm";
import { formatCurrency } from "@/lib/utils";
import { haptic } from "@/lib/haptic";
import {
  MobileRecurringForm,
  MobileBudgetForm,
  type PlannedOption,
  type PlannedCategory,
} from "./MobilePlannedForms";

export type RecurringItem = {
  id: string;
  category: string;
  categoryName: string | null;
  amount: number;
  frequency: string;
  startDate: string;
  endDate: string | null;
  nextRunDate: string;
  lastRunDate: string | null;
  isActive: boolean;
  projectName: string | null;
  payeeName: string | null;
  supplierName: string | null;
  paymentMode: string | null;
};

export type BudgetItem = {
  id: string;
  category: string;
  categoryName: string | null;
  amount: number;
  periodStart: string;
  periodEnd: string;
  projectName: string | null;
  actualAmount: number;
  variance: number;
  utilizationPct: number;
};

const freqLabel: Record<string, string> = {
  WEEKLY: "weekly",
  MONTHLY: "monthly",
  QUARTERLY: "quarterly",
  YEARLY: "yearly",
};

function fmtDate(iso: string | null): string {
  if (!iso) return "—";
  return new Date(iso).toLocaleDateString("en-IN", { day: "numeric", month: "short", year: "2-digit" });
}

/**
 * MobilePlannedView — the "Planned" tab on /m/accounts. Recurring expenses
 * (auto-drafted monthly rent, retainers, utilities) + expense budgets with
 * live variance vs actual spend. FINANCE_MANAGE can create/pause/delete;
 * finance.view gets read-only.
 */
export function MobilePlannedView({
  recurring,
  budgets,
  projects,
  categories,
  suppliers,
  canManage,
}: {
  recurring: RecurringItem[];
  budgets: BudgetItem[];
  projects: PlannedOption[];
  categories: PlannedCategory[];
  suppliers: PlannedOption[];
  canManage: boolean;
}) {
  const router = useRouter();
  const [confirm, confirmDialog] = useConfirm();
  const [busy, setBusy] = useState<string | null>(null);
  const recurringFab = useFabModal();
  const budgetFab = useFabModal();

  const dueCount = recurring.filter((r) => r.isActive && new Date(r.nextRunDate) <= new Date()).length;
  const monthlyRun = recurring
    .filter((r) => r.isActive)
    .reduce((s, r) => s + (r.frequency === "MONTHLY" ? r.amount : r.frequency === "WEEKLY" ? r.amount * 4.33 : r.frequency === "QUARTERLY" ? r.amount / 3 : r.amount / 12), 0);

  async function toggleActive(item: RecurringItem) {
    setBusy(item.id);
    try {
      const res = await fetch(`/api/recurring-expenses/${item.id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ isActive: !item.isActive }),
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(data.error ?? "Update failed");
      haptic(15);
      toast.success(`${item.category} ${item.isActive ? "paused" : "resumed"}`);
      router.refresh();
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Update failed");
    } finally {
      setBusy(null);
    }
  }

  async function deleteRecurring(item: RecurringItem) {
    if (!(await confirm({ title: `Delete "${item.category}"?`, description: "The recurring expense will be removed. Already-generated expenses stay.", confirmLabel: "Delete" }))) return;
    setBusy(item.id);
    try {
      const res = await fetch(`/api/recurring-expenses/${item.id}`, { method: "DELETE" });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(data.error ?? "Delete failed");
      toast.success("Recurring expense deleted");
      router.refresh();
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Delete failed");
    } finally {
      setBusy(null);
    }
  }

  async function deleteBudget(item: BudgetItem) {
    if (!(await confirm({ title: `Delete ${item.category} budget?`, description: "Removes the budget — actuals stay recorded.", confirmLabel: "Delete" }))) return;
    setBusy(item.id);
    try {
      const res = await fetch(`/api/expense-budgets/${item.id}`, { method: "DELETE" });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(data.error ?? "Delete failed");
      toast.success("Budget deleted");
      router.refresh();
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Delete failed");
    } finally {
      setBusy(null);
    }
  }

  async function generateDue() {
    setBusy("generate");
    try {
      const res = await fetch("/api/recurring-expenses?generate=true", { method: "PATCH" });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(data.error ?? "Generate failed");
      haptic(20);
      toast.success(data.generated > 0 ? `Generated ${data.generated} draft expense${data.generated === 1 ? "" : "s"}` : "Nothing due right now");
      router.refresh();
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Generate failed");
    } finally {
      setBusy(null);
    }
  }

  return (
    <div className="flex flex-col gap-1">
      {/* ── Run-rate strip ── */}
      {recurring.length > 0 && (
        <div
          className="flex items-center justify-between rounded-[0.5rem] border px-3 py-2 mb-2"
          style={{ borderColor: "var(--color-line)", backgroundColor: "var(--color-paper)" }}
        >
          <span className="text-m-caption font-bold" style={{ color: "var(--color-ink-700)" }}>
            Committed monthly: <span className="tabular-nums" style={{ color: "var(--color-ink-950)" }}>{formatCurrency(Math.round(monthlyRun))}</span>
          </span>
          {dueCount > 0 && canManage && (
            <button
              type="button"
              onClick={generateDue}
              disabled={busy === "generate"}
              className="flex items-center gap-1 rounded-full px-2.5 py-1 text-m-caption font-bold press disabled:opacity-50"
              style={{ backgroundColor: "color-mix(in srgb, var(--color-go) 12%, transparent)", color: "var(--color-go)" }}
            >
              <Zap className="size-3" />
              {busy === "generate" ? "…" : `Generate ${dueCount} due`}
            </button>
          )}
        </div>
      )}

      {/* ── Recurring expenses ── */}
      <MobileSectionTitle
        right={
          canManage ? (
            <button
              type="button"
              onClick={recurringFab.toggle}
              className="flex items-center gap-1 px-2 py-1 rounded-full text-m-caption font-bold press"
              style={{ backgroundColor: "var(--color-ink-950)", color: "var(--color-paper)" }}
            >
              <Plus className="size-3" /> New
            </button>
          ) : null
        }
      >
        Recurring expenses
      </MobileSectionTitle>
      {recurring.length === 0 ? (
        <MobileEmptyState
          icon={Repeat}
          title="No recurring expenses"
          hint={canManage ? "Set up monthly rent, utilities, retainers — they draft themselves" : "Recurring expenses will appear here"}
        />
      ) : (
        <div className="flex flex-col gap-2 mb-3">
          {recurring.map((r) => (
            <div
              key={r.id}
              className="rounded-[0.625rem] border p-3 flex flex-col gap-1"
              style={{
                borderColor: "var(--color-line)",
                backgroundColor: "var(--color-paper)",
                opacity: r.isActive ? 1 : 0.6,
              }}
            >
              <div className="flex items-center gap-2">
                <span className="min-w-0 flex-1 text-m-body font-bold truncate" style={{ color: "var(--color-ink-950)" }}>
                  {r.categoryName ?? r.category}
                </span>
                <span className="text-m-body font-bold tabular-nums shrink-0" style={{ color: "var(--color-ink-950)" }}>
                  {formatCurrency(r.amount)}
                </span>
              </div>
              <div className="flex items-center gap-2">
                <span className="min-w-0 flex-1 text-m-caption truncate" style={{ color: "var(--color-ink-500)" }}>
                  {[
                    freqLabel[r.frequency] ?? r.frequency,
                    r.payeeName ?? r.supplierName,
                    r.projectName,
                    `next ${fmtDate(r.nextRunDate)}`,
                  ].filter(Boolean).join(" · ")}
                </span>
                {canManage && (
                  <span className="flex items-center gap-0.5 shrink-0">
                    <button
                      type="button"
                      onClick={() => toggleActive(r)}
                      disabled={busy === r.id}
                      className="p-1.5 press disabled:opacity-40"
                      aria-label={r.isActive ? `Pause ${r.category}` : `Resume ${r.category}`}
                    >
                      {r.isActive
                        ? <Pause className="size-3.5" style={{ color: "var(--color-ink-500)" }} />
                        : <Play className="size-3.5" style={{ color: "var(--color-go)" }} />}
                    </button>
                    <button
                      type="button"
                      onClick={() => deleteRecurring(r)}
                      disabled={busy === r.id}
                      className="p-1.5 press disabled:opacity-40"
                      aria-label={`Delete ${r.category}`}
                    >
                      <Trash2 className="size-3.5" style={{ color: "var(--color-stop)" }} />
                    </button>
                  </span>
                )}
              </div>
            </div>
          ))}
        </div>
      )}

      {/* ── Expense budgets ── */}
      <MobileSectionTitle
        right={
          canManage ? (
            <button
              type="button"
              onClick={budgetFab.toggle}
              className="flex items-center gap-1 px-2 py-1 rounded-full text-m-caption font-bold press"
              style={{ backgroundColor: "var(--color-ink-950)", color: "var(--color-paper)" }}
            >
              <Plus className="size-3" /> New
            </button>
          ) : null
        }
      >
        Expense budgets
      </MobileSectionTitle>
      {budgets.length === 0 ? (
        <MobileEmptyState
          icon={Gauge}
          title="No budgets set"
          hint={canManage ? "Cap a category per period — actuals track against it" : "Budgets will appear here once set"}
        />
      ) : (
        <div className="flex flex-col gap-2">
          {budgets.map((b) => {
            const pct = Math.min(100, Math.round(b.utilizationPct));
            const over = b.utilizationPct > 100;
            return (
              <div
                key={b.id}
                className="rounded-[0.625rem] border p-3 flex flex-col gap-1.5"
                style={{ borderColor: "var(--color-line)", backgroundColor: "var(--color-paper)" }}
              >
                <div className="flex items-center gap-2">
                  <span className="min-w-0 flex-1 text-m-body font-bold truncate" style={{ color: "var(--color-ink-950)" }}>
                    {b.categoryName ?? b.category}
                  </span>
                  <span className="text-m-caption font-bold tabular-nums shrink-0" style={{ color: over ? "var(--color-stop)" : "var(--color-ink-950)" }}>
                    {formatCurrency(b.actualAmount)} / {formatCurrency(b.amount)}
                  </span>
                  {canManage && (
                    <button
                      type="button"
                      onClick={() => deleteBudget(b)}
                      disabled={busy === b.id}
                      className="p-1 press disabled:opacity-40 shrink-0"
                      aria-label={`Delete ${b.category} budget`}
                    >
                      <Trash2 className="size-3.5" style={{ color: "var(--color-stop)" }} />
                    </button>
                  )}
                </div>
                <div className="h-1.5 rounded-full overflow-hidden" style={{ backgroundColor: "var(--color-concrete)" }}>
                  <div
                    className="h-full rounded-full transition-all"
                    style={{
                      width: `${pct}%`,
                      backgroundColor: over ? "var(--color-stop)" : pct > 85 ? "var(--color-signal)" : "var(--color-go)",
                    }}
                  />
                </div>
                <div className="flex items-center gap-2">
                  <span className="min-w-0 flex-1 text-micro truncate" style={{ color: "var(--color-ink-500)" }}>
                    {[
                      `${fmtDate(b.periodStart)} → ${fmtDate(b.periodEnd)}`,
                      b.projectName,
                      over ? `${formatCurrency(Math.abs(b.variance))} over` : `${formatCurrency(b.variance)} left`,
                    ].filter(Boolean).join(" · ")}
                  </span>
                  <span className="text-micro font-bold tabular-nums shrink-0" style={{ color: over ? "var(--color-stop)" : "var(--color-ink-500)" }}>
                    {Math.round(b.utilizationPct)}%
                  </span>
                </div>
              </div>
            );
          })}
        </div>
      )}

      <MobileFabModal open={recurringFab.isOpen} onClose={recurringFab.close} originRect={recurringFab.originRect} title="New Recurring Expense">
        <MobileRecurringForm projects={projects} categories={categories} suppliers={suppliers} onClose={recurringFab.close} />
      </MobileFabModal>
      <MobileFabModal open={budgetFab.isOpen} onClose={budgetFab.close} originRect={budgetFab.originRect} title="New Expense Budget">
        <MobileBudgetForm projects={projects} categories={categories} onClose={budgetFab.close} />
      </MobileFabModal>
      {confirmDialog}
    </div>
  );
}

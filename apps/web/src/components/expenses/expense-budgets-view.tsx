"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { toast } from "sonner";
import { Plus, RefreshCw, Loader2, Trash2, Calculator, } from "lucide-react";
import { Button } from "@/components/ui/button";
import { } from "@/components/ui/badge";
import { Input, Label, Select } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Dialog } from "@/components/ui/dialog";
import { DataTable, type Column } from "@/components/ui/data-table";
import { EmptyState } from "@/components/empty-state";
import { formatCurrency, formatDate } from "@/lib/utils";
import type { ProjectOption, ExpenseCategoryRow } from "@/lib/types";

type BudgetRow = {
  id: string;
  category: string;
  categoryName: string | null;
  amount: number;
  periodStart: string;
  periodEnd: string;
  projectId: string | null;
  projectName: string | null;
  notes: string | null;
  actualAmount: number;
  variance: number;
  utilizationPct: number;
};

export function ExpenseBudgetsView({
  budgets,
  projects,
  categories,
  permissions,
}: {
  budgets: BudgetRow[];
  projects: ProjectOption[];
  categories: ExpenseCategoryRow[];
  permissions: { canManage: boolean };
}) {
  const router = useRouter();
  const [createOpen, setCreateOpen] = useState(false);
  const [saving, setSaving] = useState(false);
  const [deletingId, setDeletingId] = useState<string | null>(null);
  const now = new Date();
  const monthStart = new Date(now.getFullYear(), now.getMonth(), 1).toISOString().slice(0, 10);
  const monthEnd = new Date(now.getFullYear(), now.getMonth() + 1, 0).toISOString().slice(0, 10);
  const [form, setForm] = useState({
    projectId: "", categoryId: "", category: "", amount: "",
    periodStart: monthStart, periodEnd: monthEnd, notes: "",
  });

  async function create() {
    if (!form.category.trim() || !form.amount || !form.periodStart || !form.periodEnd) {
      toast.error("Category, amount, and period are required");
      return;
    }
    setSaving(true);
    try {
      const res = await fetch("/api/expense-budgets", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          projectId: form.projectId || null,
          categoryId: form.categoryId || null,
          category: form.category.trim(),
          amount: Number(form.amount),
          periodStart: form.periodStart,
          periodEnd: form.periodEnd,
          notes: form.notes || null,
        }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error ?? "Failed to create budget");
      toast.success("Budget set");
      setCreateOpen(false);
      router.refresh();
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Create failed");
    } finally {
      setSaving(false);
    }
  }

  async function remove(id: string) {
    setDeletingId(id);
    try {
      const res = await fetch(`/api/expense-budgets/${id}`, { method: "DELETE" });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error ?? "Failed to delete");
      toast.success("Budget deleted");
      router.refresh();
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Delete failed");
    } finally {
      setDeletingId(null);
    }
  }

  const columns: Column<BudgetRow>[] = [
    {
      key: "category",
      label: "Category",
      sortable: true,
      render: (b) => (
        <div className="min-w-0">
          <span className="font-medium text-foreground">{b.category}</span>
          {b.projectName && <div className="text-caption text-muted-foreground truncate">{b.projectName}</div>}
        </div>
      ),
      exportValue: (b) => b.category,
    },
    {
      key: "period",
      label: "Period",
      width: "180px",
      render: (b) => <span className="tnum text-muted-foreground">{formatDate(b.periodStart)} → {formatDate(b.periodEnd)}</span>,
      exportValue: (b) => `${formatDate(b.periodStart)} - ${formatDate(b.periodEnd)}`,
    },
    {
      key: "amount",
      label: "Budget",
      align: "right",
      sortable: true,
      width: "120px",
      render: (b) => <span className="tnum font-medium text-foreground">{formatCurrency(b.amount)}</span>,
      exportValue: (b) => b.amount,
    },
    {
      key: "actualAmount",
      label: "Actual",
      align: "right",
      sortable: true,
      width: "120px",
      render: (b) => <span className="tnum text-foreground">{formatCurrency(b.actualAmount)}</span>,
      exportValue: (b) => b.actualAmount,
    },
    {
      key: "variance",
      label: "Variance",
      align: "right",
      sortable: true,
      width: "120px",
      render: (b) => {
        const positive = b.variance >= 0;
        return (
          <span className={`tnum font-medium ${positive ? "text-success" : "text-danger"}`}>
            {positive ? "+" : ""}{formatCurrency(b.variance)}
          </span>
        );
      },
      exportValue: (b) => b.variance,
    },
    {
      key: "utilizationPct",
      label: "Utilization",
      align: "right",
      sortable: true,
      width: "140px",
      render: (b) => {
        const pct = b.utilizationPct;
        // eslint-disable-next-line @typescript-eslint/no-unused-vars
        const tone = pct >= 100 ? "danger" : pct >= 80 ? "warning" : "success";
        return (
          <div className="flex items-center justify-end gap-2">
            <div className="h-1.5 w-16 rounded-full bg-muted overflow-hidden">
              <div
                className={`h-full rounded-full ${pct >= 100 ? "bg-danger" : pct >= 80 ? "bg-warning" : "bg-success"}`}
                style={{ width: `${Math.min(100, pct)}%` }}
              />
            </div>
            <span className={`tnum text-caption font-medium ${pct >= 100 ? "text-danger" : pct >= 80 ? "text-warning" : "text-success"}`}>
              {pct.toFixed(0)}%
            </span>
          </div>
        );
      },
      exportValue: (b) => b.utilizationPct,
    },
  ];

  return (
    <div className="space-y-4">
      <div className="flex items-center gap-2">
        <Button variant="outline" size="icon" onClick={() => router.refresh()} title="Refresh">
          <RefreshCw className="h-4 w-4" />
        </Button>
        {permissions.canManage && (
          <Button size="sm" className="ml-auto" onClick={() => setCreateOpen(true)}>
            <Plus className="h-3.5 w-3.5" /> Set Budget
          </Button>
        )}
      </div>

      {budgets.length === 0 ? (
        <EmptyState
          icon={<Calculator className="h-5 w-5" />}
          title="No expense budgets"
          description="Set a budget per category and period to track variance against actual spend."
        />
      ) : (
        <div className="rounded-lg border border-border overflow-hidden">
          <DataTable
            data={budgets}
            columns={columns}
            initialSort={{ key: "periodStart", direction: "desc" }}
            storageKey="expense-budgets-list"
            hideable
            exportFileName="expense-budgets"
            searchable
            searchPlaceholder="Search by category, project…"
            pageSize={50}
            rowActions={(b) => (
              permissions.canManage && (
                <button
                  type="button"
                  onClick={(e) => { e.stopPropagation(); remove(b.id); }}
                  disabled={deletingId === b.id}
                  className="rounded p-1.5 text-muted-foreground hover:bg-danger-soft hover:text-danger"
                  title="Delete"
                >
                  {deletingId === b.id ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Trash2 className="h-3.5 w-3.5" />}
                </button>
              )
            )}
          />
        </div>
      )}

      <Dialog
        open={createOpen}
        onOpenChange={setCreateOpen}
        title="Set Expense Budget"
        description="Allocate a budget for a category and period. Actuals are computed from approved expenses."
        className="max-w-md"
      >
        <div className="space-y-3">
          <div className="grid grid-cols-2 gap-3">
            <div className="space-y-1.5">
              <Label htmlFor="eb-cat">Category *</Label>
              {categories.length > 0 ? (
                <Select id="eb-cat" value={form.categoryId} onChange={(e) => {
                  const cat = categories.find((c) => c.id === e.target.value);
                  setForm((f) => ({ ...f, categoryId: e.target.value, category: cat?.name ?? f.category }));
                }}>
                  <option value="">— Select —</option>
                  {categories.map((c) => (
                    <option key={c.id} value={c.id}>{c.name}</option>
                  ))}
                </Select>
              ) : (
                <Input id="eb-cat" value={form.category} onChange={(e) => setForm((f) => ({ ...f, category: e.target.value }))} placeholder="e.g. Office Supplies" required />
              )}
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="eb-amount">Budget Amount *</Label>
              <Input id="eb-amount" type="number" min="0" step="0.01" value={form.amount} onChange={(e) => setForm((f) => ({ ...f, amount: e.target.value }))} />
            </div>
          </div>
          <div className="grid grid-cols-2 gap-3">
            <div className="space-y-1.5">
              <Label htmlFor="eb-start">Period Start *</Label>
              <Input id="eb-start" type="date" value={form.periodStart} onChange={(e) => setForm((f) => ({ ...f, periodStart: e.target.value }))} />
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="eb-end">Period End *</Label>
              <Input id="eb-end" type="date" value={form.periodEnd} onChange={(e) => setForm((f) => ({ ...f, periodEnd: e.target.value }))} />
            </div>
          </div>
          <div className="space-y-1.5">
            <Label htmlFor="eb-project">Project (optional)</Label>
            <Select id="eb-project" value={form.projectId} onChange={(e) => setForm((f) => ({ ...f, projectId: e.target.value }))}>
              <option value="">— Company-wide —</option>
              {projects.map((p) => (
                <option key={p.id} value={p.id}>{p.name}</option>
              ))}
            </Select>
          </div>
          <div className="space-y-1.5">
            <Label htmlFor="eb-notes">Notes</Label>
            <Textarea id="eb-notes" value={form.notes} onChange={(e) => setForm((f) => ({ ...f, notes: e.target.value }))} rows={2} />
          </div>
          <div className="flex justify-end gap-2 pt-2">
            <Button variant="outline" onClick={() => setCreateOpen(false)}>Cancel</Button>
            <Button onClick={create} disabled={saving}>
              {saving ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Plus className="h-3.5 w-3.5" />}
              Set Budget
            </Button>
          </div>
        </div>
      </Dialog>
    </div>
  );
}

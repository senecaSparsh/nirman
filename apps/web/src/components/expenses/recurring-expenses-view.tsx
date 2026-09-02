"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { toast } from "sonner";
import { Plus, RefreshCw, Loader2, Zap, Trash2, Pause, Play } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Input, Label, Select } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Dialog } from "@/components/ui/dialog";
import { DataTable, type Column } from "@/components/ui/data-table";
import { EmptyState } from "@/components/empty-state";
import { formatCurrency, formatDate } from "@/lib/utils";
import type { ProjectOption, ExpenseCategoryRow } from "@/lib/types";

type RecurringRow = {
  id: string;
  category: string;
  categoryName: string | null;
  amount: number;
  frequency: "WEEKLY" | "MONTHLY" | "QUARTERLY" | "YEARLY";
  startDate: string;
  endDate: string | null;
  nextRunDate: string;
  lastRunDate: string | null;
  isActive: boolean;
  projectId: string | null;
  projectName: string | null;
  payeeName: string | null;
  supplierId: string | null;
  supplierName: string | null;
  paymentMode: string | null;
  notes: string | null;
};

const FREQ_LABEL: Record<string, string> = {
  WEEKLY: "Weekly",
  MONTHLY: "Monthly",
  QUARTERLY: "Quarterly",
  YEARLY: "Yearly",
};

export function RecurringExpensesView({
  items,
  projects,
  suppliers,
  categories,
  permissions,
}: {
  items: RecurringRow[];
  projects: ProjectOption[];
  suppliers: { id: string; name: string }[];
  categories: ExpenseCategoryRow[];
  permissions: { canManage: boolean };
}) {
  const router = useRouter();
  const [createOpen, setCreateOpen] = useState(false);
  const [saving, setSaving] = useState(false);
  const [generating, setGenerating] = useState(false);
  const [deletingId, setDeletingId] = useState<string | null>(null);
  const [form, setForm] = useState({
    projectId: "", categoryId: "", category: "", amount: "", frequency: "MONTHLY",
    startDate: new Date().toISOString().slice(0, 10), endDate: "",
    payeeName: "", supplierId: "", paymentMode: "", notes: "",
  });

  async function create() {
    if (!form.category.trim() || !form.amount || !form.startDate) {
      toast.error("Category, amount, and start date are required");
      return;
    }
    setSaving(true);
    try {
      const res = await fetch("/api/recurring-expenses", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          projectId: form.projectId || null,
          categoryId: form.categoryId || null,
          category: form.category.trim(),
          amount: Number(form.amount),
          frequency: form.frequency,
          startDate: form.startDate,
          endDate: form.endDate || null,
          payeeName: form.payeeName || null,
          supplierId: form.supplierId || null,
          paymentMode: form.paymentMode || null,
          notes: form.notes || null,
        }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error ?? "Failed to create");
      toast.success("Recurring expense created");
      setCreateOpen(false);
      setForm({ projectId: "", categoryId: "", category: "", amount: "", frequency: "MONTHLY", startDate: new Date().toISOString().slice(0, 10), endDate: "", payeeName: "", supplierId: "", paymentMode: "", notes: "" });
      router.refresh();
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Create failed");
    } finally {
      setSaving(false);
    }
  }

  async function generate() {
    setGenerating(true);
    try {
      const res = await fetch("/api/recurring-expenses?generate=true", { method: "PATCH" });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error ?? "Failed to generate");
      toast.success(data.generated > 0 ? `Generated ${data.generated} draft expense${data.generated === 1 ? "" : "s"}` : "No recurring expenses are due");
      router.refresh();
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Generate failed");
    } finally {
      setGenerating(false);
    }
  }

  async function toggleActive(item: RecurringRow) {
    try {
      const res = await fetch(`/api/recurring-expenses/${item.id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ isActive: !item.isActive }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error ?? "Failed to toggle");
      toast.success(item.isActive ? "Paused" : "Activated");
      router.refresh();
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Toggle failed");
    }
  }

  async function remove(id: string) {
    setDeletingId(id);
    try {
      const res = await fetch(`/api/recurring-expenses/${id}`, { method: "DELETE" });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error ?? "Failed to delete");
      toast.success("Recurring expense deleted");
      router.refresh();
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Delete failed");
    } finally {
      setDeletingId(null);
    }
  }

  const columns: Column<RecurringRow>[] = [
    {
      key: "category",
      label: "Category",
      sortable: true,
      render: (r) => (
        <div className="min-w-0">
          <span className="font-medium text-foreground">{r.category}</span>
          {r.projectName && <div className="text-caption text-muted-foreground truncate">{r.projectName}</div>}
        </div>
      ),
      exportValue: (r) => r.category,
    },
    {
      key: "payee",
      label: "Payee / Vendor",
      render: (r) => <span className="text-muted-foreground">{r.supplierName ?? r.payeeName ?? "—"}</span>,
      exportValue: (r) => r.supplierName ?? r.payeeName ?? "",
    },
    {
      key: "amount",
      label: "Amount",
      align: "right",
      sortable: true,
      width: "120px",
      render: (r) => <span className="tnum font-semibold text-foreground">{formatCurrency(r.amount)}</span>,
      exportValue: (r) => r.amount,
    },
    {
      key: "frequency",
      label: "Frequency",
      sortable: true,
      filterable: true,
      width: "100px",
      render: (r) => <Badge variant="outline">{FREQ_LABEL[r.frequency]}</Badge>,
      filterValue: (r) => FREQ_LABEL[r.frequency] ?? r.frequency,
      exportValue: (r) => r.frequency,
    },
    {
      key: "nextRunDate",
      label: "Next Run",
      sortable: true,
      width: "110px",
      render: (r) => {
        const isDue = r.isActive && new Date(r.nextRunDate) <= new Date();
        return (
          <span className={isDue ? "tnum text-warning font-medium" : "tnum text-muted-foreground"}>
            {formatDate(r.nextRunDate)}
          </span>
        );
      },
      exportValue: (r) => r.nextRunDate,
    },
    {
      key: "isActive",
      label: "Status",
      width: "90px",
      render: (r) => <Badge variant={r.isActive ? "success" : "muted"} dot>{r.isActive ? "Active" : "Paused"}</Badge>,
      exportValue: (r) => r.isActive ? "Active" : "Paused",
    },
  ];

  return (
    <div className="space-y-4">
      <div className="flex items-center gap-2">
        <Button variant="outline" size="icon" onClick={() => router.refresh()} title="Refresh">
          <RefreshCw className="h-4 w-4" />
        </Button>
        {permissions.canManage && (
          <>
            <Button variant="outline" size="sm" onClick={generate} disabled={generating}>
              {generating ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Zap className="h-3.5 w-3.5" />}
              Generate Due
            </Button>
            <Button size="sm" className="ml-auto" onClick={() => setCreateOpen(true)}>
              <Plus className="h-3.5 w-3.5" /> New Recurring
            </Button>
          </>
        )}
      </div>

      {items.length === 0 ? (
        <EmptyState
          icon={<RefreshCw className="h-5 w-5" />}
          title="No recurring expenses"
          description="Create a template for periodic expenses like rent or salaries. The scheduler will auto-generate drafts on schedule."
        />
      ) : (
        <div className="rounded-lg border border-border overflow-hidden">
          <DataTable
            data={items}
            columns={columns}
            initialSort={{ key: "nextRunDate", direction: "asc" }}
            storageKey="recurring-expenses-list"
            hideable
            exportFileName="recurring-expenses"
            searchable
            searchPlaceholder="Search by category, payee…"
            pageSize={50}
            rowActions={(r) => (
              <div className="flex items-center justify-end gap-0.5">
                {permissions.canManage && (
                  <button
                    type="button"
                    onClick={(e) => { e.stopPropagation(); toggleActive(r); }}
                    className="rounded p-1.5 text-muted-foreground hover:bg-muted hover:text-foreground"
                    title={r.isActive ? "Pause" : "Activate"}
                  >
                    {r.isActive ? <Pause className="h-3.5 w-3.5" /> : <Play className="h-3.5 w-3.5" />}
                  </button>
                )}
                {permissions.canManage && (
                  <button
                    type="button"
                    onClick={(e) => { e.stopPropagation(); remove(r.id); }}
                    disabled={deletingId === r.id}
                    className="rounded p-1.5 text-muted-foreground hover:bg-danger-soft hover:text-danger"
                    title="Delete"
                  >
                    {deletingId === r.id ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Trash2 className="h-3.5 w-3.5" />}
                  </button>
                )}
              </div>
            )}
          />
        </div>
      )}

      <Dialog
        open={createOpen}
        onOpenChange={setCreateOpen}
        title="New Recurring Expense"
        description="Set up a template for a periodic expense. Drafts will be auto-generated on each due date."
        className="max-w-lg"
      >
        <div className="space-y-3">
          <div className="grid grid-cols-2 gap-3">
            <div className="space-y-1.5">
              <Label htmlFor="re-cat">Category *</Label>
              {categories.length > 0 ? (
                <Select id="re-cat" value={form.categoryId} onChange={(e) => {
                  const cat = categories.find((c) => c.id === e.target.value);
                  setForm((f) => ({ ...f, categoryId: e.target.value, category: cat?.name ?? f.category }));
                }}>
                  <option value="">— Select —</option>
                  {categories.map((c) => (
                    <option key={c.id} value={c.id}>{c.name}</option>
                  ))}
                </Select>
              ) : (
                <Input id="re-cat" value={form.category} onChange={(e) => setForm((f) => ({ ...f, category: e.target.value }))} placeholder="e.g. Office Rent" required />
              )}
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="re-amount">Amount *</Label>
              <Input id="re-amount" type="number" min="0" step="0.01" value={form.amount} onChange={(e) => setForm((f) => ({ ...f, amount: e.target.value }))} />
            </div>
          </div>
          <div className="grid grid-cols-3 gap-3">
            <div className="space-y-1.5">
              <Label htmlFor="re-freq">Frequency *</Label>
              <Select id="re-freq" value={form.frequency} onChange={(e) => setForm((f) => ({ ...f, frequency: e.target.value }))}>
                {Object.entries(FREQ_LABEL).map(([v, l]) => (
                  <option key={v} value={v}>{l}</option>
                ))}
              </Select>
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="re-start">Start Date *</Label>
              <Input id="re-start" type="date" value={form.startDate} onChange={(e) => setForm((f) => ({ ...f, startDate: e.target.value }))} />
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="re-end">End Date</Label>
              <Input id="re-end" type="date" value={form.endDate} onChange={(e) => setForm((f) => ({ ...f, endDate: e.target.value }))} />
            </div>
          </div>
          <div className="grid grid-cols-2 gap-3">
            <div className="space-y-1.5">
              <Label htmlFor="re-project">Project</Label>
              <Select id="re-project" value={form.projectId} onChange={(e) => setForm((f) => ({ ...f, projectId: e.target.value }))}>
                <option value="">— None —</option>
                {projects.map((p) => (
                  <option key={p.id} value={p.id}>{p.name}</option>
                ))}
              </Select>
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="re-supplier">Vendor</Label>
              <Select id="re-supplier" value={form.supplierId} onChange={(e) => setForm((f) => ({ ...f, supplierId: e.target.value }))}>
                <option value="">— None —</option>
                {suppliers.map((s) => (
                  <option key={s.id} value={s.id}>{s.name}</option>
                ))}
              </Select>
            </div>
          </div>
          <div className="grid grid-cols-2 gap-3">
            <div className="space-y-1.5">
              <Label htmlFor="re-payee">Payee</Label>
              <Input id="re-payee" value={form.payeeName} onChange={(e) => setForm((f) => ({ ...f, payeeName: e.target.value }))} placeholder="If not a vendor" />
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="re-mode">Payment Mode</Label>
              <Select id="re-mode" value={form.paymentMode} onChange={(e) => setForm((f) => ({ ...f, paymentMode: e.target.value }))}>
                <option value="">— None —</option>
                {["CASH", "UPI", "NEFT", "BANK", "CHEQUE"].map((m) => (
                  <option key={m} value={m}>{m}</option>
                ))}
              </Select>
            </div>
          </div>
          <div className="space-y-1.5">
            <Label htmlFor="re-notes">Notes</Label>
            <Textarea id="re-notes" value={form.notes} onChange={(e) => setForm((f) => ({ ...f, notes: e.target.value }))} rows={2} />
          </div>
          <div className="flex justify-end gap-2 pt-2">
            <Button variant="outline" onClick={() => setCreateOpen(false)}>Cancel</Button>
            <Button onClick={create} disabled={saving}>
              {saving ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Plus className="h-3.5 w-3.5" />}
              Create
            </Button>
          </div>
        </div>
      </Dialog>
    </div>
  );
}

"use client";

import { useState, useMemo } from "react";
import { useRouter } from "next/navigation";
import { Plus, Trash2, Pencil, TrendingDown, ScrollText, Download, Wallet, ArrowUpRight, ArrowDownRight } from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Select } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import { EmptyState } from "@/components/empty-state";
import { DeleteConfirmDialog } from "@/components/delete-confirm-dialog";
import { formatCurrency, formatDate } from "@/lib/utils";
import { downloadCSV } from "@/lib/export";
import { ProjectCostFormDialog } from "./project-cost-form-dialog";
import { ExpenseFormDialog } from "./expense-form-dialog";
import type { ProjectPnlRow, ProjectCostRow, AuditLogRow, ProjectOption } from "@/lib/types";

export function FinanceView({
  materialInventoryValue,
  unsoldAssetValue,
  totalRevenue,
  totalCollected,
  projectPnls,
  projectCosts,
  expenses,
  auditLogs,
  projects,
  subcontractors,
  permissions,
}: {
  materialInventoryValue: number;
  unsoldAssetValue: { land: number; builtUnits: number; total: number };
  totalRevenue: number;
  totalCollected: number;
  projectPnls: ProjectPnlRow[];
  projectCosts: ProjectCostRow[];
  expenses: { id: string; projectId: string | null; projectName: string | null; category: string; amount: number; date: string; notes: string | null }[];
  auditLogs: AuditLogRow[];
  projects: ProjectOption[];
  subcontractors: { id: string; name: string; trade: string | null }[];
  permissions?: { canCreateExpense?: boolean; canManageCosts?: boolean; canDelete?: boolean };
}) {
  const [costFormOpen, setCostFormOpen] = useState(false);
  const [expenseFormOpen, setExpenseFormOpen] = useState(false);
  const [editingCost, setEditingCost] = useState<ProjectCostRow | null>(null);
  const [editingExpense, setEditingExpense] = useState<{ id: string; projectId: string | null; category: string; amount: number; date: string; notes: string | null } | null>(null);
  const [deletingCost, setDeletingCost] = useState<ProjectCostRow | null>(null);
  const [deletingExpense, setDeletingExpense] = useState<{ id: string; category: string; amount: number } | null>(null);
  const [showAudit, setShowAudit] = useState(false);
  const router = useRouter();

  const totalCosts = projectCosts.reduce((s, c) => s + c.amount, 0);
  const totalExpenses = expenses.reduce((s, e) => s + e.amount, 0);
  const totalAssets = materialInventoryValue + unsoldAssetValue.total;
  const outstanding = totalRevenue - totalCollected;

  // Merge costs + expenses into a unified money flow timeline
  type FlowEvent = { id: string; date: string; amount: number; type: "cost" | "expense"; category: string; projectName: string | null; notes: string | null; raw: ProjectCostRow | { id: string; projectId: string | null; projectName: string | null; category: string; amount: number; date: string; notes: string | null } };
  const moneyFlow: FlowEvent[] = useMemo(() => {
    const costs: FlowEvent[] = projectCosts.map((c) => ({
      id: c.id, date: c.date, amount: c.amount, type: "cost" as const,
      category: c.costType, projectName: c.projectName, notes: c.notes, raw: c,
    }));
    const exps: FlowEvent[] = expenses.map((e) => ({
      id: e.id, date: e.date, amount: e.amount, type: "expense" as const,
      category: e.category, projectName: e.projectName, notes: e.notes, raw: e,
    }));
    return [...costs, ...exps].sort((a, b) => new Date(b.date).getTime() - new Date(a.date).getTime());
  }, [projectCosts, expenses]);

  // Max value for P&L bar scaling
  const maxPnlValue = Math.max(
    ...projectPnls.map((p) => Math.max(p.totalCost, p.revenue)),
    1,
  );

  return (
    <div className="space-y-6">
      {/* ── Zone 1: Company Position ──────────────────────────────────
         The big picture. Not cards — a horizontal strip of big numbers
         with labels. You see what the company is worth at a glance. */}
      <div className="grid grid-cols-2 gap-x-6 gap-y-4 border-b border-border pb-5 sm:grid-cols-4">
        <PositionStat label="Total Assets" value={totalAssets} sub={`${formatCurrency(materialInventoryValue)} inventory · ${formatCurrency(unsoldAssetValue.total)} real estate`} />
        <PositionStat label="Revenue" value={totalRevenue} sub={`${formatCurrency(totalCollected)} collected`} accent="success" />
        <PositionStat label="Outstanding" value={outstanding} sub={`${formatCurrency(totalCollected)} of ${formatCurrency(totalRevenue)} received`} accent={outstanding > 0 ? "warning" : "muted"} />
        <PositionStat label="Costs + Expenses" value={totalCosts + totalExpenses} sub={`${formatCurrency(totalCosts)} project · ${formatCurrency(totalExpenses)} company`} accent="danger" />
      </div>

      {/* ── Zone 2: Project P&L Bar Comparison ────────────────────────
         Not a table. Each project gets a horizontal bar comparison:
         cost (amber) vs revenue (green), scaled relative to the max.
         You SEE which projects are profitable by the bar lengths.
         The gap between cost and revenue bars IS the profit/loss. */}
      <div>
        <div className="mb-3 flex items-center justify-between">
          <h2 className="text-label text-muted-foreground">Project P&L Comparison</h2>
          <div className="flex items-center gap-3 text-micro text-muted-foreground">
            <span className="flex items-center gap-1"><span className="h-2 w-3 rounded-sm bg-warning" /> Cost</span>
            <span className="flex items-center gap-1"><span className="h-2 w-3 rounded-sm bg-success" /> Revenue</span>
          </div>
        </div>

        {projectPnls.length === 0 ? (
          <EmptyState icon={<TrendingDown className="h-5 w-5" />} title="No projects" description="Create projects to see P&L data." />
        ) : (
          <div className="space-y-2.5">
            {projectPnls.map((p) => {
              const costPct = (p.totalCost / maxPnlValue) * 100;
              const revPct = (p.revenue / maxPnlValue) * 100;
              const isProfit = p.profit >= 0;
              return (
                <div key={p.projectId} className="group rounded-md p-2 transition-colors hover:bg-muted/30">
                  {/* Project name + profit */}
                  <div className="mb-1.5 flex items-baseline justify-between">
                    <span className="text-body font-medium text-foreground">{p.projectName}</span>
                    <div className="flex items-baseline gap-2">
                      <span className={`text-body font-semibold tnum ${isProfit ? "text-success" : "text-danger"}`}>
                        {isProfit ? "+" : ""}{formatCurrency(p.profit)}
                      </span>
                      {p.revenue > 0 && (
                        <Badge variant={p.margin >= 15 ? "success" : p.margin >= 0 ? "warning" : "danger"}>
                          <span className="tnum">{p.margin.toFixed(1)}%</span>
                        </Badge>
                      )}
                    </div>
                  </div>

                  {/* Cost bar */}
                  <div className="mb-1 flex items-center gap-2">
                    <span className="w-10 shrink-0 text-micro text-muted-foreground/60 tnum text-right">{formatCurrency(p.totalCost)}</span>
                    <div className="h-2 flex-1 overflow-hidden rounded-sm bg-muted">
                      <div className="h-full bg-warning" style={{ width: `${costPct}%` }} />
                    </div>
                  </div>

                  {/* Revenue bar */}
                  <div className="flex items-center gap-2">
                    <span className="w-10 shrink-0 text-micro text-muted-foreground/60 tnum text-right">{formatCurrency(p.revenue)}</span>
                    <div className="h-2 flex-1 overflow-hidden rounded-sm bg-muted">
                      <div className="h-full bg-success" style={{ width: `${revPct}%` }} />
                    </div>
                  </div>
                </div>
              );
            })}
          </div>
        )}
      </div>

      {/* ── Zone 3: Money Flow Timeline ───────────────────────────────
         Unified feed of project costs and company expenses, merged
         chronologically. Not two separate tabs with two tables.
         You see where money is flowing OUT, in one stream. */}
      <div>
        <div className="mb-3 flex items-center justify-between">
          <h2 className="text-label text-muted-foreground">Money Flow</h2>
          <div className="flex gap-2">
            <Button variant="outline" size="sm" onClick={() => downloadCSV(`project-costs-${new Date().toISOString().slice(0,10)}.csv`, projectCosts as unknown as Record<string, unknown>[], [
              { key: "projectName", label: "Project" },
              { key: "costType", label: "Type" },
              { key: "amount", label: "Amount", format: (v) => formatCurrency(Number(v)) },
              { key: "vendor", label: "Vendor" },
              { key: "date", label: "Date", format: (v) => v ? formatDate(String(v)) : "" },
              { key: "notes", label: "Notes" },
            ])} disabled={projectCosts.length === 0}>
              <Download className="h-3.5 w-3.5" /> Costs
            </Button>
            <Button variant="outline" size="sm" onClick={() => downloadCSV(`expenses-${new Date().toISOString().slice(0,10)}.csv`, expenses as unknown as Record<string, unknown>[], [
              { key: "projectName", label: "Project" },
              { key: "category", label: "Category" },
              { key: "amount", label: "Amount", format: (v) => formatCurrency(Number(v)) },
              { key: "date", label: "Date", format: (v) => v ? formatDate(String(v)) : "" },
              { key: "notes", label: "Notes" },
            ])} disabled={expenses.length === 0}>
              <Download className="h-3.5 w-3.5" /> Expenses
            </Button>
            {(permissions?.canManageCosts ?? true) && (
              <Button size="sm" onClick={() => { setEditingCost(null); setCostFormOpen(true); }} disabled={projects.length === 0}>
                <Plus className="h-3.5 w-3.5" /> Cost
              </Button>
            )}
            {(permissions?.canCreateExpense ?? true) && (
              <Button size="sm" onClick={() => { setEditingExpense(null); setExpenseFormOpen(true); }}>
                <Plus className="h-3.5 w-3.5" /> Expense
              </Button>
            )}
          </div>
        </div>

        {moneyFlow.length === 0 ? (
          <EmptyState icon={<Wallet className="h-5 w-5" />} title="No costs or expenses" description="Add project costs and company expenses to see money flow." />
        ) : (
          <div className="relative">
            {/* Timeline line */}
            <div className="absolute left-[7px] top-2 bottom-2 w-px bg-border" />
            <div className="space-y-0.5">
              {moneyFlow.slice(0, 30).map((ev) => {
                const isCost = ev.type === "cost";
                return (
                  <div
                    key={`${ev.type}-${ev.id}`}
                    className="group relative flex items-start gap-4 rounded-lg p-2.5 pl-0 transition-colors hover:bg-muted/30"
                  >
                    {/* Timeline dot */}
                    <span className={`relative z-10 mt-1.5 h-3.5 w-3.5 shrink-0 rounded-full border-2 border-background ${isCost ? "bg-warning" : "bg-danger"}`} />

                    <div className="flex-1 min-w-0">
                      <div className="flex items-baseline justify-between gap-3">
                        <div className="min-w-0">
                          <span className="text-body font-medium text-foreground">{ev.category}</span>
                          <span className="ml-2 text-caption text-muted-foreground">{isCost ? "Project Cost" : "Expense"}</span>
                        </div>
                        <span className="shrink-0 text-body font-semibold tnum text-danger">
                          −{formatCurrency(ev.amount)}
                        </span>
                      </div>
                      <div className="mt-0.5 flex items-baseline gap-2 text-caption text-muted-foreground">
                        {ev.projectName && <span className="truncate">{ev.projectName}</span>}
                        {ev.projectName && <span>·</span>}
                        <span className="tnum">{formatDate(ev.date)}</span>
                        {ev.notes && <span className="truncate">· {ev.notes}</span>}
                      </div>
                    </div>

                    {/* Edit/delete on hover */}
                    <div className="flex gap-0.5 opacity-0 transition-opacity group-hover:opacity-100">
                      {isCost && (permissions?.canManageCosts ?? true) && (
                        <button
                          onClick={() => { setEditingCost(ev.raw as ProjectCostRow); setCostFormOpen(true); }}
                          className="rounded p-1 text-muted-foreground hover:bg-muted hover:text-foreground"
                        >
                          <Pencil className="h-3 w-3" />
                        </button>
                      )}
                      {isCost && (permissions?.canDelete ?? true) && (
                        <button
                          onClick={() => setDeletingCost(ev.raw as ProjectCostRow)}
                          className="rounded p-1 text-muted-foreground hover:bg-muted hover:text-danger"
                        >
                          <Trash2 className="h-3 w-3" />
                        </button>
                      )}
                      {!isCost && (permissions?.canCreateExpense ?? true) && (
                        <button
                          onClick={() => { setEditingExpense(ev.raw as typeof editingExpense); setExpenseFormOpen(true); }}
                          className="rounded p-1 text-muted-foreground hover:bg-muted hover:text-foreground"
                        >
                          <Pencil className="h-3 w-3" />
                        </button>
                      )}
                      {!isCost && (permissions?.canDelete ?? true) && (
                        <button
                          onClick={() => setDeletingExpense(ev.raw as { id: string; category: string; amount: number })}
                          className="rounded p-1 text-muted-foreground hover:bg-muted hover:text-danger"
                        >
                          <Trash2 className="h-3 w-3" />
                        </button>
                      )}
                    </div>
                  </div>
                );
              })}
            </div>
          </div>
        )}
      </div>

      {/* ── Zone 4: Audit Log (collapsible) ─────────────────────────── */}
      <div>
        <button
          onClick={() => setShowAudit(!showAudit)}
          className="mb-3 flex items-center gap-2 text-label text-muted-foreground transition-colors hover:text-foreground"
        >
          <ScrollText className="h-3.5 w-3.5" />
          Audit Log
          <span className="text-micro text-muted-foreground/60 tnum">{auditLogs.length}</span>
          <span className="text-muted-foreground/40">{showAudit ? "−" : "+"}</span>
        </button>

        {showAudit && (
          <div className="divide-y divide-border rounded-lg border border-border">
            {auditLogs.length === 0 ? (
              <div className="py-6 text-center text-caption text-muted-foreground">No audit entries</div>
            ) : (
              auditLogs.slice(0, 20).map((log) => (
                <div key={log.id} className="flex items-center gap-3 px-3 py-2 text-caption">
                  <span className="font-medium text-foreground">{log.action}</span>
                  <span className="text-muted-foreground">{log.entityType}</span>
                  <span className="text-muted-foreground/60">{log.userName ?? "—"}</span>
                  <span className="ml-auto tnum text-muted-foreground/60">{formatDate(log.timestamp)}</span>
                </div>
              ))
            )}
          </div>
        )}
      </div>

      <ProjectCostFormDialog
        open={costFormOpen}
        onOpenChange={(o) => { setCostFormOpen(o); if (!o) setEditingCost(null); }}
        projects={projects}
        subcontractors={subcontractors}
        editing={editingCost}
      />
      <ExpenseFormDialog
        open={expenseFormOpen}
        onOpenChange={(o) => { setExpenseFormOpen(o); if (!o) setEditingExpense(null); }}
        projects={projects}
        editing={editingExpense}
      />
      {deletingCost && (
        <DeleteConfirmDialog
          open={deletingCost !== null}
          onOpenChange={(o) => !o && setDeletingCost(null)}
          endpoint={`/api/project-costs/${deletingCost.id}`}
          title="Delete project cost"
          description={`Delete ${deletingCost.costType} cost of ${formatCurrency(deletingCost.amount)} for ${deletingCost.projectName}?`}
          successMessage="Project cost deleted"
        />
      )}
      {deletingExpense && (
        <DeleteConfirmDialog
          open={deletingExpense !== null}
          onOpenChange={(o) => !o && setDeletingExpense(null)}
          endpoint={`/api/expenses/${deletingExpense.id}`}
          title="Delete expense"
          description={`Delete ${deletingExpense.category} expense of ${formatCurrency(deletingExpense.amount)}?`}
          successMessage="Expense deleted"
        />
      )}
    </div>
  );
}

// ── Position stat — big number with label and sub-text ──────────────
function PositionStat({ label, value, sub, accent }: { label: string; value: number; sub?: string; accent?: "success" | "warning" | "danger" | "muted" }) {
  const color =
    accent === "success" ? "text-success" :
    accent === "warning" ? "text-warning" :
    accent === "danger" ? "text-danger" :
    "text-foreground";
  return (
    <div>
      <div className="text-label text-muted-foreground/70">{label}</div>
      <div className={`text-title tnum ${color}`}>{formatCurrency(value)}</div>
      {sub && <div className="mt-0.5 text-micro text-muted-foreground">{sub}</div>}
    </div>
  );
}

"use client";

import { useState, useMemo } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import { Plus, Trash2, Pencil, TrendingDown, ScrollText, Download, Wallet, RefreshCw } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { EmptyState } from "@/components/empty-state";
import { DeleteConfirmDialog } from "@/components/delete-confirm-dialog";
import { DataTable, type Column } from "@/components/ui/data-table";
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
      <div className="flex justify-end">
        <Button variant="outline" size="icon" onClick={() => router.refresh()} title="Refresh">
          <RefreshCw className="h-4 w-4" />
        </Button>
      </div>

      {/* ── Zone 1: Company Position ──────────────────────────────────
         The big picture. Not cards — a horizontal strip of big numbers
         with labels. You see what the company is worth at a glance. */}
      <div className="grid grid-cols-2 gap-x-6 gap-y-4 border-b border-border pb-5 sm:grid-cols-4">
        <PositionStat label="Total Assets" value={totalAssets} sub={`${formatCurrency(materialInventoryValue)} inventory · ${formatCurrency(unsoldAssetValue.total)} real estate`} />
        <PositionStat label="Revenue" value={totalRevenue} sub={`${formatCurrency(totalCollected)} collected`} accent="success" />
        <PositionStat label="Outstanding" value={outstanding} sub={`${formatCurrency(totalCollected)} of ${formatCurrency(totalRevenue)} received`} accent={outstanding > 0 ? "warning" : "muted"} />
        <PositionStat label="Costs + Expenses" value={totalCosts + totalExpenses} sub={`${formatCurrency(totalCosts)} project · ${formatCurrency(totalExpenses)} company`} accent="danger" />
      </div>

      {/* ── Zone 2: Project P&L ──────────────────────────────────────
         Two views: a visual bar comparison (at-a-glance) and a
         sortable DataTable (for analysis). The bars show cost vs
         revenue scaled relative to max; the table gives exact
         numbers you can sort by profit, margin, cost, or revenue. */}
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
          <>
            {/* Bar comparison — visual at-a-glance */}
            <div className="space-y-2.5 mb-4">
              {projectPnls.map((p) => {
                const costPct = (p.totalCost / maxPnlValue) * 100;
                const revPct = (p.revenue / maxPnlValue) * 100;
                const isProfit = p.profit >= 0;
                return (
                  <Link
                    key={p.projectId}
                    href={`/projects/${p.projectId}`}
                    className="group block rounded-md p-2 transition-colors hover:bg-muted/30"
                  >
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
                  </Link>
                );
              })}
            </div>

            {/* Data table — sortable exact numbers */}
            <div className="rounded-lg border border-border overflow-hidden">
              <DataTable
                data={projectPnls}
                onRowClick={(p) => window.location.href = `/projects/${p.projectId}`}
                initialSort={{ key: "profit", direction: "desc" }}
                columns={pnlColumns}
                searchable
                searchPlaceholder="Search by project name…"
                showTotals
                sumColumns={["totalCost", "revenue", "profit"]}
                totalFormat={(_key, sum) => formatCurrency(sum)}
                hideable
                pageSize={50}
              />
            </div>
          </>
        )}
      </div>

      {/* ── Zone 3: Money Flow ───────────────────────────────────────
         Unified feed of project costs and company expenses as a
         sortable DataTable. Previously a timeline (pretty but
         limited to 30 items, no sorting). Now a dense grid showing
         all entries — sort by date, amount, type, or project. */}
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
          <div className="rounded-lg border border-border overflow-hidden">
            <DataTable
              data={moneyFlow}
              initialSort={{ key: "date", direction: "desc" }}
              columns={moneyFlowColumns}
              onRowClick={(ev) => {
                if (ev.type === "cost" && (permissions?.canManageCosts ?? true)) {
                  setEditingCost(ev.raw as ProjectCostRow);
                  setCostFormOpen(true);
                }
              }}
              searchable
              searchPlaceholder="Search by category, project, notes…"
              showTotals
              sumColumns={["amount"]}
              totalFormat={(_key, sum) => formatCurrency(sum)}
              hideable
              pageSize={50}
            />
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
          <div className="rounded-lg border border-border overflow-hidden">
            <DataTable
              data={auditLogs}
              initialSort={{ key: "timestamp", direction: "desc" }}
              columns={auditLogColumns}
              searchable
              searchPlaceholder="Search by action, user, entity…"
              hideable
              pageSize={50}
            />
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

// ── Column definitions for Finance DataTables ─────────────────────

/** P&L comparison table columns. */
const pnlColumns: Column<ProjectPnlRow>[] = [
  {
    key: "projectName",
    label: "Project",
    sortable: true,
    render: (p) => <span className="font-medium text-foreground">{p.projectName}</span>,
  },
  {
    key: "totalCost",
    label: "Cost",
    align: "right",
    sortable: true,
    render: (p) => <span className="tnum text-warning">{formatCurrency(p.totalCost)}</span>,
  },
  {
    key: "revenue",
    label: "Revenue",
    align: "right",
    sortable: true,
    render: (p) => <span className="tnum text-success">{formatCurrency(p.revenue)}</span>,
  },
  {
    key: "profit",
    label: "Profit",
    align: "right",
    sortable: true,
    render: (p) => (
      <span className={`tnum font-semibold ${p.profit >= 0 ? "text-success" : "text-danger"}`}>
        {p.profit >= 0 ? "+" : ""}{formatCurrency(p.profit)}
      </span>
    ),
  },
  {
    key: "margin",
    label: "Margin",
    align: "right",
    sortable: true,
    render: (p) =>
      p.revenue > 0 ? (
        <Badge variant={p.margin >= 15 ? "success" : p.margin >= 0 ? "warning" : "danger"}>
          <span className="tnum">{p.margin.toFixed(1)}%</span>
        </Badge>
      ) : (
        <span className="text-muted-foreground">—</span>
      ),
  },
];

/** Money flow table columns — costs and expenses unified. */
type FlowEvent = { id: string; date: string; amount: number; type: "cost" | "expense"; category: string; projectName: string | null; notes: string | null; raw: ProjectCostRow | { id: string; projectId: string | null; projectName: string | null; category: string; amount: number; date: string; notes: string | null } };

const moneyFlowColumns: Column<FlowEvent>[] = [
  {
    key: "date",
    label: "Date",
    sortable: true,
    sortValue: (ev) => new Date(ev.date),
    render: (ev) => <span className="tnum text-muted-foreground">{formatDate(ev.date)}</span>,
  },
  {
    key: "category",
    label: "Category",
    sortable: true,
    render: (ev) => (
      <div>
        <span className="font-medium text-foreground">{ev.category}</span>
        <span className="ml-2 text-caption text-muted-foreground">{ev.type === "cost" ? "Project Cost" : "Expense"}</span>
      </div>
    ),
  },
  {
    key: "type",
    label: "Type",
    sortable: true,
    render: (ev) => (
      <Badge variant={ev.type === "cost" ? "warning" : "danger"}>
        {ev.type === "cost" ? "Cost" : "Expense"}
      </Badge>
    ),
  },
  {
    key: "projectName",
    label: "Project",
    sortable: true,
    render: (ev) => <span className="text-muted-foreground">{ev.projectName ?? "—"}</span>,
  },
  {
    key: "amount",
    label: "Amount",
    align: "right",
    sortable: true,
    render: (ev) => <span className="tnum font-semibold text-danger">−{formatCurrency(ev.amount)}</span>,
  },
];

/** Audit log table columns. */
const auditLogColumns: Column<AuditLogRow>[] = [
  {
    key: "action",
    label: "Action",
    sortable: true,
    render: (log) => <span className="font-medium text-foreground">{log.action}</span>,
  },
  {
    key: "entityType",
    label: "Entity",
    sortable: true,
    render: (log) => <span className="text-muted-foreground">{log.entityType}</span>,
  },
  {
    key: "userName",
    label: "User",
    sortable: true,
    render: (log) => <span className="text-muted-foreground">{log.userName ?? "—"}</span>,
  },
  {
    key: "timestamp",
    label: "Time",
    align: "right",
    sortable: true,
    sortValue: (log) => new Date(log.timestamp),
    render: (log) => <span className="tnum text-muted-foreground">{formatDate(log.timestamp)}</span>,
  },
];

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

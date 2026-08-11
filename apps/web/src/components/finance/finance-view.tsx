"use client";

import { useState, useMemo } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import { Plus, Trash2, Pencil, TrendingDown, Wallet, RefreshCw, ExternalLink } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { EmptyState } from "@/components/empty-state";
import { DeleteConfirmDialog } from "@/components/delete-confirm-dialog";
import { DataTable, type Column } from "@/components/ui/data-table";
import { Tabs, TabsList, TabsTrigger, TabsContent } from "@/components/ui/tabs";
import { formatCurrency, formatDate } from "@/lib/utils";
import { entityUrl } from "@/lib/entity-url";
import { ProjectCostFormDialog } from "./project-cost-form-dialog";
import { ExpenseFormDialog } from "./expense-form-dialog";
import type { ProjectPnlRow, ProjectCostRow, AuditLogRow, ProjectOption } from "@/lib/types";

export function FinanceView({
  projectPnls,
  projectCosts,
  expenses,
  auditLogs,
  projects,
  subcontractors,
  permissions,
}: {
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
  const router = useRouter();

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

  return (
    <div className="space-y-4">
      <div className="flex justify-end">
        <Button variant="outline" size="icon" onClick={() => router.refresh()} title="Refresh">
          <RefreshCw className="h-4 w-4" />
        </Button>
      </div>

      <Tabs defaultValue="pnl">
        <TabsList>
          <TabsTrigger value="pnl">Project P&L</TabsTrigger>
          <TabsTrigger value="flow" count={moneyFlow.length}>Money Flow</TabsTrigger>
          <TabsTrigger value="audit" count={auditLogs.length}>Audit Log</TabsTrigger>
        </TabsList>

        {/* ── Project P&L ─────────────────────────────────────────── */}
        <TabsContent value="pnl">
          {projectPnls.length === 0 ? (
            <EmptyState icon={<TrendingDown className="h-5 w-5" />} title="No projects" description="Create projects to see P&L data." />
          ) : (
            <div className="rounded-lg border border-border overflow-hidden">
              <DataTable
                data={projectPnls}
                onRowClick={(p) => window.location.href = `/projects/${p.projectId}`}
                initialSort={{ key: "profit", direction: "desc" }}
                columns={pnlColumns}
                storageKey="finance-pnl"
                hideable
                exportFileName="project-pnl"
                searchable
                searchPlaceholder="Search by project name…"
                showTotals
                sumColumns={["totalCost", "revenue", "profit"]}
                totalFormat={(_key, sum) => formatCurrency(sum)}
                pageSize={50}
              />
            </div>
          )}
        </TabsContent>

        {/* ── Money Flow ──────────────────────────────────────────── */}
        <TabsContent value="flow">
          {moneyFlow.length === 0 ? (
            <EmptyState icon={<Wallet className="h-5 w-5" />} title="No costs or expenses" description="Add project costs and company expenses to see money flow." />
          ) : (
            <div className="rounded-lg border border-border overflow-hidden">
              <DataTable
                data={moneyFlow}
                initialSort={{ key: "date", direction: "desc" }}
                columns={moneyFlowColumns}
                storageKey="finance-money-flow"
                hideable
                exportFileName="money-flow"
                onRowClick={(ev) => {
                  if (ev.type === "cost" && (permissions?.canManageCosts ?? false)) {
                    setEditingCost(ev.raw as ProjectCostRow);
                    setCostFormOpen(true);
                  }
                }}
                searchable
                searchPlaceholder="Search by category, project, notes…"
                toolbarTrailing={
                  <div className="flex gap-2">
                    {(permissions?.canManageCosts ?? false) && (
                      <Button size="sm" variant="outline" onClick={() => { setEditingCost(null); setCostFormOpen(true); }} disabled={projects.length === 0}>
                        <Plus className="h-3.5 w-3.5" /> Cost
                      </Button>
                    )}
                    {(permissions?.canCreateExpense ?? false) && (
                      <Button size="sm" onClick={() => { setEditingExpense(null); setExpenseFormOpen(true); }}>
                        <Plus className="h-3.5 w-3.5" /> Expense
                      </Button>
                    )}
                  </div>
                }
                showTotals
                sumColumns={["amount"]}
                totalFormat={(_key, sum) => formatCurrency(sum)}
                pageSize={50}
              />
            </div>
          )}
        </TabsContent>

        {/* ── Audit Log ───────────────────────────────────────────── */}
        <TabsContent value="audit">
          <div className="rounded-lg border border-border overflow-hidden">
            <DataTable
              data={auditLogs}
              initialSort={{ key: "timestamp", direction: "desc" }}
              columns={auditLogColumns}
              storageKey="finance-audit-log"
              hideable
              exportFileName="audit-log"
              searchable
              searchPlaceholder="Search by action, user, entity…"
              pageSize={50}
            />
          </div>
        </TabsContent>
      </Tabs>

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
    filterable: true,
    render: (p) => <span className="font-medium text-foreground">{p.projectName}</span>,
    filterValue: (p) => p.projectName,
    exportValue: (p) => p.projectName,
  },
  {
    key: "totalCost",
    label: "Cost",
    align: "right",
    sortable: true,
    render: (p) => <span className="tnum text-warning">{formatCurrency(p.totalCost)}</span>,
    exportValue: (p) => p.totalCost,
  },
  {
    key: "revenue",
    label: "Revenue",
    align: "right",
    sortable: true,
    render: (p) => <span className="tnum text-success">{formatCurrency(p.revenue)}</span>,
    exportValue: (p) => p.revenue,
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
    exportValue: (p) => p.profit,
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
    exportValue: (p) => p.margin.toFixed(1) + "%",
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
    exportValue: (ev) => ev.date,
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
    exportValue: (ev) => ev.category,
  },
  {
    key: "type",
    label: "Type",
    sortable: true,
    filterable: true,
    render: (ev) => (
      <Badge variant={ev.type === "cost" ? "warning" : "danger"}>
        {ev.type === "cost" ? "Cost" : "Expense"}
      </Badge>
    ),
    filterValue: (ev) => (ev.type === "cost" ? "Cost" : "Expense"),
    exportValue: (ev) => ev.type,
  },
  {
    key: "projectName",
    label: "Project",
    sortable: true,
    filterable: true,
    render: (ev) => <span className="text-muted-foreground">{ev.projectName ?? "—"}</span>,
    filterValue: (ev) => ev.projectName ?? "—",
    exportValue: (ev) => ev.projectName ?? "",
  },
  {
    key: "amount",
    label: "Amount",
    align: "right",
    sortable: true,
    render: (ev) => <span className="tnum font-semibold text-danger">−{formatCurrency(ev.amount)}</span>,
    exportValue: (ev) => ev.amount,
  },
];

/**
 * Renders a compact before/after diff for audit log entries.
 * Shows changed fields with old → new values. Collapses long JSON.
 */
function AuditDiff({
  before,
  after,
}: {
  before: Record<string, unknown> | null;
  after: Record<string, unknown> | null;
}) {
  if (!before && !after) return <span className="text-muted-foreground">—</span>;

  // For CREATE actions: only show "after"
  if (!before && after) {
    const keys = Object.keys(after).slice(0, 4);
    return (
      <div className="text-caption text-muted-foreground">
        <span className="text-success font-medium">created</span>{" "}
        {keys.map((k, i) => (
          <span key={k}>
            {i > 0 && ", "}
            <span className="text-foreground">{k}</span>={" "}
            <span className="tnum">{formatDiffValue(after[k])}</span>
          </span>
        ))}
        {Object.keys(after).length > 4 && <span> +{Object.keys(after).length - 4} more</span>}
      </div>
    );
  }

  // For DELETE actions: only show "before"
  if (before && !after) {
    return (
      <div className="text-caption text-muted-foreground">
        <span className="text-danger font-medium">deleted</span>
      </div>
    );
  }

  // For UPDATE actions: show changed fields
  if (before && after) {
    const changedKeys = Object.keys(after).filter(
      (k) => JSON.stringify(before[k]) !== JSON.stringify(after[k]),
    );
    if (changedKeys.length === 0) {
      return <span className="text-muted-foreground">no changes</span>;
    }
    const shown = changedKeys.slice(0, 3);
    return (
      <div className="text-caption space-y-0.5">
        {shown.map((k) => (
          <div key={k} className="flex items-center gap-1.5">
            <span className="text-foreground font-medium">{k}:</span>
            <span className="tnum text-muted-foreground line-through">{formatDiffValue(before[k])}</span>
            <span className="text-muted-foreground">→</span>
            <span className="tnum text-foreground">{formatDiffValue(after[k])}</span>
          </div>
        ))}
        {changedKeys.length > 3 && (
          <span className="text-muted-foreground">+{changedKeys.length - 3} more</span>
        )}
      </div>
    );
  }

  return <span className="text-muted-foreground">—</span>;
}

function formatDiffValue(v: unknown): string {
  if (v == null) return "—";
  if (typeof v === "string") return v.length > 30 ? v.slice(0, 30) + "…" : v;
  if (typeof v === "number" || typeof v === "boolean") return String(v);
  return JSON.stringify(v).slice(0, 30);
}

/** Audit log table columns. */
const auditLogColumns: Column<AuditLogRow>[] = [
  {
    key: "action",
    label: "Action",
    sortable: true,
    filterable: true,
    render: (log) => <span className="font-medium text-foreground">{log.action}</span>,
    filterValue: (log) => log.action,
    exportValue: (log) => log.action,
  },
  {
    key: "entityType",
    label: "Entity",
    sortable: true,
    filterable: true,
    render: (log) => {
      const url = entityUrl(log.entityType, log.entityId);
      return url ? (
        <Link href={url} className="inline-flex items-center gap-1 text-brand hover:underline">
          {log.entityType}
          <ExternalLink className="h-3 w-3" />
        </Link>
      ) : (
        <span className="text-muted-foreground">{log.entityType}</span>
      );
    },
    filterValue: (log) => log.entityType,
    exportValue: (log) => log.entityType,
  },
  {
    key: "userName",
    label: "User",
    sortable: true,
    render: (log) => <span className="text-muted-foreground">{log.userName ?? "—"}</span>,
    exportValue: (log) => log.userName ?? "",
  },
  {
    key: "details",
    label: "Changes",
    render: (log) => <AuditDiff before={log.before} after={log.after} />,
    exportValue: (log) => {
      if (log.before && log.after) {
        return `before: ${JSON.stringify(log.before)} → after: ${JSON.stringify(log.after)}`;
      }
      if (log.after) return `after: ${JSON.stringify(log.after)}`;
      return log.details ?? "";
    },
  },
  {
    key: "timestamp",
    label: "Time",
    align: "right",
    sortable: true,
    sortValue: (log) => new Date(log.timestamp),
    render: (log) => <span className="tnum text-muted-foreground">{formatDate(log.timestamp)}</span>,
    exportValue: (log) => log.timestamp,
  },
];

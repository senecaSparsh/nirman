"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { Plus, Trash2, Pencil, Wallet, TrendingUp, TrendingDown, ScrollText, Download } from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Select } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent } from "@/components/ui/card";
import { Table, THead, TBody, TR, TH, TD } from "@/components/ui/table";
import { Tabs, TabsList, TabsTrigger, TabsContent } from "@/components/ui/tabs";
import { EmptyState } from "@/components/empty-state";
import { PageHeader } from "@/components/page-header";
import { KpiCard } from "@/components/kpi-card";
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
  const [tab, setTab] = useState("overview");
  const [costFormOpen, setCostFormOpen] = useState(false);
  const [expenseFormOpen, setExpenseFormOpen] = useState(false);
  const [costProjectFilter, setCostProjectFilter] = useState("");
  const [editingCost, setEditingCost] = useState<ProjectCostRow | null>(null);
  const [editingExpense, setEditingExpense] = useState<{ id: string; projectId: string | null; category: string; amount: number; date: string; notes: string | null } | null>(null);
  const [deletingCost, setDeletingCost] = useState<ProjectCostRow | null>(null);
  const [deletingExpense, setDeletingExpense] = useState<{ id: string; category: string; amount: number } | null>(null);
  const router = useRouter();

  const filteredCosts = costProjectFilter ? projectCosts.filter((c) => c.projectId === costProjectFilter) : projectCosts;
  const totalCosts = projectCosts.reduce((s, c) => s + c.amount, 0);
  const totalExpenses = expenses.reduce((s, e) => s + e.amount, 0);

  return (
    <div className="space-y-5">
      <PageHeader
        title="Finance & Reports"
        description="Project P&L, inventory valuation, unsold assets, costs, expenses, and audit log."
      />

      <Tabs value={tab} onValueChange={setTab}>
        <TabsList>
          <TabsTrigger value="overview">Overview</TabsTrigger>
          <TabsTrigger value="costs">Project Costs</TabsTrigger>
          <TabsTrigger value="expenses">Expenses</TabsTrigger>
          <TabsTrigger value="audit">Audit Log</TabsTrigger>
        </TabsList>

        <TabsContent value="overview">
          <div className="space-y-4">
            {/* KPI cards */}
            <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
              <KpiCard label="Material Inventory" value={formatCurrency(materialInventoryValue)} icon={<Wallet className="h-[18px] w-[18px]" />} />
              <KpiCard label="Unsold Land Value" value={formatCurrency(unsoldAssetValue.land)} icon={<TrendingUp className="h-[18px] w-[18px]" />} />
              <KpiCard label="Unsold Units Value" value={formatCurrency(unsoldAssetValue.builtUnits)} icon={<TrendingUp className="h-[18px] w-[18px]" />} />
              <KpiCard label="Total Revenue" value={formatCurrency(totalRevenue)} icon={<TrendingUp className="h-[18px] w-[18px]" />} accent="success" />
            </div>

            {/* Project P&L */}
            <Card>
              <CardContent className="p-0">
                <div className="border-b p-4">
                  <p className="text-body font-medium">Project P&L</p>
                </div>
                {projectPnls.length === 0 ? (
                  <EmptyState icon={<TrendingDown className="h-5 w-5" />} title="No projects" description="Create projects to see P&L data." />
                ) : (
                  <Table>
                    <THead>
                      <TR className="hover:bg-transparent">
                        <TH>Project</TH>
                        <TH className="text-right">Total Cost</TH>
                        <TH className="text-right">Revenue</TH>
                        <TH className="text-right">Profit</TH>
                        <TH className="text-right">Margin</TH>
                      </TR>
                    </THead>
                    <TBody>
                      {projectPnls.map((p) => (
                        <TR key={p.projectId}>
                          <TD className="text-body font-medium">{p.projectName}</TD>
                          <TD className="tnum text-right">{formatCurrency(p.totalCost)}</TD>
                          <TD className="tnum text-right">{formatCurrency(p.revenue)}</TD>
                          <TD className={`tnum text-right font-medium ${p.profit >= 0 ? "text-success" : "text-destructive"}`}>
                            {formatCurrency(p.profit)}
                          </TD>
                          <TD className="text-right">
                            <Badge variant={p.margin >= 15 ? "success" : p.margin >= 0 ? "warning" : "danger"}>
                              <span className="tnum">{p.margin.toFixed(1)}%</span>
                            </Badge>
                          </TD>
                        </TR>
                      ))}
                    </TBody>
                  </Table>
                )}
              </CardContent>
            </Card>
          </div>
        </TabsContent>

        <TabsContent value="costs">
          <div className="space-y-4">
            <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
              <div className="flex items-center gap-2">
                <Select value={costProjectFilter} onChange={(e) => setCostProjectFilter(e.target.value)} className="sm:max-w-[200px]">
                  <option value="">All projects</option>
                  {projects.map((p) => <option key={p.id} value={p.id}>{p.name}</option>)}
                </Select>
                <span className="text-body text-muted-foreground">{filteredCosts.length} costs · {formatCurrency(filteredCosts.reduce((s, c) => s + c.amount, 0))}</span>
              </div>
              <div className="flex gap-2">
                <Button variant="outline" onClick={() => downloadCSV(`project-costs-${new Date().toISOString().slice(0,10)}.csv`, filteredCosts as unknown as Record<string, unknown>[], [
                  { key: "projectName", label: "Project" },
                  { key: "costType", label: "Type" },
                  { key: "amount", label: "Amount", format: (v) => formatCurrency(Number(v)) },
                  { key: "vendor", label: "Vendor" },
                  { key: "date", label: "Date", format: (v) => v ? formatDate(String(v)) : "" },
                  { key: "notes", label: "Notes" },
                ])} disabled={filteredCosts.length === 0}>
                  <Download className="h-4 w-4" /> Export
                </Button>
                {(permissions?.canManageCosts ?? true) && (
                  <Button onClick={() => { setEditingCost(null); setCostFormOpen(true); }} disabled={projects.length === 0}>
                    <Plus className="h-4 w-4" /> Add Project Cost
                  </Button>
                )}
              </div>
            </div>

            <Card>
              <CardContent className="p-0">
                {filteredCosts.length === 0 ? (
                  <EmptyState icon={<Wallet className="h-5 w-5" />} title="No project costs" description="Add labour, overhead, equipment, contractor, permit, or other costs." />
                ) : (
                  <Table>
                    <THead>
                      <TR className="hover:bg-transparent">
                        <TH>Project</TH>
                        <TH>Type</TH>
                        <TH className="text-right">Amount</TH>
                        <TH>Vendor</TH>
                        <TH>Date</TH>
                        <TH>Notes</TH>
                        <TH className="text-right">Actions</TH>
                      </TR>
                    </THead>
                    <TBody>
                      {filteredCosts.map((c) => (
                        <TR key={c.id}>
                          <TD className="text-body font-medium">{c.projectName}</TD>
                          <TD><Badge variant="outline">{c.costType}</Badge></TD>
                          <TD className="tnum text-right">{formatCurrency(c.amount)}</TD>
                          <TD className="text-caption text-muted-foreground">{c.vendor ?? "—"}</TD>
                          <TD className="text-caption text-muted-foreground">{formatDate(c.date)}</TD>
                          <TD className="max-w-[200px] truncate text-caption text-muted-foreground">{c.notes ?? "—"}</TD>
                          <TD>
                            <div className="flex justify-end gap-1">
                              {(permissions?.canManageCosts ?? true) && (
                                <Button variant="ghost" size="icon" onClick={() => { setEditingCost(c); setCostFormOpen(true); }} title="Edit" className="text-muted-foreground hover:text-foreground">
                                  <Pencil className="h-4 w-4" />
                                </Button>
                              )}
                              {(permissions?.canDelete ?? true) && (
                                <Button variant="ghost" size="icon" onClick={() => setDeletingCost(c)} title="Delete" className="text-muted-foreground hover:text-danger">
                                  <Trash2 className="h-4 w-4" />
                                </Button>
                              )}
                            </div>
                          </TD>
                        </TR>
                      ))}
                    </TBody>
                  </Table>
                )}
              </CardContent>
            </Card>
          </div>
        </TabsContent>

        <TabsContent value="expenses">
          <div className="space-y-4">
            <div className="flex items-center justify-between">
              <span className="text-body text-muted-foreground">{expenses.length} expenses · {formatCurrency(totalExpenses)}</span>
              <div className="flex gap-2">
                <Button variant="outline" onClick={() => downloadCSV(`expenses-${new Date().toISOString().slice(0,10)}.csv`, expenses as unknown as Record<string, unknown>[], [
                  { key: "projectName", label: "Project" },
                  { key: "category", label: "Category" },
                  { key: "amount", label: "Amount", format: (v) => formatCurrency(Number(v)) },
                  { key: "date", label: "Date", format: (v) => v ? formatDate(String(v)) : "" },
                  { key: "notes", label: "Notes" },
                ])} disabled={expenses.length === 0}>
                  <Download className="h-4 w-4" /> Export
                </Button>
                {(permissions?.canCreateExpense ?? true) && (
                  <Button onClick={() => { setEditingExpense(null); setExpenseFormOpen(true); }}>
                    <Plus className="h-4 w-4" /> Add Expense
                  </Button>
                )}
              </div>
            </div>

            <Card>
              <CardContent className="p-0">
                {expenses.length === 0 ? (
                  <EmptyState icon={<Wallet className="h-5 w-5" />} title="No expenses" description="Record general company expenses." />
                ) : (
                  <Table>
                    <THead>
                      <TR className="hover:bg-transparent">
                        <TH>Project</TH>
                        <TH>Category</TH>
                        <TH className="text-right">Amount</TH>
                        <TH>Date</TH>
                        <TH>Notes</TH>
                        <TH className="text-right">Actions</TH>
                      </TR>
                    </THead>
                    <TBody>
                      {expenses.map((e) => (
                        <TR key={e.id}>
                          <TD className="text-caption text-muted-foreground">{e.projectName ?? "—"}</TD>
                          <TD><Badge variant="outline">{e.category}</Badge></TD>
                          <TD className="tnum text-right">{formatCurrency(e.amount)}</TD>
                          <TD className="text-caption text-muted-foreground">{formatDate(e.date)}</TD>
                          <TD className="max-w-[200px] truncate text-caption text-muted-foreground">{e.notes ?? "—"}</TD>
                          <TD>
                            <div className="flex justify-end gap-1">
                              {(permissions?.canCreateExpense ?? true) && (
                                <Button variant="ghost" size="icon" onClick={() => { setEditingExpense(e); setExpenseFormOpen(true); }} title="Edit" className="text-muted-foreground hover:text-foreground">
                                  <Pencil className="h-4 w-4" />
                                </Button>
                              )}
                              {(permissions?.canDelete ?? true) && (
                                <Button variant="ghost" size="icon" onClick={() => setDeletingExpense(e)} title="Delete" className="text-muted-foreground hover:text-danger">
                                  <Trash2 className="h-4 w-4" />
                                </Button>
                              )}
                            </div>
                          </TD>
                        </TR>
                      ))}
                    </TBody>
                  </Table>
                )}
              </CardContent>
            </Card>
          </div>
        </TabsContent>

        <TabsContent value="audit">
          <Card>
            <CardContent className="p-0">
              {auditLogs.length === 0 ? (
                <EmptyState icon={<ScrollText className="h-5 w-5" />} title="No audit entries" description="Actions across the system are logged here." />
              ) : (
                <Table>
                  <THead>
                    <TR className="hover:bg-transparent">
                      <TH>Action</TH>
                      <TH>Entity</TH>
                      <TH>User</TH>
                      <TH>Timestamp</TH>
                    </TR>
                  </THead>
                  <TBody>
                    {auditLogs.map((log) => (
                      <TR key={log.id}>
                        <TD className="text-body font-medium">{log.action}</TD>
                        <TD className="text-caption text-muted-foreground">{log.entityType}{log.entityId ? ` · ${log.entityId.slice(-6)}` : ""}</TD>
                        <TD className="text-caption text-muted-foreground">{log.userName ?? "—"}</TD>
                        <TD className="text-caption text-muted-foreground">{formatDate(log.timestamp)}</TD>
                      </TR>
                    ))}
                  </TBody>
                </Table>
              )}
            </CardContent>
          </Card>
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

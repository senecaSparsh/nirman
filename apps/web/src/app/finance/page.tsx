import { Suspense } from "react";
import { connection } from "next/server";
import { prisma } from "@nirman/db";
import {
  materialInventoryValue,
  unsoldAssetValue,
  projectPnl,
} from "@nirman/services";
import { getCompany, getUserRole, toNum } from "@/lib/server";
import { PERM, hasPermission } from "@/lib/roles";
import { formatCurrency } from "@/lib/utils";
import { PageHeader } from "@/components/page-header";
import { FinanceView } from "@/components/finance/finance-view";
import { PageLoading } from "@/components/page-loading";
import type { ProjectPnlRow, ProjectCostRow, ExpenseRow, AuditLogRow, ProjectOption } from "@/lib/types";

export default function FinancePage() {
  return (
    <div className="space-y-5">
      <Suspense fallback={<PageLoading label="Loading finance…" variant="list" />}>
        <FinanceContent />
      </Suspense>
    </div>
  );
}

async function FinanceContent() {
  await connection();
  const role = await getUserRole();
  const company = await getCompany();

  if (!hasPermission(role, PERM.FINANCE_VIEW)) {
    return (
      <div className="rounded-xl border border-border bg-card p-6 text-meta text-muted-foreground">
        You don't have permission to view this module.
      </div>
    );
  }

  const [projects, projectCosts, expenses, auditLogs, inventoryVal, unsoldAssets, subcontractors] = await Promise.all([
    prisma.project.findMany({
      where: { companyId: company.id, deletedAt: null },
      orderBy: { name: "asc" },
      select: { id: true, name: true, type: true, status: true },
    }),
    prisma.projectCost.findMany({
      where: { project: { companyId: company.id } },
      orderBy: { date: "desc" },
      include: { project: { select: { name: true } }, subcontractor: { select: { name: true } } },
    }),
    prisma.expense.findMany({
      where: { companyId: company.id },
      orderBy: { date: "desc" },
      include: { project: { select: { name: true } } },
    }),
    prisma.auditLog.findMany({
      orderBy: { timestamp: "desc" },
      take: 50,
      include: { user: { select: { name: true } } },
    }),
    materialInventoryValue(company.id),
    unsoldAssetValue(company.id),
    prisma.subcontractor.findMany({
      where: { deletedAt: null },
      orderBy: { name: "asc" },
      select: { id: true, name: true, trade: true },
    }),
  ]);

  // Compute P&L for each project
  const pnlResults = await Promise.all(
    projects.map(async (p) => {
      const pnl = await projectPnl(p.id);
      return {
        projectId: p.id,
        projectName: p.name,
        totalCost: toNum(pnl.total),
        revenue: toNum(pnl.revenue),
        profit: toNum(pnl.profit),
        margin: toNum(pnl.margin),
      };
    }),
  );

  // Total revenue from sales
  const sales = await prisma.assetSale.findMany({
    where: { companyId: company.id, status: "ACTIVE" },
    select: { salePrice: true, payments: { select: { amount: true } } },
  });
  const totalRevenue = sales.reduce((s, sale) => s + toNum(sale.salePrice), 0);
  const totalCollected = sales.reduce((s, sale) => s + sale.payments.reduce((ps, p) => ps + toNum(p.amount), 0), 0);

  const projectCostRows: ProjectCostRow[] = projectCosts.map((c) => ({
    id: c.id,
    projectId: c.projectId,
    projectName: c.project.name,
    costType: c.costType,
    amount: toNum(c.amount),
    date: c.date.toISOString(),
    vendor: c.vendor,
    subcontractorId: c.subcontractorId,
    subcontractorName: c.subcontractor?.name ?? null,
    notes: c.notes,
    receiptUrl: c.receiptUrl,
  }));

  const expenseRows = expenses.map((e) => ({
    id: e.id,
    projectId: e.projectId,
    projectName: e.project?.name ?? null,
    category: e.category,
    amount: toNum(e.amount),
    date: e.date.toISOString(),
    notes: e.notes,
  }));

  const auditRows: AuditLogRow[] = auditLogs.map((log) => ({
    id: log.id,
    userId: log.userId,
    userName: log.user?.name ?? null,
    action: log.action,
    entityType: log.entityType,
    entityId: log.entityId,
    details: log.after ? JSON.stringify(log.after) : null,
    timestamp: log.timestamp.toISOString(),
  }));

  const projectOptions: ProjectOption[] = projects.map((p) => ({
    id: p.id, name: p.name, type: p.type, status: p.status,
  }));

  const perms = {
    canCreateExpense: hasPermission(role, PERM.EXPENSE_CREATE),
    canManageCosts: hasPermission(role, PERM.FINANCE_MANAGE),
    canDelete: hasPermission(role, PERM.FINANCE_MANAGE),
  };

  return (
    <>
      <PageHeader
        title="Finance"
        stats={[
          { label: "Inventory", value: formatCurrency(toNum(inventoryVal)) },
          { label: "Unsold Assets", value: formatCurrency(toNum(unsoldAssets.total)) },
          { label: "Revenue", value: formatCurrency(totalRevenue) },
          { label: "Collected", value: formatCurrency(totalCollected) },
        ]}
      />
      <FinanceView
        permissions={perms}
        materialInventoryValue={toNum(inventoryVal)}
        unsoldAssetValue={{
          land: toNum(unsoldAssets.land),
          builtUnits: toNum(unsoldAssets.builtUnits),
          total: toNum(unsoldAssets.total),
        }}
        totalRevenue={totalRevenue}
        totalCollected={totalCollected}
        projectPnls={pnlResults}
        projectCosts={projectCostRows}
        expenses={expenseRows}
        auditLogs={auditRows}
        projects={projectOptions}
        subcontractors={subcontractors.map((s) => ({ id: s.id, name: s.name, trade: s.trade }))}
      />
    </>
  );
}

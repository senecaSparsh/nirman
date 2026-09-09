import { Suspense } from "react";
import { connection } from "next/server";
import { prisma } from "@nirman/db";
import {
  materialInventoryValue,
  unsoldAssetValue,
  projectPnl,
  seedChartOfAccounts,
  getExpenseBudgetVariance,
  type ExpenseBudgetVariance,
} from "@nirman/services";
import { getCompany, getUserRole, toNum, scopeWhere } from "@/lib/server";
import { PERM, hasPermission } from "@/lib/roles";
import { formatCurrency } from "@/lib/utils";
import { PageHeader } from "@/components/page-header";
import { FinanceView } from "@/components/finance/finance-view";
import { SupplierInvoicesView } from "@/components/finance/supplier-invoices-view";
import { ExpensesView } from "@/components/expenses/expenses-view";
import { ExpenseClaimsView } from "@/components/expenses/expense-claims-view";
import { PettyCashView } from "@/components/expenses/petty-cash-view";
import { RecurringExpensesView } from "@/components/expenses/recurring-expenses-view";
import { ExpenseBudgetsView } from "@/components/expenses/expense-budgets-view";
import { SupplierPaymentsView } from "@/components/finance/supplier-payments-view";
import { PageLoading } from "@/components/page-loading";
import { FinanceTabs } from "@/components/finance/finance-tabs";
import { OutstandingActionCard } from "@/components/finance/outstanding-action-card";
import type { ProjectCostRow, AuditLogRow, ProjectOption, ExpenseRow, ExpenseCategoryRow, GlAccountOption } from "@/lib/types";

import { NoAccess } from "@/components/no-access";
export default function FinancePage({
  searchParams,
}: {
  searchParams: Promise<{ tab?: string }>;
}) {
  return (
    <div className="space-y-6">
      <Suspense fallback={<PageLoading label="Loading finance…" variant="list" />}>
        <FinanceContent searchParams={searchParams} />
      </Suspense>
    </div>
  );
}

async function FinanceContent({ searchParams }: { searchParams: Promise<{ tab?: string }> }) {
  await connection();
  const { tab } = await searchParams;
  const role = await getUserRole();
  const company = await getCompany();

  if (!hasPermission(role, PERM.FINANCE_VIEW)) {
    return (
      <NoAccess what="finance" />
    );
  }

  const [projects, projectCosts, expenses, auditLogs, inventoryVal, unsoldAssets, subcontractors, suppliers, purchaseOrders] = await Promise.all([
    prisma.project.findMany({
      take: 200,
      where: { companyId: company.id, deletedAt: null },
      orderBy: { name: "asc" },
      select: { id: true, name: true, type: true, status: true },
    }),
    prisma.projectCost.findMany({
      take: 500,
      where: {...await scopeWhere("ProjectCost"),  project: { companyId: company.id } },
      orderBy: { date: "desc" },
      include: { project: { select: { name: true } }, subcontractor: { select: { name: true } } },
    }),
    prisma.expense.findMany({
      take: 500,
      where: {...await scopeWhere("Expense"),  companyId: company.id },
      orderBy: { date: "desc" },
      include: { project: { select: { name: true } } },
    }),
    prisma.auditLog.findMany({
      where: { companyId: company.id },
      orderBy: { timestamp: "desc" },
      take: 50,
      include: { user: { select: { name: true } } },
    }),
    materialInventoryValue(company.id),
    unsoldAssetValue(company.id),
    prisma.subcontractor.findMany({
      take: 200,
      where: { deletedAt: null, companyId: company.id },
      orderBy: { name: "asc" },
      select: { id: true, name: true, trade: true },
    }),
    prisma.supplier.findMany({
      take: 200,
      where: { deletedAt: null, companyId: company.id },
      orderBy: { name: "asc" },
      select: { id: true, name: true, gstin: true, phone: true, email: true, address: true, balanceOwed: true, leadTimeDays: true },
    }),
    prisma.purchaseOrder.findMany({
      take: 200,
      where: { companyId: company.id, status: { in: ["APPROVED", "ORDERED", "PARTIAL", "RECEIVED"] } },
      orderBy: { poNumber: "desc" },
      select: { id: true, poNumber: true, supplierId: true },
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
    take: 200,
    where: {...await scopeWhere("AssetSale"),  companyId: company.id, status: "ACTIVE" },
    select: { salePrice: true, payments: { select: { amount: true } } },
  });
  const totalRevenue = sales.reduce((s, sale) => s + toNum(sale.salePrice), 0);
  const totalCollected = sales.reduce((s, sale) => s + sale.payments.reduce((ps, p) => ps + toNum(p.amount), 0), 0);
  const outstandingSaleCount = sales.filter((sale) => {
    const collected = sale.payments.reduce((ps, p) => ps + toNum(p.amount), 0);
    return toNum(sale.salePrice) - collected > 0;
  }).length;

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
    before: log.before as Record<string, unknown> | null,
    after: log.after as Record<string, unknown> | null,
    timestamp: log.timestamp.toISOString(),
  }));

  const projectOptions: ProjectOption[] = projects.map((p) => ({
    id: p.id, name: p.name, type: p.type, status: p.status,
  }));

  const totalCosts = projectCostRows.reduce((s, c) => s + c.amount, 0);
  const totalExpenses = expenseRows.reduce((s, e) => s + e.amount, 0);
  const outstanding = totalRevenue - totalCollected;

  const perms = {
    canCreateExpense: hasPermission(role, PERM.EXPENSE_CREATE),
    canManageCosts: hasPermission(role, PERM.FINANCE_MANAGE),
    canDelete: hasPermission(role, PERM.FINANCE_MANAGE),
  };

  // ── Conditional data fetching for expense-related tabs ──
  // Only fetch when the tab is active to keep the page light.
  const activeTab = tab ?? "overview";
  const needExpenses = activeTab === "expenses";
  const needClaims = activeTab === "claims";
  const needPettyCash = activeTab === "petty-cash";
  const needRecurring = activeTab === "recurring";
  const needBudgets = activeTab === "budgets";
  const needSupplierPayments = activeTab === "supplier-payments";

  // Shared lookups for expense tabs
  const [expenseCategories, glAccounts, users] = await Promise.all([
    prisma.expenseCategory.findMany({ where: { companyId: company.id }, orderBy: { name: "asc" } }),
    (async () => {
      let accounts = await prisma.glAccount.findMany({ orderBy: { code: "asc" }, select: { code: true, name: true, type: true, isSystem: true } });
      if (accounts.length === 0) { await seedChartOfAccounts(); accounts = await prisma.glAccount.findMany({ orderBy: { code: "asc" }, select: { code: true, name: true, type: true, isSystem: true } }); }
      return accounts;
    })(),
    prisma.user.findMany({ where: { memberships: { some: { companyId: company.id } }, isHidden: { not: true } }, orderBy: { name: "asc" }, select: { id: true, name: true }, take: 200 }),
  ]);

  const categoryRows: ExpenseCategoryRow[] = expenseCategories.map((c) => ({ id: c.id, name: c.name, glAccountCode: c.glAccountCode, description: c.description, isActive: c.isActive }));
  const glAccountOptions: GlAccountOption[] = glAccounts.map((a) => ({ code: a.code, name: a.name, type: a.type, isSystem: a.isSystem }));
  const employeeOptions = users.map((u) => ({ id: u.id, name: u.name }));

  // Fetch expense tab data conditionally
  const expenseData = needExpenses ? await prisma.expense.findMany({
    take: 500, where: {...await scopeWhere("Expense"),  companyId: company.id }, orderBy: { date: "desc" },
    include: { project: { select: { id: true, name: true } }, categoryMaster: { select: { id: true, name: true, glAccountCode: true } }, supplier: { select: { id: true, name: true } }, approvedBy: { select: { id: true, name: true } }, submittedBy: { select: { id: true, name: true } }, createdBy: { select: { id: true, name: true } } },
  }) : [];

  const expenseViewRows: ExpenseRow[] = expenseData.map((e) => ({
    id: e.id, projectId: e.projectId, projectName: e.project?.name ?? null,
    categoryId: e.categoryId, categoryName: e.categoryMaster?.name ?? null, category: e.category,
    amount: toNum(e.amount), subtotal: toNum(e.subtotal), cgst: toNum(e.cgst), sgst: toNum(e.sgst), igst: toNum(e.igst),
    tdsAmount: toNum(e.tdsAmount), supplierId: e.supplierId, supplierName: e.supplier?.name ?? null,
    payeeName: e.payeeName, paymentMode: e.paymentMode, bankAccount: e.bankAccount,
    chequeNo: e.chequeNo, chequeDate: e.chequeDate?.toISOString() ?? null, chequePhotoUrl: e.chequePhotoUrl,
    referenceNo: e.referenceNo, receiptUrl: e.receiptUrl, status: e.status,
    submittedById: e.submittedById, submittedByName: e.submittedBy?.name ?? null,
    submittedAt: e.submittedAt?.toISOString() ?? null,
    approvedById: e.approvedById, approvedByName: e.approvedBy?.name ?? null,
    approvedAt: e.approvedAt?.toISOString() ?? null, rejectedReason: e.rejectedReason,
    glPostedAt: e.glPostedAt?.toISOString() ?? null, createdByName: e.createdBy?.name ?? null,
    date: e.date.toISOString(), notes: e.notes,
  }));

  // Fetch claims tab data conditionally
  const claimsData = needClaims ? await prisma.expenseClaim.findMany({
    take: 200, where: {...await scopeWhere("ExpenseClaim"),  companyId: company.id }, orderBy: { createdAt: "desc" },
    include: { claimant: { select: { id: true, name: true } }, project: { select: { id: true, name: true } }, lines: { select: { id: true, amount: true } } },
  }) : [];

  // Fetch petty cash tab data conditionally
  const pettyCashData = needPettyCash ? await prisma.pettyCashFloat.findMany({
    take: 200, where: {...await scopeWhere("PettyCashFloat"),  companyId: company.id }, orderBy: { name: "asc" },
    include: { project: { select: { id: true, name: true } }, custodian: { select: { id: true, name: true } }, topUps: { orderBy: { date: "desc" }, take: 20, include: { createdBy: { select: { name: true } } } } },
  }) : [];

  // Fetch recurring expenses tab data conditionally
  const recurringData = needRecurring ? await prisma.recurringExpense.findMany({
    take: 200, where: {...await scopeWhere("RecurringExpense"),  companyId: company.id }, orderBy: { nextRunDate: "asc" },
    include: { project: { select: { id: true, name: true } }, categoryMaster: { select: { id: true, name: true } }, supplier: { select: { id: true, name: true } } },
  }) : [];

  // Fetch expense budgets tab data conditionally
  const budgetResult = needBudgets ? await Promise.all([
    prisma.expenseBudget.findMany({
      take: 200, where: {...await scopeWhere("ExpenseBudget"),  companyId: company.id }, orderBy: { periodStart: "desc" },
      include: { project: { select: { id: true, name: true } }, categoryMaster: { select: { id: true, name: true } } },
    }),
    getExpenseBudgetVariance(company.id),
  ]) : null;
  const budgetData = budgetResult?.[0] ?? [];
  const budgetVariance: ExpenseBudgetVariance[] = budgetResult?.[1] ?? [];

  // Fetch supplier payments tab data conditionally
  const supplierPaymentsData = needSupplierPayments ? await prisma.supplierPayment.findMany({
    take: 200, where: { companyId: company.id }, orderBy: { paymentDate: "desc" },
    include: { supplier: { select: { id: true, name: true } }, purchaseOrder: { select: { poNumber: true } }, invoice: { select: { invoiceNumber: true } }, createdBy: { select: { name: true } } },
  }) : [];

  return (
    <>
      <PageHeader
        title="Finance"
        description="Company position, project P&L, money flow, expenses, claims, petty cash, and supplier payments — all in one place."
        stats={[
          { label: "Inventory", value: formatCurrency(toNum(inventoryVal)), hint: "Current value of material stock on hand, valued at moving average cost." },
          { label: "Unsold Assets", value: formatCurrency(toNum(unsoldAssets.total)), hint: "Book value of unsold land parcels and built units still in inventory." },
          { label: "Revenue", value: formatCurrency(totalRevenue), hint: "Total sale price across all active (non-cancelled) sales." },
          { label: "Collected", value: formatCurrency(totalCollected), hint: "Total payments received from customers across all active sales." },
          { label: "Outstanding", value: formatCurrency(outstanding), tone: outstanding > 0 ? "warning" : "muted", hint: "Revenue minus collected — what customers still owe you." },
          { label: "Costs + Expenses", value: formatCurrency(totalCosts + totalExpenses), tone: "danger", hint: `${formatCurrency(totalCosts)} project costs + ${formatCurrency(totalExpenses)} operating expenses.` },
        ]}
      />
      <OutstandingActionCard outstanding={outstanding} outstandingSaleCount={outstandingSaleCount} />
      <FinanceTabs
        overview={
          <FinanceView
            permissions={perms}
            projectPnls={pnlResults}
            projectCosts={projectCostRows}
            expenses={expenseRows}
            auditLogs={auditRows}
            projects={projectOptions}
            subcontractors={subcontractors.map((s) => ({ id: s.id, name: s.name, trade: s.trade }))}
          />
        }
        invoices={
          <SupplierInvoicesView
            suppliers={suppliers.map((s) => ({ id: s.id, name: s.name }))}
            purchaseOrders={purchaseOrders.map((p) => ({ id: p.id, poNumber: p.poNumber, supplierId: p.supplierId }))}
            permissions={{ canManage: hasPermission(role, PERM.FINANCE_MANAGE) }}
          />
        }
        expenses={
          <ExpensesView
            expenses={expenseViewRows}
            categories={categoryRows}
            projects={projectOptions}
            suppliers={suppliers.map((s) => ({ id: s.id, name: s.name }))}
            glAccounts={glAccountOptions}
            permissions={{ canCreate: hasPermission(role, PERM.EXPENSE_CREATE), canApprove: hasPermission(role, PERM.EXPENSE_APPROVE), canManage: hasPermission(role, PERM.FINANCE_MANAGE), canView: true }}
          />
        }
        claims={
          <ExpenseClaimsView
            claims={claimsData.map((c) => ({
              id: c.id, claimantId: c.claimantId, claimantName: c.claimant.name,
              projectId: c.projectId, projectName: c.project?.name ?? null,
              status: c.status, totalAmount: toNum(c.totalAmount), description: c.description,
              submittedAt: c.submittedAt?.toISOString() ?? null, approvedAt: c.approvedAt?.toISOString() ?? null,
              paidAt: c.paidAt?.toISOString() ?? null, paymentMode: c.paymentMode, referenceNo: c.referenceNo,
              lineCount: c.lines.length, createdAt: c.createdAt.toISOString(),
            }))}
            employees={employeeOptions}
            projects={projectOptions}
            categories={categoryRows}
            permissions={{ canCreate: hasPermission(role, PERM.EXPENSE_CREATE), canApprove: hasPermission(role, PERM.EXPENSE_APPROVE), canManage: hasPermission(role, PERM.FINANCE_MANAGE) }}
          />
        }
        pettyCash={
          <PettyCashView
            floats={pettyCashData.map((f) => ({
              id: f.id, name: f.name, projectId: f.projectId, projectName: f.project?.name ?? null,
              floatAmount: toNum(f.floatAmount), topUpTotal: toNum(f.topUpTotal), spentTotal: toNum(f.spentTotal),
              custodianId: f.custodianId, custodianName: f.custodian?.name ?? null,
              topUps: f.topUps.map((t) => ({
                id: t.id, amount: toNum(t.amount), paymentMode: t.paymentMode, referenceNo: t.referenceNo,
                notes: t.notes, date: t.date.toISOString(), createdByName: t.createdBy?.name ?? null,
              })),
            }))}
            projects={projectOptions}
            employees={employeeOptions}
            categories={categoryRows}
            permissions={{ canManage: hasPermission(role, PERM.FINANCE_MANAGE) }}
          />
        }
        recurring={
          <RecurringExpensesView
            items={recurringData.map((r) => ({
              id: r.id, category: r.category, categoryName: r.categoryMaster?.name ?? null,
              amount: toNum(r.amount), frequency: r.frequency,
              startDate: r.startDate.toISOString(), endDate: r.endDate?.toISOString() ?? null,
              nextRunDate: r.nextRunDate.toISOString(), lastRunDate: r.lastRunDate?.toISOString() ?? null,
              isActive: r.isActive, projectId: r.projectId, projectName: r.project?.name ?? null,
              payeeName: r.payeeName, supplierId: r.supplierId, supplierName: r.supplier?.name ?? null,
              paymentMode: r.paymentMode, notes: r.notes,
            }))}
            projects={projectOptions}
            suppliers={suppliers.map((s) => ({ id: s.id, name: s.name }))}
            categories={categoryRows}
            permissions={{ canManage: hasPermission(role, PERM.FINANCE_MANAGE) }}
          />
        }
        budgets={
          <ExpenseBudgetsView
            budgets={(() => {
              const varianceMap = new Map(budgetVariance.map((v) => [v.budgetId, v]));
              return budgetData.map((b) => {
                const v = varianceMap.get(b.id);
                return {
                  id: b.id, category: b.category, categoryName: b.categoryMaster?.name ?? null,
                  amount: toNum(b.amount), periodStart: b.periodStart.toISOString(), periodEnd: b.periodEnd.toISOString(),
                  projectId: b.projectId, projectName: b.project?.name ?? null, notes: b.notes,
                  actualAmount: v?.actualAmount ?? 0, variance: v?.variance ?? toNum(b.amount),
                  utilizationPct: v?.utilizationPct ?? 0,
                };
              });
            })()}
            projects={projectOptions}
            categories={categoryRows}
            permissions={{ canManage: hasPermission(role, PERM.FINANCE_MANAGE) }}
          />
        }
        supplierPayments={
          <SupplierPaymentsView
            payments={supplierPaymentsData.map((p) => ({
              id: p.id, paymentNumber: p.paymentNumber, supplierId: p.supplierId, supplierName: p.supplier?.name ?? "",
              purchaseOrderId: p.purchaseOrderId, poNumber: p.purchaseOrder?.poNumber ?? null,
              invoiceId: p.invoiceId, invoiceNumber: p.invoice?.invoiceNumber ?? null,
              amount: toNum(p.amount), tdsAmount: toNum(p.tdsAmount), tdsSection: p.tdsSection,
              netPaidAmount: toNum(p.netPaidAmount), paymentDate: p.paymentDate.toISOString(),
              paymentMode: p.paymentMode, referenceNo: p.referenceNo, chequePhotoUrl: p.chequePhotoUrl,
              notes: p.notes, createdByName: p.createdBy?.name ?? null,
            }))}
            suppliers={suppliers.map((s) => ({ id: s.id, name: s.name, gstin: s.gstin, phone: s.phone, email: s.email, address: s.address, balanceOwed: toNum(s.balanceOwed), openPOs: 0, poCount: 0, leadTimeDays: s.leadTimeDays }))}
          />
        }
      />
    </>
  );
}

import { Suspense } from "react";
import { MobileSkeletonList } from "@/components/mobile/mobile-skeleton";
import { connection } from "next/server";
import { notFound } from "next/navigation";
import { prisma } from "@nirman/db";
import { Wallet, Building2, Plus } from "lucide-react";
import { getCompany, getUserRole, toNum } from "@/lib/server";
import { PERM, hasPermission } from "@/lib/roles";
import { formatCurrency } from "@/lib/utils";
import { MobileEmptyState, MobileStatCard, MobileCta } from "@/components/mobile/v2/primitives";
import { MobileExportShareBar } from "@/components/mobile/v2/export-share-bar";
import type { MobileColumnSpec } from "@/components/mobile/v2/export-share-bar";
import { MobileFinanceList } from "./MobileFinanceList";
import { MobileFinanceFab } from "./MobileNewFinanceDialog";

/**
 * /m/books/finance — mobile expenses & project costs list.
 * Replaces desktop `/finance` leaks from the mobile surface.
 */
export default function MobileFinancePage() {
  return (
    <Suspense fallback={<MobileSkeletonList rows={6} />}>
      <MobileFinanceContent />
    </Suspense>
  );
}

async function MobileFinanceContent() {
  await connection();
  const role = await getUserRole();
  if (!hasPermission(role, PERM.FINANCE_VIEW)) notFound();
  const company = await getCompany();
  const canCreateExpense = hasPermission(role, PERM.EXPENSE_CREATE);
  const canCreateProjectCost = hasPermission(role, PERM.FINANCE_MANAGE);

  const [expenses, projectCosts, projects] = await Promise.all([
    prisma.expense.findMany({
      where: { companyId: company.id },
      orderBy: { date: "desc" },
      take: 30,
      include: { project: { select: { name: true } } },
    }),
    prisma.projectCost.findMany({
      where: { project: { companyId: company.id } },
      orderBy: { date: "desc" },
      take: 30,
      include: { project: { select: { name: true } } },
    }),
    (canCreateExpense || canCreateProjectCost)
      ? prisma.project.findMany({
          where: { companyId: company.id, deletedAt: null },
          orderBy: { name: "asc" },
          select: { id: true, name: true },
        })
      : [],
  ]);

  const totalExpenses = expenses.reduce((s, e) => s + toNum(e.amount), 0);
  const totalProjectCosts = projectCosts.reduce((s, c) => s + toNum(c.amount), 0);

  // Serialize for the client component (search by category, vendor, project name)
  const expenseItems = expenses.map((e) => ({
    id: e.id,
    category: e.category,
    projectName: e.project?.name ?? null,
    amount: toNum(e.amount),
    date: e.date.toISOString(),
  }));
  const projectCostItems = projectCosts.map((c) => ({
    id: c.id,
    costType: c.costType,
    projectName: c.project.name,
    vendor: c.vendor ?? null,
    amount: toNum(c.amount),
    date: c.date.toISOString(),
  }));

  // Combined rows for export/share
  const exportRows: Record<string, unknown>[] = [
    ...expenseItems.map((e) => ({ type: "Expense", category: e.category, projectName: e.projectName, vendor: "", amount: e.amount, date: e.date })),
    ...projectCostItems.map((c) => ({ type: "Project Cost", category: c.costType, projectName: c.projectName, vendor: c.vendor ?? "", amount: c.amount, date: c.date })),
  ];

  return (
    <div>
      <div className="grid grid-cols-2 gap-2 mb-3">
        <MobileStatCard label="Expenses" value={formatCurrency(totalExpenses)} icon={Wallet} />
        <MobileStatCard label="Project Costs" value={formatCurrency(totalProjectCosts)} icon={Building2} />
      </div>

      <div className="mb-3">
        <MobileExportShareBar
          title="Expenses & Project Costs"
          rows={exportRows}
          columns={[
            { key: "type", label: "Type" },
            { key: "category", label: "Category" },
            { key: "projectName", label: "Project" },
            { key: "vendor", label: "Vendor" },
            { key: "amount", label: "Amount", format: "currency" },
            { key: "date", label: "Date" },
          ] as MobileColumnSpec[]}
          summary={`${expenses.length} expenses · ${projectCosts.length} project costs`}
        />
      </div>

      {expenses.length === 0 && projectCosts.length === 0 ? (
        <MobileEmptyState
          icon={Wallet}
          title="No expenses or project costs"
          hint={canCreateExpense || canCreateProjectCost ? "Tap + to record your first expense or project cost" : "Expenses and project costs will appear here"}
        />
      ) : (
        <MobileFinanceList expenses={expenseItems} projectCosts={projectCostItems} />
      )}

      {(canCreateExpense || canCreateProjectCost) && (
        <MobileFinanceFab
          projects={projects.map((p) => ({ id: p.id, name: p.name }))}
          canCreateExpense={canCreateExpense}
          canCreateProjectCost={canCreateProjectCost}
        />
      )}
    </div>
  );
}

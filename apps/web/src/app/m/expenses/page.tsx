import { Suspense } from "react";
import { MobileSkeletonList } from "@/components/mobile/mobile-skeleton";
import { connection } from "next/server";
import { prisma } from "@nirman/db";
import { getCompany, getUserRole, toNum } from "@/lib/server";
import { PERM, hasPermission } from "@/lib/roles";
import {type MobileColumnSpec} from "@/components/mobile/v2/export-share-bar";
import { MobileExpensesList, type ExpenseListItem } from "./MobileExpensesList";

/**
 * /m/expenses — mobile expense log. Shows recent company expenses with
 * category, amount, project linkage, and notes so finance and managers
 * can review spend on the go.
 */
export default function MobileExpensesPage() {
  return (
    <Suspense fallback={<MobileSkeletonList rows={6} />}>
      <MobileExpensesContent />
    </Suspense>
  );
}

async function MobileExpensesContent() {
  await connection();
  const company = await getCompany();
  const role = await getUserRole();
  const canView = hasPermission(role, PERM.FINANCE_VIEW);
  const canCreate = hasPermission(role, PERM.EXPENSE_CREATE);

  const expenses = await prisma.expense.findMany({
    where: { companyId: company.id },
    orderBy: { date: "desc" },
    take: 80,
    include: {
      project: { select: { id: true, name: true } },
    },
  });

  const rows: ExpenseListItem[] = expenses.map((e) => ({
    id: e.id,
    category: e.category,
    amount: toNum(e.amount),
    date: e.date.toISOString(),
    projectName: e.project?.name ?? null,
    notes: e.notes ?? null,
  }));

  const totalAmount = rows.reduce((s, e) => s + e.amount, 0);
  const categories = new Set(rows.map((e) => e.category));

  const exportColumns: MobileColumnSpec[] = [
    { key: "category", label: "Category" },
    { key: "amount", label: "Amount", format: "currency" },
    { key: "date", label: "Date", format: "date" },
    { key: "projectName", label: "Project" },
    { key: "notes", label: "Notes" },
  ];

  return (
    <div>
      <MobileExpensesList
        items={rows}
        totalAmount={totalAmount}
        categoryCount={categories.size}
        canView={canView}
        canCreate={canCreate}
        exportTitle="Expenses"
        exportRows={rows as unknown as Record<string, unknown>[]}
        exportColumns={exportColumns}
        exportSummary={`${rows.length} expenses · ${categories.size} categories`}
      />
    </div>
  );
}

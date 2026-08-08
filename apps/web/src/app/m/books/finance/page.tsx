import { Suspense } from "react";
import { MobileSkeletonList } from "@/components/mobile/mobile-skeleton";
import { connection } from "next/server";
import { prisma } from "@nirman/db";
import { Wallet, Building2 } from "lucide-react";
import { getCompany, toNum } from "@/lib/server";
import { formatCurrency } from "@/lib/utils";
import {
  MobilePageHeader,
  MobileEmptyState,
  MobileStatCard,
  MobileRefreshButton,
} from "@/components/mobile/mobile-primitives";
import { MobileFinanceList } from "./MobileFinanceList";

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
  const company = await getCompany();

  const [expenses, projectCosts] = await Promise.all([
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

  return (
    <div>
      <MobilePageHeader
        title="Finance"
        subtitle="Expenses & project costs"
        right={<MobileRefreshButton />}
      />

      <div className="grid grid-cols-2 gap-2 p-3">
        <MobileStatCard label="Expenses" value={formatCurrency(totalExpenses)} icon={Wallet} />
        <MobileStatCard label="Project Costs" value={formatCurrency(totalProjectCosts)} icon={Building2} />
      </div>

      {expenses.length === 0 && projectCosts.length === 0 ? (
        <>
          <MobileEmptyState icon={Wallet} title="No expenses or project costs" hint="Record expenses and project costs from the desktop Finance section" />
        </>
      ) : (
        <MobileFinanceList expenses={expenseItems} projectCosts={projectCostItems} />
      )}
    </div>
  );
}

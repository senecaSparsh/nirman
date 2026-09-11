import { prisma } from "@nirman/db";
import { getCompany, getCurrentUser } from "@/lib/server";
import { MobileNewExpenseClient } from "./MobileNewExpenseClient";

export const metadata = { title: "New Expense — Nirman" };

export default async function MobileNewExpensePage() {
  const company = await getCompany();
  const user = await getCurrentUser();

  const [projects, categories, suppliers] = await Promise.all([
    prisma.project.findMany({
      where: { companyId: company.id, deletedAt: null },
      select: { id: true, name: true },
      orderBy: { name: "asc" },
      take: 200,
    }),
    prisma.expenseCategory.findMany({
      where: { companyId: company.id, isActive: true },
      select: { id: true, name: true },
      orderBy: { name: "asc" },
      take: 100,
    }),
    prisma.supplier.findMany({
      where: { companyId: company.id, deletedAt: null },
      select: { id: true, name: true },
      orderBy: { name: "asc" },
      take: 200,
    }),
  ]);

  return (
    <MobileNewExpenseClient
      projects={projects}
      categories={categories}
      suppliers={suppliers}
      currentUserId={user?.id ?? null}
    />
  );
}

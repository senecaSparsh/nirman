import { prisma } from "@nirman/db";
import { getCompany, getCurrentUser } from "@/lib/server";
import { PERM } from "@/lib/roles";
import { MobileNewEntityPage } from "@/components/mobile/v2/new-entity-page";
import { MobileNewExpenseClaimClient } from "./MobileNewExpenseClaimClient";

/**
 * /m/expense-claims/new — standalone mobile form to submit an
 * expense claim with inline line-item entry. Fetches employees,
 * projects, and expense categories for the current company, then
 * renders a client form that creates the claim + lines + auto-submits.
 */
export default function MobileNewExpenseClaimPage() {
  return (
    <MobileNewEntityPage perm={PERM.EXPENSE_CREATE} what="submit expense claims" permission="expense.create" fields={3}>
      {async () => {
        const company = await getCompany();
        const currentUser = await getCurrentUser();

        const [employees, projects, categories] = await Promise.all([
          prisma.user.findMany({
            where: { memberships: { some: { companyId: company.id } } },
            orderBy: { name: "asc" },
            select: { id: true, name: true },
          }),
          prisma.project.findMany({
            where: { companyId: company.id, deletedAt: null },
            orderBy: { name: "asc" },
            select: { id: true, name: true },
          }),
          prisma.expenseCategory.findMany({
            where: { companyId: company.id, isActive: true },
            orderBy: { name: "asc" },
            select: { id: true, name: true, isActive: true },
          }),
        ]);

        return (
          <MobileNewExpenseClaimClient
            employees={employees.map((e) => ({ id: e.id, name: e.name }))}
            projects={projects.map((p) => ({ id: p.id, name: p.name }))}
            categories={categories.map((c) => ({ id: c.id, name: c.name, isActive: c.isActive }))}
            currentUserId={currentUser?.id ?? null}
          />
        );
      }}
    </MobileNewEntityPage>
  );
}

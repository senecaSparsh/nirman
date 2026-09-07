import { prisma } from "@nirman/db";
import { toNum } from "@/lib/server";
import { PERM, hasPermission } from "@/lib/roles";
import { MobileListPage } from "@/components/mobile/v2/list-page";
import { MobileExpenseClaimsList, type ExpenseClaimListItem } from "./MobileExpenseClaimsList";

/**
 * /m/expense-claims — mobile expense claim list. Shows employee
 * reimbursement claims with status, amount, and claimant so
 * approvers can review and approve on the go.
 */
export default function MobileExpenseClaimsPage() {
  return (
    <MobileListPage>
      {async ({ company, role }) => {
        const canApprove = hasPermission(role, PERM.EXPENSE_APPROVE);
        const canCreate = hasPermission(role, PERM.EXPENSE_CREATE);

        const claims = await prisma.expenseClaim.findMany({
          where: { companyId: company.id },
          orderBy: { createdAt: "desc" },
          take: 80,
          include: {
            claimant: { select: { id: true, name: true } },
            project: { select: { id: true, name: true } },
          },
        });

        const rows: ExpenseClaimListItem[] = claims.map((c) => ({
          id: c.id,
          claimantName: c.claimant?.name ?? "—",
          projectName: c.project?.name ?? null,
          status: c.status,
          totalAmount: toNum(c.totalAmount),
          submittedAt: c.submittedAt?.toISOString() ?? c.createdAt.toISOString(),
          description: c.description ?? null,
        }));

        const totalAmount = rows.reduce((s, c) => s + c.totalAmount, 0);
        const pendingCount = rows.filter((c) => c.status === "SUBMITTED").length;

        return (
          <MobileExpenseClaimsList
            items={rows}
            totalAmount={totalAmount}
            pendingCount={pendingCount}
            canApprove={canApprove}
            canCreate={canCreate}
          />
        );
      }}
    </MobileListPage>
  );
}

import { Suspense } from "react";
import { MobileSkeletonList } from "@/components/mobile/mobile-skeleton";
import { connection } from "next/server";
import { prisma } from "@nirman/db";
import { getCompany, getUserRole, toNum } from "@/lib/server";
import { PERM, hasPermission } from "@/lib/roles";
import { MobileExpenseClaimsList, type ExpenseClaimListItem } from "./MobileExpenseClaimsList";

/**
 * /m/expense-claims — mobile expense claim list. Shows employee
 * reimbursement claims with status, amount, and claimant so
 * approvers can review and approve on the go.
 */
export default function MobileExpenseClaimsPage() {
  return (
    <Suspense fallback={<MobileSkeletonList rows={6} />}>
      <MobileExpenseClaimsContent />
    </Suspense>
  );
}

async function MobileExpenseClaimsContent() {
  await connection();
  const company = await getCompany();
  const role = await getUserRole();
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
}

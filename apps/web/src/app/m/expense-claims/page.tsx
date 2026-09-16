import { prisma } from "@nirman/db";
import { toNum, scopeWhere, getCurrentUser } from "@/lib/server";
import { PERM } from "@/lib/roles";
import { MobileListPage } from "@/components/mobile/v2/list-page";
import { MobileNoAccess } from "@/components/mobile/v2/primitives";
import { MobileExpenseClaimsList, type ExpenseClaimListItem } from "./MobileExpenseClaimsList";
import { MobileFab } from "@/components/mobile/v2/scaffold";

/**
 * /m/expense-claims — mobile expense claim list.
 *
 * Finance roles (finance.view) see all claims and can approve.
 * Anyone else with claim.create (field staff, site engineers, sales)
 * sees ONLY their own claims — reimbursement is self-service, so a
 * site engineer must be able to file a claim and track its status
 * without ever seeing another employee's claims.
 */
export default function MobileExpenseClaimsPage() {
  return (
    <MobileListPage>
      {async ({ company, perms }) => {
        const canSeeAll = perms.includes(PERM.FINANCE_VIEW);
        const canCreate = perms.includes(PERM.EXPENSE_CREATE) || perms.includes(PERM.CLAIM_CREATE);
        const canApprove = perms.includes(PERM.EXPENSE_APPROVE);
        const user = await getCurrentUser();

        if (!canSeeAll && !canCreate) {
          return <MobileNoAccess what="expense claims" permission="claim.create" />;
        }

        const BATCH_SIZE = 40;
        const claims = await prisma.expenseClaim.findMany({
          where: {
            ...await scopeWhere("ExpenseClaim"),
            companyId: company.id,
            // Self-service claimants see only their own claims.
            ...(canSeeAll ? {} : { claimantId: user?.id ?? "none" })},
          orderBy: [{ createdAt: "desc" }, { id: "desc" }],
          take: BATCH_SIZE + 1,
          include: {
            claimant: { select: { id: true, name: true } },
            project: { select: { id: true, name: true } }}});

        const hasMore = claims.length > BATCH_SIZE;
        const batch = hasMore ? claims.slice(0, BATCH_SIZE) : claims;
        const last = batch[batch.length - 1];
        const nextCursor = hasMore && last
          ? `${last.createdAt.toISOString()}|${last.id}`
          : null;

        const rows: ExpenseClaimListItem[] = batch.map((c) => ({
          id: c.id,
          claimantName: c.claimant?.name ?? "—",
          projectName: c.project?.name ?? null,
          status: c.status,
          totalAmount: toNum(c.totalAmount),
          submittedAt: c.submittedAt?.toISOString() ?? c.createdAt.toISOString(),
          description: c.description ?? null}));

        const totalAmount = rows.reduce((s, c) => s + c.totalAmount, 0);
        const pendingCount = rows.filter((c) => c.status === "SUBMITTED").length;

        return (
          <>
            <MobileExpenseClaimsList
              items={rows}
              totalAmount={totalAmount}
              pendingCount={pendingCount}
              canApprove={canSeeAll && canApprove}
              canCreate={canCreate}
              loadMoreUrl="/api/mobile/list/expense-claims"
              initialCursor={nextCursor}
            />
            {canCreate && <MobileFab href="/m/expense-claims/new" label="Submit claim" />}
          </>
        );
      }}
    </MobileListPage>
  );
}

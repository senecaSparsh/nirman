import { prisma } from "@nirman/db";
import { toNum, scopeWhere, getCurrentUser, getUserPermissions } from "@/lib/server";
import { PERM } from "@/lib/roles";
import { canAutoApprove, canWaiveSelfApproval } from "@nirman/services";
import { resolveNextAction } from "@/lib/flow-map";
import { NextActionCardView } from "@/components/mobile/v2/guidance";
import { MobileDetailPage } from "@/components/mobile/v2/detail-page";
import { MobileExpenseClaimDetailClient } from "./MobileExpenseClaimDetailClient";
import { PageContextProvider } from "@/components/mobile/v2/page-context";

type CategoryRow = { id: string; name: string; isActive: boolean };

/**
 * /m/expense-claims/[id] — mobile expense claim detail.
 * Shows claim header, line items, workflow timeline, and
 * approve / reject / pay actions for approvers on the go.
 */
export default function MobileExpenseClaimDetailPage({
  params}: {
  params: Promise<{ id: string }>;
}) {
  return (
    <MobileDetailPage params={params} perm={[PERM.FINANCE_VIEW, PERM.EXPENSE_CREATE, PERM.CLAIM_CREATE]} what="expense claims" permission="expense.create" skeletonSections={4} scopeAware>
      {async ({ id, company, role, actingRole, perms }) => {
        const overrides = await getUserPermissions();
        const currentUser = await getCurrentUser();
        // Match the API gate — non-finance viewers see only their own claims.
        const claim = await prisma.expenseClaim.findFirst({
          where: {...await scopeWhere("ExpenseClaim"),  id, companyId: company.id,
            ...(perms.includes(PERM.FINANCE_VIEW) ? {} : { claimantId: currentUser?.id ?? "__none__" }) },
          include: {
            claimant: { select: { id: true, name: true } },
            project: { select: { id: true, name: true } },
            approvedBy: { select: { id: true, name: true } },
            createdBy: { select: { id: true, name: true } },
            submittedBy: { select: { id: true, name: true } },
            lines: {
              include: { categoryMaster: { select: { id: true, name: true } } },
              orderBy: { date: "desc" }}}});

        // Mirror the service gates exactly: self-APPROVE is waived only for
        // OWNER (canWaiveSelfApproval), while self-REJECT is waived for all
        // tier-1 roles (canAutoApprove) — different thresholds, separate flags.
        const isSelfClaim = claim?.claimantId === currentUser?.id;
        const canApprove = perms.includes(PERM.EXPENSE_APPROVE) &&
          (!isSelfClaim || canWaiveSelfApproval(actingRole));
        const canReject = perms.includes(PERM.EXPENSE_APPROVE) &&
          (!isSelfClaim || canAutoApprove(actingRole));
        const canManage = perms.includes(PERM.FINANCE_MANAGE);
        // Match the list/new pages — claim filers hold CLAIM_CREATE (own
        // claims), finance holds EXPENSE_CREATE (all claims). Gating on
        // EXPENSE_CREATE alone locked claimants out of their own drafts:
        // they could create one but never add lines or submit it.
        const canCreate = perms.includes(PERM.EXPENSE_CREATE) || perms.includes(PERM.CLAIM_CREATE);

        const categories: CategoryRow[] = canCreate
          ? await prisma.expenseCategory.findMany({
              where: { companyId: company.id, isActive: true },
              orderBy: { name: "asc" },
              select: { id: true, name: true, isActive: true }})
          : [];

        // Claimant's open advance — the pay sheet offers imprest netting
        // (settle against advance) only when one exists.
        const claimantEmployee = claim
          ? await prisma.employee.findFirst({
              where: { userId: claim.claimantId, companyId: company.id, deletedAt: null },
              select: { id: true } })
          : null;
        const advanceAgg = claimantEmployee
          ? await prisma.employeeAdvance.aggregate({
              _sum: { amount: true, recoveredAmount: true },
              where: { employeeId: claimantEmployee.id, status: "ACTIVE" } })
          : null;
        const advanceOutstanding = advanceAgg ? toNum(advanceAgg._sum.amount) - toNum(advanceAgg._sum.recoveredAmount) : 0;

        if (!claim) {
          return (
            <MobileExpenseClaimDetailClient
              notFound
              id={id}
              claimantName=""
              projectName={null}
              status="DRAFT"
              totalAmount={0}
              description={null}
              submittedAt={null}
              approvedByName={null}
              approvedAt={null}
              rejectedReason={null}
              paidAt={null}
              paymentMode={null}
              referenceNo={null}
              createdByName={null}
              submittedByName={null}
              lines={[]}
              canApprove={false}
              canReject={false}
              canManage={false}
              canCreate={false}
              createdAt=""
              categories={[]}
            />
          );
        }

        // The one thing to do next — same rules as the action bar:
        // self-approval shows the card only to tier-1 waivers.
        let nextAction = claim ? resolveNextAction("expenseClaim", claim.status, role, overrides) : undefined;
        if (isSelfClaim && claim?.status === "SUBMITTED" && !canWaiveSelfApproval(actingRole)) {
          nextAction = undefined;
        }

        return (
          <PageContextProvider value={{
            entityType: "expenseClaim",
            flowId: "expenseClaim",
            status: claim.status,
            label: claim.claimant.name,
            subtitle: claim.project?.name ?? undefined,
            recordId: claim.id}}>
            {nextAction && (
              <NextActionCardView
                label={nextAction.label}
                actionVerb={nextAction.verb}
                reason={nextAction.reason}
                tone={nextAction.tone ?? "signal"}
                hash={nextAction.action.type === "anchor" ? nextAction.action.hash : undefined}
              />
            )}
            <MobileExpenseClaimDetailClient
              id={claim.id}
              claimantName={claim.claimant.name}
              projectName={claim.project?.name ?? null}
              status={claim.status}
              totalAmount={toNum(claim.totalAmount)}
              description={claim.description}
              submittedAt={claim.submittedAt?.toISOString() ?? null}
              approvedByName={claim.approvedBy?.name ?? null}
              approvedAt={claim.approvedAt?.toISOString() ?? null}
              rejectedReason={claim.rejectedReason}
              paidAt={claim.paidAt?.toISOString() ?? null}
              paymentMode={claim.paymentMode}
              referenceNo={claim.referenceNo}
              createdByName={claim.createdBy?.name ?? null}
              submittedByName={claim.submittedBy?.name ?? null}
              lines={claim.lines.map((l) => ({
                id: l.id,
                categoryName: l.categoryMaster?.name ?? l.category,
                amount: toNum(l.amount),
                gstRate: l.gstRate ? toNum(l.gstRate) : null,
                gstAmount: l.gstAmount ? toNum(l.gstAmount) : null,
                date: l.date.toISOString(),
                receiptUrl: l.receiptUrl,
                notes: l.notes}))}
              canApprove={canApprove}
              canReject={canReject}
              canManage={canManage}
              canCreate={canCreate}
              createdAt={claim.createdAt.toISOString()}
              categories={categories}
              advanceOutstanding={advanceOutstanding}
            />
          </PageContextProvider>
        );
      }}
    </MobileDetailPage>
  );
}

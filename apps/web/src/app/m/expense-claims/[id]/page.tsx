import { prisma } from "@nirman/db";
import { toNum } from "@/lib/server";
import { PERM, hasPermission } from "@/lib/roles";
import { MobileDetailPage } from "@/components/mobile/v2/detail-page";
import { MobileExpenseClaimDetailClient } from "./MobileExpenseClaimDetailClient";
import { PageContextProvider } from "@/components/mobile/v2/page-context";

/**
 * /m/expense-claims/[id] — mobile expense claim detail.
 * Shows claim header, line items, workflow timeline, and
 * approve / reject / pay actions for approvers on the go.
 */
export default function MobileExpenseClaimDetailPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  return (
    <MobileDetailPage params={params} skeletonSections={4}>
      {async ({ id, company, role }) => {
        const claim = await prisma.expenseClaim.findFirst({
          where: { id, companyId: company.id },
          include: {
            claimant: { select: { id: true, name: true } },
            project: { select: { id: true, name: true } },
            approvedBy: { select: { id: true, name: true } },
            lines: {
              include: { categoryMaster: { select: { id: true, name: true } } },
              orderBy: { date: "desc" },
            },
          },
        });

        const canApprove = hasPermission(role, PERM.EXPENSE_APPROVE);
        const canManage = hasPermission(role, PERM.FINANCE_MANAGE);
        const canCreate = hasPermission(role, PERM.EXPENSE_CREATE);

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
              lines={[]}
              canApprove={false}
              canManage={false}
              canCreate={false}
              createdAt=""
            />
          );
        }

        return (
          <PageContextProvider value={{
            entityType: "expenseClaim",
            status: claim.status,
            label: claim.claimant.name,
            subtitle: claim.project?.name ?? undefined,
            recordId: claim.id,
          }}>
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
            lines={claim.lines.map((l) => ({
              id: l.id,
              categoryName: l.categoryMaster?.name ?? l.category,
              amount: toNum(l.amount),
              gstRate: l.gstRate ? toNum(l.gstRate) : null,
              gstAmount: l.gstAmount ? toNum(l.gstAmount) : null,
              date: l.date.toISOString(),
              receiptUrl: l.receiptUrl,
              notes: l.notes,
            }))}
            canApprove={canApprove}
            canManage={canManage}
            canCreate={canCreate}
            createdAt={claim.createdAt.toISOString()}
          />
          </PageContextProvider>
        );
      }}
    </MobileDetailPage>
  );
}

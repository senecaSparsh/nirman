import { prisma } from "@nirman/db";
import { toNum, scopeWhere, getCurrentUser } from "@/lib/server";
import { PERM, hasPermission } from "@/lib/roles";
import { canAutoApprove } from "@nirman/services";
import { MobileDetailPage } from "@/components/mobile/v2/detail-page";
import { MobileExpenseDetailClient } from "./MobileExpenseDetailClient";
import { PageContextProvider } from "@/components/mobile/v2/page-context";

/**
 * /m/expenses/[id] — mobile expense detail.
 * Shows expense header, payment details, workflow timeline, and
 * submit / approve / reject / delete actions.
 */
export default function MobileExpenseDetailPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  return (
    <MobileDetailPage params={params} skeletonSections={4}>
      {async ({ id, company, role }) => {
        const expense = await prisma.expense.findFirst({
          where: { id, companyId: company.id, ...await scopeWhere("Expense", {}) },
          include: {
            project: { select: { id: true, name: true } },
            categoryMaster: { select: { id: true, name: true } },
            supplier: { select: { id: true, name: true } },
            approvedBy: { select: { id: true, name: true } },
            submittedBy: { select: { id: true, name: true } },
            createdBy: { select: { id: true, name: true } },
          },
        });

        const currentUser = await getCurrentUser();
        // Hide Approve from the submitter/creator — self-approval is blocked
        // server-side — unless they're a tier-1 approver (OWNER/ADMIN), where
        // no higher reviewer exists.
        const isSelfExpense = !!expense && (expense.submittedById === currentUser?.id || expense.createdById === currentUser?.id);
        const canApprove = hasPermission(role, PERM.EXPENSE_APPROVE) && (!isSelfExpense || canAutoApprove(role));
        const canManage = hasPermission(role, PERM.FINANCE_MANAGE);
        const canCreate = hasPermission(role, PERM.EXPENSE_CREATE);

        if (!expense) {
          return (
            <MobileExpenseDetailClient
              notFound
              id={id}
              category=""
              amount={0}
              subtotal={0}
              cgst={0}
              sgst={0}
              igst={0}
              tdsAmount={0}
              status="DRAFT"
              date=""
              projectName={null}
              projectId={null}
              supplierName={null}
              payeeName={null}
              paymentMode={null}
              referenceNo={null}
              receiptUrl={null}
              notes={null}
              createdByName={null}
              createdAt=""
              submittedByName={null}
              submittedAt={null}
              approvedByName={null}
              approvedAt={null}
              rejectedReason={null}
              canApprove={false}
              canManage={false}
              canCreate={false}
            />
          );
        }

        return (
          <PageContextProvider value={{
            entityType: "expense",
            status: expense.status,
            label: expense.category,
            subtitle: expense.project?.name ?? undefined,
            recordId: expense.id,
          }}>
            <MobileExpenseDetailClient
              id={expense.id}
              category={expense.category}
              amount={toNum(expense.amount)}
              subtotal={toNum(expense.subtotal)}
              cgst={toNum(expense.cgst)}
              sgst={toNum(expense.sgst)}
              igst={toNum(expense.igst)}
              tdsAmount={toNum(expense.tdsAmount)}
              status={expense.status}
              date={expense.date.toISOString()}
              projectName={expense.project?.name ?? null}
              projectId={expense.project?.id ?? null}
              supplierName={expense.supplier?.name ?? null}
              payeeName={expense.payeeName}
              paymentMode={expense.paymentMode}
              referenceNo={expense.referenceNo}
              receiptUrl={expense.receiptUrl}
              notes={expense.notes}
              createdByName={expense.createdBy?.name ?? null}
              createdAt={expense.createdAt.toISOString()}
              submittedByName={expense.submittedBy?.name ?? null}
              submittedAt={expense.submittedAt?.toISOString() ?? null}
              approvedByName={expense.approvedBy?.name ?? null}
              approvedAt={expense.approvedAt?.toISOString() ?? null}
              rejectedReason={expense.rejectedReason}
              canApprove={canApprove}
              canManage={canManage}
              canCreate={canCreate}
            />
          </PageContextProvider>
        );
      }}
    </MobileDetailPage>
  );
}

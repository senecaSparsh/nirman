import { Suspense } from "react";
import { connection } from "next/server";
import { prisma } from "@nirman/db";
import { seedChartOfAccounts } from "@nirman/services";
import { getCompany, getUserRole, toNum } from "@/lib/server";
import { PERM, hasPermission } from "@/lib/roles";
import { formatCurrency } from "@/lib/utils";
import { PageHeader } from "@/components/page-header";
import { PageLoading } from "@/components/page-loading";
import { NoAccess } from "@/components/no-access";
import { ExpensesView } from "@/components/expenses/expenses-view";
import type { ExpenseRow, ExpenseCategoryRow, GlAccountOption, ProjectOption } from "@/lib/types";

export const metadata = { title: "Expenses · Nirman" };

export default function ExpensesPage() {
  return (
    <div className="space-y-6">
      <Suspense fallback={<PageLoading label="Loading expenses…" variant="list" />}>
        <ExpensesContent />
      </Suspense>
    </div>
  );
}

export async function ExpensesContent() {
  await connection();
  const role = await getUserRole();
  const company = await getCompany();

  if (!hasPermission(role, PERM.FINANCE_VIEW)) {
    return <NoAccess what="expenses" />;
  }

  const perms = {
    canCreate: hasPermission(role, PERM.EXPENSE_CREATE),
    canApprove: hasPermission(role, PERM.EXPENSE_APPROVE),
    canManage: hasPermission(role, PERM.FINANCE_MANAGE),
    canView: true,
  };

  const [expenses, categories, projects, suppliers, glAccounts] = await Promise.all([
    prisma.expense.findMany({
      take: 500,
      where: { companyId: company.id },
      orderBy: { date: "desc" },
      include: {
        project: { select: { id: true, name: true } },
        categoryMaster: { select: { id: true, name: true, glAccountCode: true } },
        supplier: { select: { id: true, name: true } },
        approvedBy: { select: { id: true, name: true } },
        submittedBy: { select: { id: true, name: true } },
        createdBy: { select: { id: true, name: true } },
      },
    }),
    prisma.expenseCategory.findMany({
      where: { companyId: company.id },
      orderBy: { name: "asc" },
    }),
    prisma.project.findMany({
      take: 200,
      where: { companyId: company.id, deletedAt: null },
      orderBy: { name: "asc" },
      select: { id: true, name: true, type: true, status: true },
    }),
    prisma.supplier.findMany({
      take: 200,
      where: { deletedAt: null, companyId: company.id },
      orderBy: { name: "asc" },
      select: { id: true, name: true },
    }),
    (async () => {
      let accounts = await prisma.glAccount.findMany({
        orderBy: { code: "asc" },
        select: { code: true, name: true, type: true, isSystem: true },
      });
      if (accounts.length === 0) {
        await seedChartOfAccounts();
        accounts = await prisma.glAccount.findMany({
          orderBy: { code: "asc" },
          select: { code: true, name: true, type: true, isSystem: true },
        });
      }
      return accounts;
    })(),
  ]);

  const rows: ExpenseRow[] = expenses.map((e) => ({
    id: e.id,
    projectId: e.projectId,
    projectName: e.project?.name ?? null,
    categoryId: e.categoryId,
    categoryName: e.categoryMaster?.name ?? null,
    category: e.category,
    amount: toNum(e.amount),
    subtotal: toNum(e.subtotal),
    cgst: toNum(e.cgst),
    sgst: toNum(e.sgst),
    igst: toNum(e.igst),
    tdsAmount: toNum(e.tdsAmount),
    supplierId: e.supplierId,
    supplierName: e.supplier?.name ?? null,
    payeeName: e.payeeName,
    paymentMode: e.paymentMode,
    bankAccount: e.bankAccount,
    chequeNo: e.chequeNo,
    chequeDate: e.chequeDate?.toISOString() ?? null,
    chequePhotoUrl: e.chequePhotoUrl,
    referenceNo: e.referenceNo,
    receiptUrl: e.receiptUrl,
    status: e.status,
    submittedById: e.submittedById,
    submittedByName: e.submittedBy?.name ?? null,
    submittedAt: e.submittedAt?.toISOString() ?? null,
    approvedById: e.approvedById,
    approvedByName: e.approvedBy?.name ?? null,
    approvedAt: e.approvedAt?.toISOString() ?? null,
    rejectedReason: e.rejectedReason,
    glPostedAt: e.glPostedAt?.toISOString() ?? null,
    createdByName: e.createdBy?.name ?? null,
    date: e.date.toISOString(),
    notes: e.notes,
  }));

  const categoryRows: ExpenseCategoryRow[] = categories.map((c) => ({
    id: c.id,
    name: c.name,
    glAccountCode: c.glAccountCode,
    description: c.description,
    isActive: c.isActive,
  }));

  const projectOptions: ProjectOption[] = projects.map((p) => ({
    id: p.id, name: p.name, type: p.type, status: p.status,
  }));

  const glOptions: GlAccountOption[] = glAccounts.map((a) => ({
    code: a.code, name: a.name, type: a.type, isSystem: a.isSystem,
  }));

  // KPIs — only approved expenses hit the books
  const totalApproved = rows.filter((r) => r.status === "APPROVED").reduce((s, r) => s + r.amount, 0);
  const totalPending = rows.filter((r) => r.status === "PENDING").reduce((s, r) => s + r.amount, 0);
  const totalDraft = rows.filter((r) => r.status === "DRAFT").reduce((s, r) => s + r.amount, 0);
  const pendingCount = rows.filter((r) => r.status === "PENDING").length;

  return (
    <>
      <PageHeader
        title="Expenses"
        description="Book and approve operating expenses — categories, payment mode, GST, receipts, and an approval workflow. GL posts on approval."
        stats={[
          { label: "Approved", value: formatCurrency(totalApproved), hint: "Total of approved expenses — these have hit the General Ledger." },
          { label: "Pending", value: formatCurrency(totalPending), tone: totalPending > 0 ? "warning" : "muted", hint: `${pendingCount} expense${pendingCount === 1 ? "" : "s"} awaiting approval.` },
          { label: "Draft", value: formatCurrency(totalDraft), tone: "muted", hint: "Drafts don't affect the books until submitted and approved." },
          { label: "Categories", value: categoryRows.length, hint: "Expense category masters — each maps to a GL expense account." },
        ]}
      />
      <ExpensesView
        expenses={rows}
        categories={categoryRows}
        projects={projectOptions}
        suppliers={suppliers.map((s) => ({ id: s.id, name: s.name }))}
        glAccounts={glOptions}
        permissions={perms}
      />
    </>
  );
}

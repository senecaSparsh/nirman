import { Suspense } from "react";
import { connection } from "next/server";
import { prisma } from "@nirman/db";
import { getCompany, getUserRole, toNum } from "@/lib/server";
import { PERM, hasPermission } from "@/lib/roles";
import { formatCurrency } from "@/lib/utils";
import { PageHeader } from "@/components/page-header";
import { PageLoading } from "@/components/page-loading";
import { NoAccess } from "@/components/no-access";
import { ExpenseClaimsView } from "@/components/expenses/expense-claims-view";
import type { ProjectOption } from "@/lib/types";

export const metadata = { title: "Expense Claims · Nirman" };

export default function ExpenseClaimsPage() {
  return (
    <div className="space-y-6">
      <Suspense fallback={<PageLoading label="Loading claims…" variant="list" />}>
        <ExpenseClaimsContent />
      </Suspense>
    </div>
  );
}

export async function ExpenseClaimsContent() {
  await connection();
  const role = await getUserRole();
  const company = await getCompany();

  if (!hasPermission(role, PERM.FINANCE_VIEW)) {
    return <NoAccess what="expense claims" />;
  }

  const perms = {
    canCreate: hasPermission(role, PERM.EXPENSE_CREATE),
    canApprove: hasPermission(role, PERM.EXPENSE_APPROVE),
    canManage: hasPermission(role, PERM.FINANCE_MANAGE),
  };

  const [claims, employees, projects, categories] = await Promise.all([
    prisma.expenseClaim.findMany({
      where: { companyId: company.id },
      orderBy: { createdAt: "desc" },
      take: 200,
      include: {
        claimant: { select: { id: true, name: true } },
        project: { select: { id: true, name: true } },
        lines: { select: { id: true, amount: true } },
      },
    }),
    prisma.user.findMany({
      where: { memberships: { some: { companyId: company.id } } },
      orderBy: { name: "asc" },
      select: { id: true, name: true },
    }),
    prisma.project.findMany({
      take: 200,
      where: { companyId: company.id, deletedAt: null },
      orderBy: { name: "asc" },
      select: { id: true, name: true, type: true, status: true },
    }),
    prisma.expenseCategory.findMany({
      where: { companyId: company.id, isActive: true },
      orderBy: { name: "asc" },
    }),
  ]);

  const rows = claims.map((c) => ({
    id: c.id,
    claimantId: c.claimantId,
    claimantName: c.claimant.name,
    projectId: c.projectId,
    projectName: c.project?.name ?? null,
    status: c.status,
    totalAmount: toNum(c.totalAmount),
    description: c.description,
    submittedAt: c.submittedAt?.toISOString() ?? null,
    approvedAt: c.approvedAt?.toISOString() ?? null,
    paidAt: c.paidAt?.toISOString() ?? null,
    paymentMode: c.paymentMode,
    referenceNo: c.referenceNo,
    lineCount: c.lines.length,
    createdAt: c.createdAt.toISOString(),
  }));

  const projectOptions: ProjectOption[] = projects.map((p) => ({
    id: p.id, name: p.name, type: p.type, status: p.status,
  }));

  const totalApproved = rows.filter((r) => r.status === "APPROVED").reduce((s, r) => s + r.totalAmount, 0);
  const totalPending = rows.filter((r) => r.status === "SUBMITTED").reduce((s, r) => s + r.totalAmount, 0);
  const totalPaid = rows.filter((r) => r.status === "PAID").reduce((s, r) => s + r.totalAmount, 0);

  return (
    <>
      <PageHeader
        title="Expense Claims"
        description="Employee reimbursement claims — submit, approve, and pay out. Each claim bundles multiple expense lines into one approval cycle."
        stats={[
          { label: "Pending", value: formatCurrency(totalPending), tone: totalPending > 0 ? "warning" : "muted", hint: "Submitted claims awaiting approval." },
          { label: "Approved", value: formatCurrency(totalApproved), hint: "Approved claims awaiting payment." },
          { label: "Paid", value: formatCurrency(totalPaid), tone: "muted", hint: "Total paid out to claimants." },
          { label: "Total Claims", value: rows.length, hint: "All claims across all statuses." },
        ]}
      />
      <ExpenseClaimsView
        claims={rows}
        employees={employees}
        projects={projectOptions}
        categories={categories}
        permissions={perms}
      />
    </>
  );
}

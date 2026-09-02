import { Suspense } from "react";
import { connection } from "next/server";
import { prisma } from "@nirman/db";
import { getCompany, getUserRole, toNum } from "@/lib/server";
import { PERM, hasPermission } from "@/lib/roles";
import { formatCurrency } from "@/lib/utils";
import { PageHeader } from "@/components/page-header";
import { PageLoading } from "@/components/page-loading";
import { NoAccess } from "@/components/no-access";
import { PettyCashView } from "@/components/expenses/petty-cash-view";
import type { ProjectOption } from "@/lib/types";

export const metadata = { title: "Petty Cash · Nirman" };

export default function PettyCashPage() {
  return (
    <div className="space-y-6">
      <Suspense fallback={<PageLoading label="Loading petty cash…" variant="list" />}>
        <PettyCashContent />
      </Suspense>
    </div>
  );
}

async function PettyCashContent() {
  await connection();
  const role = await getUserRole();
  const company = await getCompany();

  if (!hasPermission(role, PERM.FINANCE_VIEW)) {
    return <NoAccess what="petty cash" />;
  }

  const perms = {
    canManage: hasPermission(role, PERM.FINANCE_MANAGE),
  };

  const [floats, projects, employees, categories] = await Promise.all([
    prisma.pettyCashFloat.findMany({
      where: { companyId: company.id },
      orderBy: { name: "asc" },
      include: {
        project: { select: { id: true, name: true } },
        custodian: { select: { id: true, name: true } },
        topUps: { orderBy: { date: "desc" }, take: 20, include: { createdBy: { select: { name: true } } } },
      },
    }),
    prisma.project.findMany({
      take: 200,
      where: { companyId: company.id, deletedAt: null },
      orderBy: { name: "asc" },
      select: { id: true, name: true, type: true, status: true },
    }),
    prisma.user.findMany({
      where: { memberships: { some: { companyId: company.id } } },
      orderBy: { name: "asc" },
      select: { id: true, name: true },
    }),
    prisma.expenseCategory.findMany({
      where: { companyId: company.id, isActive: true },
      orderBy: { name: "asc" },
    }),
  ]);

  const rows = floats.map((f) => ({
    id: f.id,
    name: f.name,
    projectId: f.projectId,
    projectName: f.project?.name ?? null,
    floatAmount: toNum(f.floatAmount),
    topUpTotal: toNum(f.topUpTotal),
    spentTotal: toNum(f.spentTotal),
    custodianId: f.custodianId,
    custodianName: f.custodian?.name ?? null,
    topUps: f.topUps.map((t) => ({
      id: t.id,
      amount: toNum(t.amount),
      paymentMode: t.paymentMode,
      referenceNo: t.referenceNo,
      notes: t.notes,
      date: t.date.toISOString(),
      createdByName: t.createdBy?.name ?? null,
    })),
  }));

  const projectOptions: ProjectOption[] = projects.map((p) => ({
    id: p.id, name: p.name, type: p.type, status: p.status,
  }));

  const totalFloat = rows.reduce((s, f) => s + f.floatAmount, 0);
  const totalTopUps = rows.reduce((s, f) => s + f.topUpTotal, 0);
  const totalSpent = rows.reduce((s, f) => s + f.spentTotal, 0);

  return (
    <>
      <PageHeader
        title="Petty Cash"
        description="Site and office cash floats — track top-ups, balances, and spend against each float."
        stats={[
          { label: "Current Balance", value: formatCurrency(totalFloat), hint: "Sum of all float balances (top-ups minus spend)." },
          { label: "Total Top-ups", value: formatCurrency(totalTopUps), tone: "muted", hint: "Cumulative top-ups across all floats." },
          { label: "Total Spent", value: formatCurrency(totalSpent), tone: "danger", hint: "Cumulative spend from all floats." },
          { label: "Floats", value: rows.length, hint: "Number of petty cash floats." },
        ]}
      />
      <PettyCashView
        floats={rows}
        projects={projectOptions}
        employees={employees}
        categories={categories}
        permissions={perms}
      />
    </>
  );
}

import { Suspense } from "react";
import { connection } from "next/server";
import { prisma } from "@nirman/db";
import { getCompany, toNum, getUserRole } from "@/lib/server";
import { formatCurrency } from "@/lib/utils";
import { PERM, hasPermission } from "@/lib/roles";
import { PageHeader } from "@/components/page-header";
import { PageLoading } from "@/components/page-loading";
import { SalesRevenueReport, type SaleRecord } from "@/components/reports/sales-revenue-report";

import { NoAccess } from "@/components/no-access";
export default function SalesRevenuePage() {
  return (
    <div className="space-y-6">
      <Suspense fallback={<PageLoading label="Loading sales & revenue…" variant="cards" />}>
        <SalesRevenueContent />
      </Suspense>
    </div>
  );
}

async function SalesRevenueContent() {
  await connection();
  const role = await getUserRole();
  const company = await getCompany();

  if (!hasPermission(role, PERM.FINANCE_VIEW) && !hasPermission(role, PERM.SALES_VIEW)) {
    return (
      <NoAccess what="the sales & revenue report" />
    );
  }

  const now = new Date();
  const from = new Date(now.getFullYear(), now.getMonth() - 11, 1);

  const [sales, projects] = await Promise.all([
    prisma.assetSale.findMany({
      where: {
        companyId: company.id,
        status: "ACTIVE",
        saleDate: { gte: from },
      },
      include: {
        customer: { select: { name: true } },
        project: { select: { id: true, name: true } },
        builtUnit: { select: { unitType: true } },
        payments: { select: { amount: true, paymentDate: true } },
      },
      orderBy: { saleDate: "asc" },
    }),
    prisma.project.findMany({
      where: { companyId: company.id, deletedAt: null },
      select: { id: true, name: true },
      orderBy: { name: "asc" },
    }),
  ]);

  // Build sale records for client-side filtering
  const saleRecords: SaleRecord[] = sales.map((s) => {
    const collected = s.payments.reduce((sum, p) => sum + toNum(p.amount), 0);
    return {
      id: s.id,
      saleNumber: s.saleNumber,
      customer: s.customer.name,
      projectId: s.project?.id ?? null,
      projectName: s.project?.name ?? "—",
      unitType: s.builtUnit?.unitType ?? null,
      salePrice: toNum(s.salePrice),
      collected,
      outstanding: toNum(s.salePrice) - collected,
      saleDate: s.saleDate.toISOString(),
      paymentDates: s.payments.map((p) => p.paymentDate.toISOString()),
    };
  });

  // Unit types present in the data
  const unitTypes = [...new Set(saleRecords.map((r) => r.unitType).filter(Boolean))] as string[];

  // Initial aggregations (all data, no filter)
  const totalSales = saleRecords.reduce((s, r) => s + r.salePrice, 0);
  const totalCollected = saleRecords.reduce((s, r) => s + r.collected, 0);
  const totalOutstanding = saleRecords.reduce((s, r) => s + r.outstanding, 0);

  return (
    <>
      <PageHeader
        title="Sales & Revenue"
        description="Asset sales, collections received, and outstanding receivables over the last 12 months (active sales only)."
        stats={[
          { label: "Sales value", value: formatCurrency(totalSales) },
          { label: "Collected", value: formatCurrency(totalCollected) },
          { label: "Outstanding", value: formatCurrency(totalOutstanding) },
          { label: "Deals", value: saleRecords.length },
        ]}
      />
      <SalesRevenueReport
        saleRecords={saleRecords}
        projects={projects.map((p) => ({ id: p.id, name: p.name }))}
        unitTypes={unitTypes}
      />
    </>
  );
}

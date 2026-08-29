import { Suspense } from "react";
import { connection } from "next/server";
import { prisma } from "@nirman/db";
import { getCompany, getUserRole, toNum } from "@/lib/server";
import { hasPermission, PERM } from "@/lib/roles";
import { MobileSkeletonList } from "@/components/mobile/mobile-skeleton";
import type { MobileColumnSpec } from "@/components/mobile/v2/export-share-bar";
import { MobileCustomersList, type CustomerListItem } from "./MobileCustomersList";
import { MobileCustomersLeadsTabs } from "./MobileCustomersLeadsTabs";

/**
 * /m/customers — mobile customer directory.
 *
 * Purpose: find a customer to call or sell to, see who owes you money,
 * and add new customers. This is the CRM entry point.
 *
 * Shows ALL customers (not just those with asset sales), including
 * customers with only material sales or no sales yet.
 */
export default function MobileCustomersPage() {
  return (
    <Suspense fallback={<MobileSkeletonList rows={8} />}>
      <MobileCustomersContent />
    </Suspense>
  );
}

async function MobileCustomersContent() {
  await connection();
  const company = await getCompany();
  const role = await getUserRole();
  const canCreate = hasPermission(role, PERM.SALES_MANAGE);
  const canEdit = hasPermission(role, PERM.SALES_MANAGE);
  const canDelete = hasPermission(role, PERM.SALES_MANAGE);

  // Fetch ALL customers for this company (not just those with asset sales)
  const [customers, leads] = await Promise.all([
    prisma.customer.findMany({
      where: { companyId: company.id, deletedAt: null },
      orderBy: { name: "asc" },
      include: {
        assetSales: {
          where: { companyId: company.id, status: "ACTIVE" },
          select: {
            salePrice: true,
            gstAmount: true,
            paymentStatus: true,
            payments: { where: { status: "RECEIVED" }, select: { amount: true } },
          },
        },
        materialSales: {
          where: { companyId: company.id, status: "ACTIVE" },
          select: {
            totalAmount: true,
            paymentStatus: true,
            payments: { select: { amount: true } },
          },
        },
      },
      take: 200,
    }),
    // Fetch leads so they show inside the customers section (client request)
    prisma.lead.findMany({
      where: { companyId: company.id, deletedAt: null, stage: { not: "LOST" } },
      orderBy: { createdAt: "desc" },
      take: 100,
      select: {
        id: true, name: true, phone: true, email: true,
        source: true, stage: true, priority: true, score: true,
        nextFollowUpAt: true, lastContactAt: true, convertedAt: true,
        createdAt: true, budgetMin: true, budgetMax: true,
        interestedUnitType: true,
        project: { select: { name: true } },
        assignedTo: { select: { name: true } },
      },
    }),
  ]);

  const rows: CustomerListItem[] = customers.map((c) => {
    const assetSales = c.assetSales;
    const materialSales = c.materialSales;
    const allSales = [...assetSales, ...materialSales];

    const totalValue =
      assetSales.reduce((s, a) => s + toNum(a.salePrice) + toNum(a.gstAmount), 0) +
      materialSales.reduce((s, m) => s + toNum(m.totalAmount), 0);

    const totalPaid =
      assetSales.reduce((s, a) => s + a.payments.reduce((ps, p) => ps + toNum(p.amount), 0), 0) +
      materialSales.reduce((s, m) => s + m.payments.reduce((ps, p) => ps + toNum(p.amount), 0), 0);

    const outstanding = totalValue - totalPaid;
    const dueCount = allSales.filter((s) => s.paymentStatus !== "PAID").length;
    const activeCount = allSales.length;

    // Worst payment status across all sales — drives the row badge.
    const paymentStatus =
      allSales.some((s) => s.paymentStatus === "PARTIAL") ? "PARTIAL"
      : allSales.some((s) => s.paymentStatus === "PENDING") ? "PENDING"
      : activeCount > 0 ? "PAID"
      : "NONE";

    return {
      id: c.id,
      name: c.name,
      phone: c.phone ?? null,
      email: c.email ?? null,
      gstin: c.gstin ?? null,
      activeCount,
      totalValue,
      totalPaid,
      outstanding,
      dueCount,
      paymentStatus,
    };
  });

  // Portfolio stats
  const totalOutstanding = rows.reduce((s, r) => s + r.outstanding, 0);
  const withDues = rows.filter((r) => r.dueCount > 0);
  const pipelineValue = rows.reduce((s, r) => s + r.totalValue, 0);

  // Lead rows for the inline leads tab
  const leadRows = leads.map((l) => ({
    id: l.id,
    name: l.name,
    phone: l.phone,
    email: l.email ?? null,
    source: l.source,
    stage: l.stage,
    priority: l.priority,
    score: l.score,
    projectName: l.project?.name ?? null,
    assignedToName: l.assignedTo?.name ?? null,
    nextFollowUpAt: l.nextFollowUpAt ? l.nextFollowUpAt.toISOString() : null,
    lastContactAt: l.lastContactAt ? l.lastContactAt.toISOString() : null,
    budgetMin: l.budgetMin ? toNum(l.budgetMin) : null,
    budgetMax: l.budgetMax ? toNum(l.budgetMax) : null,
    interestedUnitType: l.interestedUnitType,
    convertedAt: l.convertedAt ? l.convertedAt.toISOString() : null,
    createdAt: l.createdAt.toISOString(),
  }));

  return (
    <div>
      <MobileCustomersLeadsTabs
        customers={rows}
        leads={leadRows}
        canCreate={canCreate}
        canEdit={canEdit}
        canDelete={canDelete}
        customerStats={{
          customerCount: rows.length,
          withDues: withDues.length,
          totalOutstanding,
          pipelineValue,
        }}
        leadCount={leadRows.length}
      />
    </div>
  );
}

import { Suspense } from "react";
import { connection } from "next/server";
import { prisma } from "@nirman/db";
import { getCompany, getUserRole, toNum } from "@/lib/server";
import { hasPermission, PERM } from "@/lib/roles";
import { MobileSkeletonList } from "@/components/mobile/mobile-skeleton";
import { MobileExportShareBar } from "@/components/mobile/v2/export-share-bar";
import type { MobileColumnSpec } from "@/components/mobile/v2/export-share-bar";
import { MobileCustomersList, type CustomerListItem } from "./MobileCustomersList";

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

  // Fetch ALL customers for this company (not just those with asset sales)
  const customers = await prisma.customer.findMany({
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
  });

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

  return (
    <div>
      <MobileExportShareBar
        title="Customers"
        rows={rows as unknown as Record<string, unknown>[]}
        columns={[
          { key: "name", label: "Name" },
          { key: "phone", label: "Phone" },
          { key: "email", label: "Email" },
          { key: "totalValue", label: "Total Purchased", format: "currency" },
          { key: "totalPaid", label: "Total Paid", format: "currency" },
          { key: "outstanding", label: "Outstanding", format: "currency" },
        ] as MobileColumnSpec[]}
        summary={`${rows.length} customers · ${withDues.length} with dues`}
      />
      <MobileCustomersList
        items={rows}
        canCreate={canCreate}
        stats={{
          customerCount: rows.length,
          withDues: withDues.length,
          totalOutstanding,
          pipelineValue,
        }}
      />
    </div>
  );
}

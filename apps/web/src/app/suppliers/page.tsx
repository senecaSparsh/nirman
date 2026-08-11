import { Suspense } from "react";
import { connection } from "next/server";
import { prisma } from "@nirman/db";
import { getCompany, toNum, getUserRole } from "@/lib/server";
import { PERM, hasPermission } from "@/lib/roles";
import { PageHeader } from "@/components/page-header";
import { PageLoading } from "@/components/page-loading";
import { VendorsView } from "@/components/vendors/vendors-view";
import { formatCurrency } from "@/lib/utils";

import { NoAccess } from "@/components/no-access";
export default function VendorsPage() {
  return (
    <div className="space-y-6">
      <Suspense fallback={<PageLoading label="Loading vendors…" variant="list" />}>
        <VendorsContent />
      </Suspense>
    </div>
  );
}

async function VendorsContent() {
  await connection();
  const role = await getUserRole();
  const company = await getCompany();

  if (!hasPermission(role, PERM.PROCUREMENT_VIEW)) {
    return (
      <NoAccess what="vendors" />
    );
  }

  const perms = {
    canManage: hasPermission(role, PERM.PROCUREMENT_MANAGE),
  };

  const suppliers = await prisma.supplier.findMany({
    where: { deletedAt: null },
    orderBy: { name: "asc" },
    include: {
      purchaseOrders: {
        where: { companyId: company.id },
        orderBy: { createdAt: "desc" },
        take: 10,
        select: {
          id: true,
          poNumber: true,
          status: true,
          orderDate: true,
          total: true,
          gstTotal: true,
        },
      },
      _count: {
        select: {
          purchaseOrders: { where: { companyId: company.id } },
        },
      },
    },
  });

  const vendorRows = suppliers.map((s) => {
    const pos = s.purchaseOrders;
    const totalSpent = pos.reduce((sum, p) => sum + toNum(p.total), 0);
    const openPOs = pos.filter((p) => ["DRAFT", "APPROVED", "ORDERED", "PARTIAL"].includes(p.status)).length;
    return {
      id: s.id,
      name: s.name,
      gstin: s.gstin,
      phone: s.phone,
      email: s.email,
      address: s.address,
      balanceOwed: toNum(s.balanceOwed),
      leadTimeDays: s.leadTimeDays,
      totalPOs: s._count.purchaseOrders,
      openPOs,
      totalSpent,
      recentPOs: pos.map((p) => ({
        id: p.id,
        poNumber: p.poNumber,
        status: p.status,
        orderDate: p.orderDate.toISOString(),
        total: toNum(p.total),
        gst: toNum(p.gstTotal),
      })),
    };
  });

  const withDues = vendorRows.filter((v) => v.balanceOwed > 0).length;
  const totalOwed = vendorRows.reduce((s, v) => s + v.balanceOwed, 0);

  return (
    <>
      <PageHeader
        title="Vendors"
        description="Supplier directory, purchase history, outstanding balances — and auto-computed vendor ratings."
        stats={[
          { label: "Total", value: vendorRows.length, hint: "Total vendors in the directory." },
          { label: "With Dues", value: withDues, tone: withDues > 0 ? "warning" : "muted", hint: "Vendors with an unpaid balance for received goods." },
          { label: "Total Owed", value: formatCurrency(totalOwed), tone: totalOwed > 0 ? "danger" : "muted", hint: "Sum of all unpaid balances across vendors. This is money leaving the company." },
        ]}
      />
      <VendorsView vendors={vendorRows} permissions={perms} />
    </>
  );
}

import { Suspense } from "react";
import { connection } from "next/server";
import { prisma } from "@nirman/db";
import { getUserRole } from "@/lib/server";
import { PERM, hasPermission } from "@/lib/roles";
import { PageHeader } from "@/components/page-header";
import { CustomersView } from "@/components/sales/customers-view";
import { PageLoading } from "@/components/page-loading";
import type { CustomerRow } from "@/lib/types";

export const metadata = { title: "Customers · Nirman" };

export default function CustomersPage() {
  return (
    <div className="space-y-5">
      <PageHeader
        title="Customers"
        description="Customers who buy land parcels and built units."
      />
      <Suspense fallback={<PageLoading label="Loading customers…" />}>
        <CustomersContent />
      </Suspense>
    </div>
  );
}

async function CustomersContent() {
  await connection();
  const role = await getUserRole();

  if (!hasPermission(role, PERM.SALES_VIEW)) {
    return (
      <div className="rounded-xl border border-border bg-card p-6 text-meta text-muted-foreground">
        You don't have permission to view this module.
      </div>
    );
  }

  const customers = await prisma.customer.findMany({
    where: { deletedAt: null },
    orderBy: { name: "asc" },
    include: {
      _count: { select: { assetSales: { where: { status: "ACTIVE" } } } },
    },
  });

  const customerRows: CustomerRow[] = customers.map((c) => ({
    id: c.id,
    name: c.name,
    phone: c.phone,
    email: c.email,
    gstin: c.gstin,
    address: c.address,
    activeSales: c._count.assetSales,
  }));

  const perms = {
    canCreate: hasPermission(role, PERM.SALES_MANAGE),
    canEdit: hasPermission(role, PERM.SALES_MANAGE),
    canDelete: hasPermission(role, PERM.SALES_MANAGE),
  };

  return <CustomersView customers={customerRows} permissions={perms} />;
}

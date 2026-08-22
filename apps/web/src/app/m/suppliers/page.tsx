import { Suspense } from "react";
import { MobileSkeletonList } from "@/components/mobile/mobile-skeleton";
import { connection } from "next/server";
import { prisma } from "@nirman/db";
import { getCompany, getUserRole, toNum } from "@/lib/server";
import { PERM, hasPermission } from "@/lib/roles";
import { MobileExportShareBar } from "@/components/mobile/v2/export-share-bar";
import type { MobileColumnSpec } from "@/components/mobile/v2/export-share-bar";
import { MobileSuppliersList, type SupplierListItem } from "./MobileSuppliersList";

/**
 * /m/suppliers — mobile supplier directory. Shows outstanding dues and
 * PO counts so procurement and managers can check who they owe and how
 * active each supplier is.
 */
export default function MobileSuppliersPage() {
  return (
    <Suspense fallback={<MobileSkeletonList rows={6} />}>
      <MobileSuppliersContent />
    </Suspense>
  );
}

async function MobileSuppliersContent() {
  await connection();
  const company = await getCompany();
  const role = await getUserRole();
  const canCreate = hasPermission(role, PERM.PROCUREMENT_MANAGE);

  const suppliers = await prisma.supplier.findMany({
    where: { companyId: company.id, deletedAt: null },
    orderBy: { name: "asc" },
    take: 80,
    include: {
      _count: {
        select: {
          purchaseOrders: { where: { companyId: company.id } },
        },
      },
    },
  });

  const rows: SupplierListItem[] = suppliers.map((s) => ({
    id: s.id,
    name: s.name,
    gstin: s.gstin ?? null,
    phone: s.phone ?? null,
    poCount: s._count.purchaseOrders,
    balanceOwed: toNum(s.balanceOwed),
  }));

  const totalOwed = rows.reduce((s, sup) => s + sup.balanceOwed, 0);
  const withDues = rows.filter((s) => s.balanceOwed > 0);

  return (
    <div>
      <MobileExportShareBar
        title="Suppliers"
        rows={rows as unknown as Record<string, unknown>[]}
        columns={[
          { key: "name", label: "Name" },
          { key: "phone", label: "Phone" },
          { key: "poCount", label: "PO Count" },
          { key: "balanceOwed", label: "Balance", format: "currency" },
        ] as MobileColumnSpec[]}
        summary={`${rows.length} suppliers · ${withDues.length} with dues`}
      />
      <MobileSuppliersList
        items={rows}
        totalOwed={totalOwed}
        withDuesCount={withDues.length}
        canCreate={canCreate}
      />
    </div>
  );
}

import { prisma } from "@nirman/db";
import { getUserRole, getCompany } from "@/lib/server";
import { PERM, hasPermission } from "@/lib/roles";
import MobileNewSupplierReturnClient from "./MobileNewSupplierReturnClient";

/**
 * /m/supplier-returns/new — mobile supplier return creation.
 * Server wrapper that gates on PROCUREMENT_MANAGE permission and fetches
 * dropdown data (suppliers, locations, materials, purchase orders) from
 * Prisma directly.
 */
export default async function MobileNewSupplierReturnPage() {
  const role = await getUserRole();

  if (!hasPermission(role, PERM.PROCUREMENT_MANAGE)) {
    return (
      <div className="p-4">
        <div className="mb-4">
        </div>
        <p className="text-[0.875rem] font-semibold" style={{ color: "var(--color-ink-950)" }}>
          New Supplier Return
        </p>
        <p className="mt-2 text-[0.75rem]" style={{ color: "var(--color-ink-500)" }}>
          You don&apos;t have permission to create supplier returns.
        </p>
      </div>
    );
  }

  // Fetch dropdown data directly from Prisma (company-scoped, non-deleted)
  const company = await getCompany();
  const [suppliers, locations, materials, purchaseOrders] = await Promise.all([
    prisma.supplier.findMany({
      where: { deletedAt: null, companyId: company.id },
      select: { id: true, name: true },
      orderBy: { name: "asc" },
    }),
    prisma.stockLocation.findMany({
      where: { deletedAt: null, companyId: company.id },
      select: { id: true, name: true, type: true },
      orderBy: { name: "asc" },
    }),
    prisma.material.findMany({
      where: { deletedAt: null },
      select: { id: true, name: true, code: true, unit: true },
      orderBy: { name: "asc" },
    }),
    prisma.purchaseOrder.findMany({
      where: { status: { in: ["APPROVED", "ORDERED", "RECEIVED"] }, companyId: company.id },
      select: { id: true, poNumber: true, supplierId: true },
      orderBy: { createdAt: "desc" },
      take: 100,
    }),
  ]);

  return (
    <MobileNewSupplierReturnClient
      suppliers={suppliers}
      locations={locations}
      materials={materials}
      purchaseOrders={purchaseOrders}
    />
  );
}

import { prisma } from "@nirman/db";
import { getCompany } from "@/lib/server";
import { PERM } from "@/lib/roles";
import { MobileNewEntityPage } from "@/components/mobile/v2/new-entity-page";
import MobileNewSupplierReturnClient from "./MobileNewSupplierReturnClient";

/**
 * /m/supplier-returns/new — mobile supplier return creation.
 * Server wrapper that gates on PROCUREMENT_MANAGE permission and fetches
 * dropdown data (suppliers, locations, materials, purchase orders) from
 * Prisma directly.
 */
export default function MobileNewSupplierReturnPage() {
  return (
    <MobileNewEntityPage perm={PERM.PROCUREMENT_MANAGE} what="create supplier returns" permission="procurement.manage" fields={6}>
      {async () => {
        const company = await getCompany();

        // Fetch dropdown data directly from Prisma (company-scoped, non-deleted)
        const [suppliers, locations, materials, purchaseOrders, categories] = await Promise.all([
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
          prisma.materialCategory.findMany({
            where: { deletedAt: null },
            select: { id: true, name: true, unit: true },
            orderBy: { name: "asc" },
          }),
        ]);

        return (
          <MobileNewSupplierReturnClient
            suppliers={suppliers}
            locations={locations}
            materials={materials}
            purchaseOrders={purchaseOrders}
            categories={categories}
          />
        );
      }}
    </MobileNewEntityPage>
  );
}

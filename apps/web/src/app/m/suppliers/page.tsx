import { prisma } from "@nirman/db";
import { toNum } from "@/lib/server";
import { PERM } from "@/lib/roles";
import { MobileListPage } from "@/components/mobile/v2/list-page";
import {type MobileColumnSpec} from "@/components/mobile/v2/export-share-bar";
import { MobileSuppliersList, type SupplierListItem } from "./MobileSuppliersList";

/**
 * /m/suppliers — mobile supplier directory. Shows outstanding dues and
 * PO counts so procurement and managers can check who they owe and how
 * active each supplier is.
 */
export default function MobileSuppliersPage() {
  return (
    <MobileListPage managePerm={PERM.PROCUREMENT_MANAGE}>
      {async ({ company, canManage }) => {
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

        const exportColumns: MobileColumnSpec[] = [
          { key: "name", label: "Name" },
          { key: "phone", label: "Phone" },
          { key: "poCount", label: "PO Count" },
          { key: "balanceOwed", label: "Balance", format: "currency" },
        ];

        return (
          <MobileSuppliersList
            items={rows}
            totalOwed={totalOwed}
            withDuesCount={withDues.length}
            canCreate={canManage}
            exportTitle="Suppliers"
            exportRows={rows as unknown as Record<string, unknown>[]}
            exportColumns={exportColumns}
            exportSummary={`${rows.length} suppliers · ${withDues.length} with dues`}
          />
        );
      }}
    </MobileListPage>
  );
}

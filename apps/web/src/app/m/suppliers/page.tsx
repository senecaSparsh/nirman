import { prisma } from "@nirman/db";
import { toNum, getActionPermissions } from "@/lib/server";
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
    <MobileListPage perm={PERM.PROCUREMENT_VIEW} managePerm={PERM.PROCUREMENT_MANAGE} what="suppliers" permission="procurement.view">
      {async ({ company, canManage }) => {
        const actions = await getActionPermissions();
        const canCreate = actions?.canCreateSupplier ?? canManage;
        const BATCH_SIZE = 40;
        const suppliers = await prisma.supplier.findMany({
          where: { companyId: company.id, deletedAt: null },
          orderBy: [{ createdAt: "desc" }, { id: "desc" }],
          take: BATCH_SIZE + 1,
          include: {
            _count: {
              select: {
                purchaseOrders: { where: { companyId: company.id } },
              },
            },
          },
        });

        const hasMore = suppliers.length > BATCH_SIZE;
        const batch = hasMore ? suppliers.slice(0, BATCH_SIZE) : suppliers;
        const last = batch[batch.length - 1];
        const nextCursor = hasMore && last
          ? `${last.createdAt.toISOString()}|${last.id}`
          : null;

        const rows: SupplierListItem[] = batch.map((s) => ({
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
            canCreate={canCreate}
            loadMoreUrl="/api/mobile/list/suppliers"
            initialCursor={nextCursor}
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

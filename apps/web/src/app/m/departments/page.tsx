import { prisma } from "@nirman/db";
import { getActionPermissions } from "@/lib/server";
import { PERM } from "@/lib/roles";
import { MobileListPage } from "@/components/mobile/v2/list-page";
import {type MobileColumnSpec} from "@/components/mobile/v2/export-share-bar";
import { MobileDepartmentsList, type DepartmentListItem } from "./MobileDepartmentsList";

/**
 * /m/departments — mobile departments directory. Operational cost
 * centers (manufacturing lines, workshop, lab). Materials issued to
 * a department hit Operating Expenses (not WIP).
 */
export default function MobileDepartmentsPage() {
  return (
    <MobileListPage perm={PERM.INVENTORY_VIEW} managePerm={PERM.INVENTORY_MANAGE} what="departments" permission="inventory.view">
      {async ({ company, canManage }) => {
        const actions = await getActionPermissions();
        const departments = await prisma.department.findMany({
          where: { companyId: company.id, deletedAt: null },
          orderBy: { code: "asc" },
          include: {
            stockLocation: { select: { id: true, name: true } },
            _count: { select: { materialIssues: { where: { department: { deletedAt: null } } } } },
          },
        });

        const rows: DepartmentListItem[] = departments.map((d) => ({
          id: d.id,
          code: d.code,
          name: d.name,
          description: d.description,
          active: d.active,
          stockLocationName: d.stockLocation?.name ?? null,
          issueCount: d._count.materialIssues,
        }));

        const activeCount = rows.filter((d) => d.active).length;
        const withStockRoom = rows.filter((d) => d.stockLocationName).length;

        const exportColumns: MobileColumnSpec[] = [
          { key: "code", label: "Code" },
          { key: "name", label: "Department" },
          { key: "description", label: "Description" },
          { key: "stockLocationName", label: "Stock Room" },
          { key: "issueCount", label: "Issues" },
          { key: "active", label: "Status" },
        ];

        return (
          <MobileDepartmentsList
            items={rows}
            activeCount={activeCount}
            withStockRoom={withStockRoom}
            canManage={canManage}
            actions={actions}
            exportTitle="Departments"
            exportRows={rows as unknown as Record<string, unknown>[]}
            exportColumns={exportColumns}
            exportSummary={`${rows.length} departments · ${activeCount} active · ${withStockRoom} with stock room`}
          />
        );
      }}
    </MobileListPage>
  );
}
